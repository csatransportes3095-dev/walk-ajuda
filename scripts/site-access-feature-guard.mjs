import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const deliveryPath = 'server/siteAccessCodeDelivery.ts';
const routerPath = 'server/routers/customerPassword.ts';

function replaceOnce(source, added, original, label) {
  assert.equal(source.split(added).length - 1, 1, `Missing or modified approved fragment: ${label}`);
  return source.replace(added, original);
}

function gitBlob(source) {
  const bytes = Buffer.from(source);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function withoutCustomerLoginMessage(source) {
  source = replaceOnce(source,
    "purpose: 'site-access' | 'password-recovery' | 'customer-login' = 'site-access'",
    "purpose: 'site-access' | 'password-recovery' = 'site-access'", 'delivery purpose');
  source = replaceOnce(source,
    "  const accessDurationText = purpose === 'customer-login'\n"
      + "    ? 'Após confirmar, sua sessão seguirá a duração definida pelo administrador, ou até você sair.'\n"
      + "    : 'Após confirmar, seu acesso vale por até 24 horas, ou até você sair.';\n"
      + "  const accessDurationHtml = purpose === 'customer-login'\n"
      + "    ? '<p>Após a confirmação, sua sessão seguirá a duração definida pelo administrador, ou até você sair.</p>'\n"
      + "    : '<p>Após a confirmação, o acesso vale por até 24 horas, ou até você sair.</p>';\n",
    '', 'customer-login duration declarations');
  source = replaceOnce(source, '${accessDurationText}',
    'Após confirmar, seu acesso vale por até 24 horas, ou até você sair.', 'customer-login text interpolation');
  return replaceOnce(source, '    +accessDurationHtml\n',
    "    +'<p>Após a confirmação, o acesso vale por até 24 horas, ou até você sair.</p>'\n", 'customer-login HTML interpolation');
}

function withoutSessionPolicyProcedures(source) {
  source = replaceOnce(source,
    'import { readCustomerSessionPolicy, saveCustomerSessionPolicy } from "../customerSessionPolicy";\n',
    '', 'policy helper import');
  source = replaceOnce(source,
    'import { MIN_CUSTOMER_SESSION_HOURS, MAX_CUSTOMER_SESSION_HOURS } from "../../shared/customerSessionPolicy";\n',
    '', 'policy bounds import');
  return replaceOnce(source,
    '  getSessionPolicy: adminProcedure.query(async () => readCustomerSessionPolicy(await getDb())),\n'
      + '  updateSessionPolicy: adminProcedure\n'
      + '    .input(z.object({ hours: z.number().int().min(MIN_CUSTOMER_SESSION_HOURS).max(MAX_CUSTOMER_SESSION_HOURS) }))\n'
      + '    .mutation(async ({ input }) => saveCustomerSessionPolicy(await getDb(), input.hours)),\n',
    '', 'two bounded admin policy procedures');
}

/**
 * Only these two protected files have feature-specific exceptions. Everything
 * else must still pass the workflow's original full-file/function/route checks.
 * Normalization reverses exact additions, then compares the COMPLETE source.
 * Never normalize the baseline: existing behavior cannot be removed or changed.
 */
export function assertAuthorizedCustomerSessionFeatureChange(path, previous, current) {
  if (path !== deliveryPath && path !== routerPath) return false;
  if (current === previous) return true;
  if (path === deliveryPath) {
    // Retain the historical Outlook-only exception, but do not require those
    // old blobs when the file is unchanged or contains the separate feature.
    if (gitBlob(previous) === 'c538b625da08699030a85255c828b677dd10af8a'
      && gitBlob(current) === '7c2435e97c61d27aa8cb950902a06064cdf2db22') return true;
    assert.equal(withoutCustomerLoginMessage(current), previous,
      'Delivery changed outside the exact customer-login message addition');
  } else {
    assert.equal(withoutSessionPolicyProcedures(current), previous,
      'Customer router changed outside the two exact administrative policy procedures');
  }
  return true;
}
