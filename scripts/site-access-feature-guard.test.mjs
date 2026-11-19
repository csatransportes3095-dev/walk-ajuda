import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { test } from 'node:test';
import { assertAuthorizedCustomerSessionFeatureChange as check } from './site-access-feature-guard.mjs';

const base = process.env.PULL_REQUEST_BASE_SHA;
assert.match(base || '', /^[a-f0-9]{40}$/i, 'Provide the actual pull request base SHA for source snapshots');
const delivery = 'server/siteAccessCodeDelivery.ts';
const router = 'server/routers/customerPassword.ts';
const normalizeLines = source => source.replace(/\r\n/g, '\n');
const snapshots = new Map([delivery, router].map(path => [path, {
  previous: normalizeLines(execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' })),
  current: normalizeLines(fs.readFileSync(path, 'utf8')),
}]));
function tamper(path, original, replacement) {
  const { previous, current } = snapshots.get(path);
  assert(current.includes(original), `Snapshot missing mutation target: ${original}`);
  assert.throws(() => check(path, previous, current.replace(original, replacement)));
}

for (const path of [delivery, router]) {
  test(`${path}: accepts the reviewed whole-file delta against the real base`, () => {
    const { previous, current } = snapshots.get(path);
    assert.equal(check(path, previous, current), true);
  });
  test(`${path}: unchanged files do not require historical blobs`, () => {
    const { previous } = snapshots.get(path);
    assert.equal(check(path, previous, previous), true);
  });
  test(`${path}: rejects extra executable code outside the reviewed fragments`, () => {
    const { previous, current } = snapshots.get(path);
    assert.throws(() => check(path, previous, current + '\nthrow new Error("unreviewed change");\n'));
  });
}

test('rejects SMTP configuration and Resend endpoint changes', () => {
  tamper(delivery, 'socketTimeout:12000', 'socketTimeout:12001');
  tamper(delivery, 'https://api.resend.com/emails', 'https://unreviewed.example.test/emails');
});
test('rejects transport-order changes', () => {
  tamper(delivery, 'if (preferResend) {', 'if (!preferResend) {');
});
test('rejects default-purpose, code-validity and restricted-site lifetime changes', () => {
  tamper(delivery, "= 'site-access'): Promise<SiteCodeDelivery>", "= 'customer-login'): Promise<SiteCodeDelivery>");
  tamper(delivery, '10 minutos', '20 minutos');
  tamper(delivery, '24 horas', '48 horas');
});
test('rejects recovery-payload changes', () => {
  tamper(delivery, 'Não concede acesso nem libera serviços.', 'Concede acesso.');
});
test('rejects replacing the signed-admin guard or expanding accepted bounds', () => {
  tamper(router, 'getSessionPolicy: adminProcedure', 'getSessionPolicy: publicProcedure');
  tamper(router, 'updateSessionPolicy: adminProcedure', 'updateSessionPolicy: publicProcedure');
  tamper(router, '.max(MAX_CUSTOMER_SESSION_HOURS)', '.max(999999)');
});
test('rejects changes to existing OTP rules and unrelated router procedures', () => {
  tamper(router, 'const LOGIN_EMAIL_CODE_TTL_MS = 10 * 60 * 1000;', 'const LOGIN_EMAIL_CODE_TTL_MS = 20 * 60 * 1000;');
  tamper(router, 'authMode: publicProcedure.query', 'authMode: adminProcedure.query');
});
test('does not exempt any other protected file from its original comparison', () => {
  assert.equal(check('server/siteAccessIdentity.ts', 'original', 'changed'), false);
  assert.equal(check('server/_core/trpc.ts', 'original', 'changed'), false);
});
