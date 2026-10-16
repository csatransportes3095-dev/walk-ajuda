import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';
import { createCustomerSaveGate, reconcileConfirmedProfilePhoto, replaceConfirmedProfilePhoto } from '../client/src/lib/confirmedProfilePhotoSave.ts';

const oldUrl = 'https://assets.example.test/old.jpg';
const newUrl = 'https://assets.example.test/new.jpg';
const input = { id: 101, profilePhotoUrl: '' };
const saved = { id: 101, profilePhotoUrl: '' };
function cacheSpy() {
  const calls = [];
  return { calls, cache: { cancelReads: async () => { calls.push('cancel'); }, applyConfirmed: (id, url) => calls.push({ id, url }) } };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function queryClient() { return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); }

test('empty URL is a removal and cancellation precedes the acknowledged cache write', async () => {
  const { calls, cache } = cacheSpy();
  assert.equal(await reconcileConfirmedProfilePhoto(input, saved, cache), true);
  assert.deepEqual(calls, ['cancel', { id: 101, url: '' }]);
});
test('a server null also confirms an explicitly empty input', async () => {
  const { calls, cache } = cacheSpy();
  await reconcileConfirmedProfilePhoto(input, { ...saved, profilePhotoUrl: null }, cache);
  assert.deepEqual(calls[1], { id: 101, url: null });
});
test('an omitted photo never clears it during a phone-only save', async () => {
  const { calls, cache } = cacheSpy();
  assert.equal(await reconcileConfirmedProfilePhoto({ id: 101 }, { ...saved, profilePhotoUrl: oldUrl }, cache), false);
  assert.equal(calls.length, 0);
});
test('new photo requires the exact normalized value returned by the server', async () => {
  const { calls, cache } = cacheSpy();
  await reconcileConfirmedProfilePhoto({ id: 101, profilePhotoUrl: ` ${newUrl} ` }, { ...saved, profilePhotoUrl: newUrl }, cache);
  assert.deepEqual(calls[1], { id: 101, url: newUrl });
});
test('missing, wrong-customer, invalid and stale responses never update the cache', async () => {
  for (const response of [null, undefined, {}, { id: 101 }, { id: 102, profilePhotoUrl: '' }, { id: 101, profilePhotoUrl: false }, { id: 101, profilePhotoUrl: oldUrl }]) {
    const { calls, cache } = cacheSpy();
    await assert.rejects(reconcileConfirmedProfilePhoto(input, response, cache), /servidor/);
    assert.equal(calls.length, 0);
  }
});
test('cancellation error does not falsely apply a saved photo', async () => {
  let applied = false;
  await assert.rejects(reconcileConfirmedProfilePhoto(input, saved, {
    cancelReads: async () => { throw new Error('cache unavailable'); },
    applyConfirmed: () => { applied = true; },
  }), /cache unavailable/);
  assert.equal(applied, false);
});
test('cache update is immutable and preserves other customers and commercial fields', () => {
  const first = Object.freeze({ id: 101, profilePhotoUrl: oldUrl, vipActive: true, openOrders: [1] });
  const second = Object.freeze({ id: 102, profilePhotoUrl: oldUrl, vipActive: false });
  const rows = Object.freeze([first, second]);
  const updated = replaceConfirmedProfilePhoto(rows, 101, '');
  assert.equal(updated[0].profilePhotoUrl, '');
  assert.equal(updated[0].vipActive, true);
  assert.equal(updated[0].openOrders, first.openOrders);
  assert.equal(updated[1], second);
  assert.equal(first.profilePhotoUrl, oldUrl);
});
test('a missing cache is not fabricated from a partial mutation response', () => {
  assert.equal(replaceConfirmedProfilePhoto(undefined, 101, ''), undefined);
});
test('same-tick repeated clicks produce one save until completion, then allow another', () => {
  const gate = createCustomerSaveGate();
  assert.equal(gate.tryStart(), true);
  assert.equal(gate.isBusy(), true);
  assert.equal(gate.tryStart(), false);
  gate.finish();
  assert.equal(gate.isBusy(), false);
  assert.equal(gate.tryStart(), true);
  gate.finish();
});
test('baseline reproduction: a late list read can display the old photo again', async () => {
  const client = queryClient(); const wait = deferred(); const key = ['customers', 'list'];
  client.setQueryData(key, [{ id: 101, profilePhotoUrl: oldUrl }]);
  const pending = client.fetchQuery({ queryKey: key, queryFn: () => wait.promise });
  client.setQueryData(key, [saved]);
  wait.resolve([{ id: 101, profilePhotoUrl: oldUrl }]);
  await pending;
  assert.equal(client.getQueryData(key)[0].profilePhotoUrl, oldUrl);
  client.clear();
});
test('actual QueryClient: an old read cannot undo a confirmed removal even without AbortSignal', async () => {
  const client = queryClient(); const wait = deferred(); const key = ['customers', 'list'];
  client.setQueryData(key, [{ id: 101, profilePhotoUrl: oldUrl }]);
  const pending = client.fetchQuery({ queryKey: key, queryFn: () => wait.promise }).catch(() => undefined);
  await reconcileConfirmedProfilePhoto(input, saved, {
    cancelReads: () => client.cancelQueries({ queryKey: key }),
    applyConfirmed: (id, url) => client.setQueryData(key, rows => replaceConfirmedProfilePhoto(rows, id, url)),
  });
  wait.resolve([{ id: 101, profilePhotoUrl: oldUrl }]);
  await pending; await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.getQueryData(key)[0].profilePhotoUrl, '');
  client.clear();
});
test('future fresh server data is not hidden by a permanent local photo override', async () => {
  const client = queryClient(); const key = ['customers', 'list'];
  client.setQueryData(key, [saved]);
  await client.fetchQuery({ queryKey: key, queryFn: async () => [{ ...saved, profilePhotoUrl: newUrl }] });
  assert.equal(client.getQueryData(key)[0].profilePhotoUrl, newUrl);
  client.clear();
});

// Exercise the actual existing backend function, not a mocked updateCustomer.
// Only the database transport is simulated; no production data or credentials are used.
function backendHarness() {
  const source = readFileSync('server/db.ts', 'utf8');
  const start = source.indexOf('export async function updateCustomer(');
  const end = source.indexOf('export async function deleteCustomer(', start);
  assert.ok(start >= 0 && end > start);
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const writes = []; let row = { id: 101, profilePhotoUrl: oldUrl, phone: '11999990000' };
  const db = {
    update: () => ({ set: values => ({ where: async where => { assert.equal(where.id, 101); writes.push({ ...values }); row = { ...row, ...values }; } }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ ...row }] }) }) }),
    execute: async () => [[]],
  };
  const context = { exports: {}, getDb: async () => db, customers: { id: 'id' }, eq: (_column, id) => ({ id }), sql: () => ({}), normalizeMainCustomerPhone: value => String(value).replace(/\D/g, '') };
  vm.runInNewContext(js, context);
  return { update: context.exports.updateCustomer, writes };
}
test('actual backend updateCustomer persists and returns an empty photo after one write', async () => {
  const h = backendHarness();
  const result = await h.update(101, { profilePhotoUrl: '' });
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].profilePhotoUrl, '');
  assert.equal(result.profilePhotoUrl, '');
});
test('actual backend updateCustomer preserves the photo when the field is omitted', async () => {
  const h = backendHarness();
  const result = await h.update(101, { name: 'Test Customer' });
  assert.equal(h.writes.length, 1);
  assert.equal(Object.hasOwn(h.writes[0], 'profilePhotoUrl'), false);
  assert.equal(result.profilePhotoUrl, oldUrl);
});

// Execute the callback actually wired into AdminCustomers, with UI/network adapters.
const uiSource = readFileSync('client/src/pages/AdminCustomers.tsx', 'utf8');
function callbackHarness() {
  const ast = ts.createSourceFile('AdminCustomers.tsx', uiSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'updateMut') {
      callback = node.initializer.arguments[0].properties.find(p => p.name?.getText(ast) === 'onSuccess').initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(callback);
  const state = { editing: 101, rows: [{ ...saved, profilePhotoUrl: oldUrl }], successes: [], errors: [], invalidations: 0 };
  const context = {
    exports: {}, editingId: 101, reconcileConfirmedProfilePhoto, replaceConfirmedProfilePhoto,
    profilePhotoUtils: { customers: {
      list: { cancel: async () => {}, setData: (_input, fn) => { state.rows = fn(state.rows); } },
      invalidate: async () => { state.invalidations++; },
    }, orderStatus: { listOrders: { cancel: async () => {}, invalidate: async () => { state.invalidations++; } } } },
    setFailedProfilePhotoIds: fn => fn(new Map()), setEditProfilePhotoUrl: () => {}, setEditOriginal: fn => fn({ profilePhotoUrl: oldUrl }),
    setEditingId: fn => { state.editing = fn(state.editing); },
    toast: { success: message => state.successes.push(message), error: message => state.errors.push(message) },
  };
  const js = ts.transpileModule(`export const run = ${callback};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, context);
  return { run: context.exports.run, state };
}
test('actual UI callback updates an empty photo and closes only after confirmation', async () => {
  const h = callbackHarness(); await h.run(saved, input);
  assert.equal(h.state.rows[0].profilePhotoUrl, '');
  assert.equal(h.state.editing, null);
  assert.equal(h.state.successes.length, 1);
  assert.equal(h.state.errors.length, 0);
  assert.equal(h.state.invalidations, 2);
});
test('actual UI callback preserves the editor and never reports success for stale photo', async () => {
  const h = callbackHarness(); await h.run({ ...saved, profilePhotoUrl: oldUrl }, input);
  assert.equal(h.state.editing, 101);
  assert.equal(h.state.rows[0].profilePhotoUrl, oldUrl);
  assert.equal(h.state.successes.length, 0);
  assert.equal(h.state.errors.length, 1);
});
test('real form distinguishes full save, preserves empty payload and guards repeated writes', () => {
  assert.ok(uiSource.includes("if (changed('profilePhotoUrl', profilePhotoUrl)) payload.profilePhotoUrl = profilePhotoUrl;"));
  assert.ok(uiSource.includes('onSettled: () => { customerSaveGate.finish(); }'));
  assert.equal(uiSource.split('if (!customerSaveGate.tryStart()) return;').length - 1, 2);
  assert.ok(uiSource.includes('<fieldset disabled={updateMut.isPending}'));
  assert.ok(uiSource.includes('"Salvar alterações"'));
  assert.ok(uiSource.includes('"SALVAR TELEFONE"'));
});
