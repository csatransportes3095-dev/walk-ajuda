import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OrderNoteAutosave, getOrderNoteAutosave } from '../client/src/lib/orderNoteAutosave.ts';

const microtasks = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function clock(t) {
  let now = 0, sequence = 0;
  const timers = new Map();
  const oldSet = globalThis.setTimeout, oldClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, delay = 0) => { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  t.after(() => { globalThis.setTimeout = oldSet; globalThis.clearTimeout = oldClear; });
  return { async tick(ms) {
    const end = now + ms;
    for (let limit = 0; limit < 1000; limit++) {
      await microtasks();
      const next = [...timers].filter(([, v]) => v.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) { now = end; await microtasks(); return; }
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    throw new Error('Timer loop did not settle');
  } };
}
function queue(t, save, delays = [2000, 5000, 15000]) {
  const q = new OrderNoteAutosave(save, 600, 3000, delays);
  // Emulate a mounted React subscriber. Clean drafts are released on unmount.
  t.after(q.subscribe(() => {}));
  return q;
}

test('initial query/read never writes a note', async t => {
  const c = clock(t); const calls = []; const q = queue(t, async (...args) => { calls.push(args); });
  assert.equal(q.text(1, 'existing note'), 'existing note');
  await c.tick(10000); assert.equal(calls.length, 0); assert.equal(q.hasPending(), false);
});
test('typing and pasting text debounce to the latest payload', async t => {
  const c = clock(t); const calls = []; const q = queue(t, async (...args) => { calls.push(args); });
  q.change(1, 'a', ''); await c.tick(300); q.change(1, 'pasted text\nwith lines', '');
  await c.tick(599); assert.equal(calls.length, 0); await c.tick(1);
  assert.deepEqual(calls, [[1, 'pasted text\nwith lines']]); assert.equal(q.status(1), 'saved');
});
test('clearing all text is saved, not silently ignored', async t => {
  clock(t); const calls = []; const q = queue(t, async (...args) => { calls.push(args); });
  q.change(2, '', 'old text'); await q.flush(2);
  assert.deepEqual(calls, [[2, '']]); assert.equal(q.hasPending(), false);
});
test('one request at a time per block, no stale overwrite', async t => {
  clock(t); const first = deferred(); const calls = [];
  const q = queue(t, async (id, content) => { calls.push([id,content]); if (calls.length === 1) await first.promise; });
  q.change(1, 'first', ''); const finished = q.flush(1); await microtasks();
  q.change(1, 'middle', ''); q.change(1, 'latest', ''); void q.flush(1);
  assert.deepEqual(calls, [[1,'first']]); assert.equal(q.text(1, ''), 'latest');
  first.resolve(); await finished;
  assert.deepEqual(calls, [[1,'first'],[1,'latest']]); assert.equal(q.status(1), 'saved');
});
test('reverting to original while a save is in flight persists the revert', async t => {
  clock(t); const first = deferred(); const calls = [];
  const q = queue(t, async (id, content) => { calls.push(content); if (calls.length === 1) await first.promise; });
  q.change(1, 'changed', 'original'); const finished = q.flush(1); await microtasks();
  q.change(1, 'original', 'original'); first.resolve(); await finished;
  assert.deepEqual(calls, ['changed','original']);
});
test('different blocks remain independent', async t => {
  clock(t); const first = deferred(); const calls = [];
  const q = queue(t, async (id, text) => { calls.push([id,text]); if (id === 1) await first.promise; });
  q.change(1,'one',''); const pending = q.flush(1); q.change(2,'two',''); await q.flush(2);
  assert.equal(q.status(2),'saved'); assert.equal(q.status(1),'saving'); first.resolve(); await pending;
  assert.deepEqual(calls,[[1,'one'],[2,'two']]);
});
test('blur/unmount flush does not wait for debounce', async t => {
  clock(t); const calls = []; const q = queue(t, async (...args) => { calls.push(args); });
  q.change(1,'before leaving',''); await q.flushAll(); assert.deepEqual(calls,[[1,'before leaving']]);
});
test('image upload is pending until its marker is persisted', async t => {
  clock(t); const saved = deferred(); const calls = [];
  const q = queue(t, async (...args) => { calls.push(args); await saved.promise; });
  assert.equal(q.beginUpload(9,'intro'),true); assert.equal(q.beginUpload(9,'intro'),false);
  assert.equal(q.hasPending(),true); assert.equal(q.uploading(9),true);
  q.change(9,'intro\n[img:https://example.test/photo.png]\n','intro',true); q.endUpload(9);
  await microtasks(); assert.equal(q.hasPending(),true); assert.equal(q.status(9),'saving');
  saved.resolve(); await microtasks(); assert.equal(q.status(9),'saved'); assert.equal(q.hasPending(),false);
  assert.deepEqual(calls,[[9,'intro\n[img:https://example.test/photo.png]\n']]);
});
test('temporary failure retains draft and retries automatically', async t => {
  const c = clock(t); let attempts = 0;
  const q = queue(t, async () => { if (++attempts === 1) throw new Error('offline'); });
  q.change(1,'unsaved','old'); await q.flush(1);
  assert.equal(q.status(1),'error'); assert.equal(q.text(1,'old'),'unsaved'); assert.equal(q.hasPending(),true);
  await c.tick(2000); assert.equal(attempts,2); assert.equal(q.status(1),'saved');
});
test('automatic retries are bounded; manual retry sends latest draft', async t => {
  const c = clock(t); let failing = true; const calls = [];
  const q = queue(t, async (id,text) => { calls.push(text); if (failing) throw new Error('offline'); });
  q.change(1,'a',''); await q.flush(1); await c.tick(30000);
  assert.equal(calls.length,4); assert.equal(q.status(1),'error');
  failing=false; q.change(1,'latest',''); await q.flush(1); assert.equal(calls.at(-1),'latest'); assert.equal(q.status(1),'saved');
});
test('authorization failures are not retried automatically', async t => {
  const c = clock(t); let calls = 0;
  const q = queue(t, async () => { calls++; throw { data: { code: 'UNAUTHORIZED' } }; });
  q.change(1,'a',''); await q.flush(1); await c.tick(60000); assert.equal(calls,1); assert.equal(q.status(1),'error');
});
test('deletion cancels queued saves and rejects late image callbacks', async t => {
  const c = clock(t); const calls = []; const q = queue(t, async (...args) => { calls.push(args); });
  q.change(1,'draft',''); q.beginUpload(1,''); q.discard(1);
  q.change(1,'[img:https://example.test/late.png]','',true); q.endUpload(1);
  await c.tick(10000); assert.equal(calls.length,0); assert.equal(q.hasPending(),false); assert.equal(q.isRemoved(1),true);
});
test('deletion during an outstanding request prevents subsequent writes', async t => {
  clock(t); const first = deferred(); const calls = [];
  const q = queue(t, async (id, text) => { calls.push(text); await first.promise; });
  q.change(1,'one',''); const done = q.flush(1); await microtasks(); q.change(1,'two',''); q.discard(1); first.resolve(); await done;
  assert.deepEqual(calls,['one']); assert.equal(q.hasPending(),false);
});
test('continuous typing still saves within the maximum wait', async t => {
  const c = clock(t); const calls = []; const q = queue(t, async (...args) => { calls.push(args); });
  for (let i=0;i<6;i++) { q.change(1, String(i), ''); await c.tick(500); }
  assert.deepEqual(calls,[[1,'5']]);
});
test('remount shares pending queue; orders and query clients stay isolated', async t => {
  clock(t); const owner={}; const calls=[]; const save=async (...args) => { calls.push(args); };
  const a=getOrderNoteAutosave(owner,100,save); const unsubscribe=a.subscribe(()=>{});
  a.change(1,'order 100',''); unsubscribe();
  const b=getOrderNoteAutosave(owner,100,save); const c=getOrderNoteAutosave(owner,200,save);
  assert.equal(a,b); assert.notEqual(b,c); assert.notEqual(b,getOrderNoteAutosave({},100,save));
  assert.equal(b.text(1,''),'order 100'); await a.flushAll(); assert.deepEqual(calls,[[1,'order 100']]);
});
test('acknowledged drafts are released when editor unmounts', async t => {
  clock(t); const q=new OrderNoteAutosave(async()=>{}); const unsubscribe=q.subscribe(()=>{});
  q.change(1,'saved','original'); await q.flushAll(); assert.equal(q.text(1,'original'),'saved');
  unsubscribe(); assert.equal(q.text(1,'newer server content'),'newer server content');
});
test('component wiring includes text, image, blur, status and no empty-text guard', () => {
  const component=readFileSync(new URL('../client/src/components/NotesTab.tsx',import.meta.url),'utf8');
  assert.match(component,/onChange=\{e => autosave\.change\(block\.id, e\.target\.value, block\.content\)\}/);
  assert.match(component,/onBlur=\{\(\) => \{ void autosave\.flush/);
  assert.match(component,/autosave\.change\(blockId, newText, original, true\)/);
  assert.match(component,/role="status"/); assert.match(component,/key=\{registrationId\}/);
  assert.doesNotMatch(component,/if \(!content\.trim\(\)\) return|saveBlockMut|setLocalTexts/);
});
