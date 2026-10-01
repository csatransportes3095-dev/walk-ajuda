import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const encoded = [1, 2].map(n => fs.readFileSync(`scripts/order-login-new/patch-${n}.txt`, 'utf8').trim()).join('')
  .replace('QPliWZZr', 'QPliWZr').replace('DDapGaGa2q', 'DDapGa2q');
const raw = inflateSync(Buffer.from(encoded, 'base64'));
if (hash(raw) !== '19c63144bdf9a8140fef2409be4175985e0a4f179e9dcd58ffb4488ff5947595') throw new Error('Implementation payload checksum mismatch. No files changed.');
const payload = JSON.parse(raw.toString('utf8'));
const writes = new Map();
const allowed = new Set([
  'client/src/components/AuthenticatorQrAdminField.tsx', 'client/src/pages/AdminOrders.tsx',
  'client/src/pages/OrderTracking.tsx', 'drizzle/schema.ts', 'scripts/render-start.sh',
  'server/routers.ts', 'client/src/components/OrderLoginExtrasFields.tsx',
  'client/src/styles/order-login-layout.css', 'scripts/apply-order-login-improvements-migration.ts',
  'server/orderLoginDefaults.ts', 'server/orderLoginImprovements.test.ts', 'shared/orderLoginPresentation.ts',
]);
for (const [file, change] of Object.entries(payload.changes)) {
  if (!allowed.has(file)) throw new Error(`Unapproved path: ${file}`);
  const original = fs.readFileSync(file, 'utf8');
  if (hash(original) === change.after) continue;
  if (hash(original) !== change.before) throw new Error(`Source changed since review: ${file}`);
  const lines = original.split('\n');
  for (const [start, end, replacement] of [...change.edits].reverse()) lines.splice(start, end - start, ...replacement);
  const result = lines.join('\n');
  if (hash(result) !== change.after) throw new Error(`Result checksum mismatch: ${file}`);
  writes.set(file, result);
}
for (const [file, content] of Object.entries(payload.newFiles)) {
  if (!allowed.has(file)) throw new Error(`Unapproved path: ${file}`);
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, 'utf8') !== content) throw new Error(`New file has unrelated edits: ${file}`);
  } else writes.set(file, content);
}
// All original and resulting files are validated before writing anything.
for (const [file, content] of writes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`Prepared ${file}`);
}
console.log(`Order login implementation ready: ${writes.size} writes. No production database used.`);
