// Apply only readable, reviewed unified diffs to the exact inspected source.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = 'scripts/status-scope-review/';
const hashes = JSON.parse(fs.readFileSync(root + 'base-hashes.json', 'utf8'));
for (const [file, expected] of Object.entries(hashes)) {
  const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) throw new Error(`Reviewed source changed: ${file}. Nothing applied.`);
}
const patches = ['backend.patch', 'frontend.patch', 'compat.patch'].map(file => root + file);
execFileSync('git', ['apply', '--unidiff-zero', '--check', ...patches], { stdio: 'inherit' });
execFileSync('git', ['apply', '--unidiff-zero', ...patches], { stdio: 'inherit' });
fs.mkdirSync('/tmp/status-reviewed-source', { recursive: true });
for (const file of Object.keys(hashes)) {
  const target = '/tmp/status-reviewed-source/' + file;
  fs.mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  fs.copyFileSync(file, target);
}
console.log('Applied reviewed status membership changes; no production data used.');
