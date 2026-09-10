import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'client/src/pages/AdminCustomers.tsx');
let source = fs.readFileSync(file, 'utf8');

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`[admin-customers-referral-photo-stack] ${label}: trecho esperado nao encontrado.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  `    const counts = new Map<number, number>();`,
  `    const counts = new Map<number, number>();\n    const referredByIndicator = new Map<number, Customer[]>();`,
  'mapa de fotos dos indicados'
);

replaceRequired(
  `      counts.set(referrer.id, (counts.get(referrer.id) || 0) + 1);`,
  `      counts.set(referrer.id, (counts.get(referrer.id) || 0) + 1);\n      const referredList = referredByIndicator.get(referrer.id) || [];\n      referredList.push(referredCustomer);\n      referredByIndicator.set(referrer.id, referredList);`,
  'agrupar indicados por indicador'
);

replaceRequired(
  `    return { counts, options };`,
  `    return { counts, options, referredByIndicator };`,
  'retorno das fotos dos indicados'
);

replaceRequired(
  `  const getReferralCount = (customer: Customer) => referralSummary.counts.get(customer.id) || 0;`,
  `  const getReferralCount = (customer: Customer) => referralSummary.counts.get(customer.id) || 0;\n  const getReferredCustomers = (customer: Customer) => referralSummary.referredByIndicator.get(customer.id) || [];`,
  'helper dos indicados'
);

replaceRequired(
  `                        <Users className="h-3.5 w-3.5" />\n                        <span>Indicou</span>\n                        <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[11px] text-emerald-200">{getReferralCount(c)}</span>`,
  `                        <div className="flex -space-x-1.5">\n                          {getReferredCustomers(c).slice(0, 3).map((referredCustomer) => (\n                            referredCustomer.profilePhotoUrl && !failedProfilePhotoIds.has(referredCustomer.id) ? (\n                              <img\n                                key={referredCustomer.id}\n                                loading="lazy"\n                                decoding="async"\n                                src={getProfilePhotoDisplayUrl(referredCustomer.profilePhotoUrl)}\n                                alt={'Foto de ' + referredCustomer.name}\n                                className="h-6 w-6 rounded-full border-2 border-emerald-950 bg-muted object-cover shadow"\n                                onError={() => setFailedProfilePhotoIds((previous) => new Set(previous).add(referredCustomer.id))}\n                                title={referredCustomer.name}\n                              />\n                            ) : (\n                              <span\n                                key={referredCustomer.id}\n                                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-emerald-950 bg-emerald-900 text-emerald-200 shadow"\n                                title={referredCustomer.name + ' - sem foto cadastrada'}\n                              >\n                                <ImageIcon className="h-3 w-3" />\n                              </span>\n                            )\n                          ))}\n                          {getReferralCount(c) > 3 && (\n                            <span className="flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-emerald-950 bg-emerald-800 px-1 text-[8px] font-black text-emerald-100 shadow">\n                              +{getReferralCount(c) - 3}\n                            </span>\n                          )}\n                        </div>\n                        <Users className="h-3.5 w-3.5" />\n                        <span>Indicou</span>\n                        <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[11px] text-emerald-200">{getReferralCount(c)}</span>`,
  'miniaturas dos indicados no indicador'
);

fs.writeFileSync(file, source);
console.log('[admin-customers-referral-photo-stack] OK: indicador mostra fotos dos indicados + total + filtro.');
