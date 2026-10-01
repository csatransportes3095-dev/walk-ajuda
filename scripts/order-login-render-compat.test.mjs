// No application server, credentials, database or production data are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function fixture(files, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'order-login-build-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    const exec = script => execFileSync(process.execPath, [path.join(dir, script)], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const get = name => fs.readFileSync(path.join(dir, name), 'utf8');
    run({ dir, exec, get });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const reload = 'scripts/patch-admin-login-data-reload.mjs';
const orders = 'client/src/pages/AdminOrders.tsx';
for (const [name, options] of [
  ['legacy', '{ enabled: expandedId !== null && activeTab[expandedId!] === "status" }'],
  ['ordered', '{ enabled: expandedId !== null && (!activeTab[expandedId!] || activeTab[expandedId!] === "status"), staleTime: 0, refetchOnWindowFocus: true }'],
]) {
  test(`reload patch supports ${name} query and is repeatable`, () => {
    const original = `function ReferrerLookup() {}\n  const loginDataQuery = trpc.loginData.get.useQuery(\n    { registrationId: expandedNumericId },\n    ${options}\n  );\nconst cnhCode = '012345';\n`;
    fixture({ [reload]: read(reload), [orders]: original }, ({ exec, get }) => {
      exec(reload); const first = get(orders); exec(reload);
      assert.equal(get(orders), first);
      assert.equal(first.match(/const isExpandedStatusTab/g)?.length, 1);
      assert.ok(first.includes('refetchOnMount: true'));
      assert.ok(first.includes("const cnhCode = '012345'"));
    });
  });
}
test('reload patch still refuses unknown source without writing', () => {
  const original = 'const unexpected = true;';
  fixture({ [reload]: read(reload), [orders]: original }, ({ exec, get }) => {
    assert.throws(() => exec(reload)); assert.equal(get(orders), original);
  });
});

test('history patch preserves preceding global group routes and is repeatable', () => {
  const patch = 'scripts/patch-email-generator-history-ownership-20260915.mjs';
  const escape = 'scripts/fix-email-history-patch-runtime-escape-20260915.mjs';
  const generator = 'client/src/components/AdminEmailGenerator.tsx';
  const router = 'server/routers.ts';
  const preceding = '    getGlobalGroup: adminProcedure.query(() => null),\n    setGlobalGroup: adminProcedure.mutation(() => null),\n';
  const original = '  loginData: router({\n' + preceding + '    // Admin busca dados de login de um pedido\n    get: adminProcedure.query(() => null),\n  }),';
  fixture({ [patch]: read(patch), [escape]: read(escape), [generator]: read(generator), [router]: original }, ({ exec, get }) => {
    exec(escape); exec(patch);
    const first = get(router); const client = get(generator);
    exec(patch);
    assert.equal(get(router), first); assert.equal(get(generator), client);
    assert.ok(first.includes(preceding));
    assert.equal(first.match(/emailHistory: adminProcedure/g)?.length, 1);
    assert.equal(first.match(/syncEmailHistory: adminProcedure/g)?.length, 1);
    assert.ok(first.includes('get: adminProcedure.query(() => null)'));
    assert.ok(client.includes('trpc.loginData.emailHistory.useQuery'));
  });
});

for (const layout of ['ordered', 'legacy']) {
  test(`mobile patch supports ${layout} layout without dropping QR controls`, () => {
    const patch = 'scripts/patch-admin-orders-mobile-login-layout-20260915.mjs';
    const auth = 'client/src/components/OrderLoginAuthenticatorCode.tsx';
    const qr = 'client/src/components/AuthenticatorQrAdminField.tsx';
    const css = 'client/src/index.css';
    const source = layout === 'ordered' ? read(orders) : read(orders).replaceAll('className="order-login-layout ', 'className="');
    fixture({ [patch]: read(patch), [orders]: source, [auth]: read(auth), [qr]: read(qr), [css]: '' }, ({ exec, get }) => {
      exec(patch);
      const first = Object.fromEntries([orders, auth, qr, css].map(file => [file, get(file)]));
      exec(patch);
      for (const [file, text] of Object.entries(first)) assert.equal(get(file), text);
      assert.equal(get(orders).match(/admin-order-login-mobile/g)?.length, 3);
      if (layout === 'ordered') assert.equal(get(orders).match(/className="order-login-layout /g)?.length, 3);
      assert.equal(get(orders).match(/<OrderLoginCnhField /g)?.length, 3);
      assert.equal(get(orders).match(/<OrderLoginGlobalGroup /g)?.length, 3);
      for (const control of ['Ampliar', 'Colar print', 'Trocar', 'Excluir']) assert.ok(get(qr).includes(control));
      assert.ok(get(qr).includes('max-h-56 max-w-full object-contain'));
    });
  });
}
