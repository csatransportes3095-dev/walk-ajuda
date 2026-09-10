import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'client/src/pages/AdminCustomers.tsx');
let source = fs.readFileSync(file, 'utf8');

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`[admin-customers-referrer-photo] ${label}: trecho esperado nao encontrado.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  `  const customers: Customer[] = (customersQuery.data || []) as unknown as Customer[];\n\n  const sortedCustomers`,
  `  const customers: Customer[] = (customersQuery.data || []) as unknown as Customer[];\n\n  // Referencia visual local: liga cada cliente ao cadastro do indicador sem nova consulta ao servidor.\n  const normalizeReferrerName = (value: unknown) => String(value ?? '')\n    .normalize('NFD')\n    .replace(/[\\u0300-\\u036f]/g, '')\n    .trim()\n    .replace(/\\s+/g, ' ')\n    .toUpperCase();\n\n  const referrerCustomerIndex = useMemo(() => {\n    const byPhone = new Map<string, Customer>();\n    const byName = new Map<string, Customer>();\n    for (const customer of customers) {\n      const phone = normalizeLoanCardPhone(customer.phone);\n      const name = normalizeReferrerName(customer.name);\n      if (phone) byPhone.set(phone, customer);\n      if (name) byName.set(name, customer);\n    }\n    return { byPhone, byName };\n  }, [customers]);\n\n  const getReferrerCustomer = (customer: Customer) => {\n    const phone = normalizeLoanCardPhone(customer.referredByPhone);\n    if (phone) {\n      const byPhone = referrerCustomerIndex.byPhone.get(phone);\n      if (byPhone) return byPhone;\n    }\n    const name = normalizeReferrerName(customer.referredBy || (customer as any).resolvedReferrerName || '');\n    return name ? referrerCustomerIndex.byName.get(name) : undefined;\n  };\n\n  const sortedCustomers`,
  'indice local do indicador'
);

const detailsButton = `                  <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toggleCustomerDetails(c.id); }} className="mt-2 w-full touch-manipulation rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2.5 text-[11px] font-bold text-cyan-100 transition-colors hover:bg-cyan-500/10 active:bg-cyan-500/20">`;

const referralCard = `                  {c.referredBy !== 'Não informou' && (c.referredBy || (c as any).resolvedReferrerName || c.referredByPhone) && (() => {\n                    const referrerCustomer = getReferrerCustomer(c);\n                    const referralPhone = normalizeLoanCardPhone(c.referredByPhone);\n                    const referrerName = String(c.referredBy || (c as any).resolvedReferrerName || referrerCustomer?.name || '').trim();\n                    const fallbackLabel = referralPhone\n                      ? referralPhone.replace(/([0-9]{2})([0-9]{5})([0-9]{4})/, '($1) $2-$3')\n                      : 'Indicador';\n                    const displayName = referrerName || fallbackLabel;\n                    return (\n                      <div className="mt-2 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/[0.06] px-2 py-1.5 text-[11px] text-green-300">\n                        {referrerCustomer?.profilePhotoUrl && !failedProfilePhotoIds.has(referrerCustomer.id) ? (\n                          <img\n                            loading="lazy"\n                            decoding="async"\n                            src={getProfilePhotoDisplayUrl(referrerCustomer.profilePhotoUrl)}\n                            alt={'Foto do indicador ' + displayName}\n                            className="h-8 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-green-400/40 object-cover shadow-sm hover:opacity-90"\n                            onError={() => setFailedProfilePhotoIds((previous) => new Set(previous).add(referrerCustomer.id))}\n                            onPointerDown={(event) => event.stopPropagation()}\n                            onClick={(event) => {\n                              event.stopPropagation();\n                              setPhotoModal({ url: getProfilePhotoDisplayUrl(referrerCustomer.profilePhotoUrl!), name: displayName });\n                            }}\n                            title="Foto do indicador"\n                          />\n                        ) : (\n                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-green-400/25 bg-green-500/10">\n                            <ImageIcon className="h-4 w-4 text-green-300/70" aria-label="Indicador sem foto cadastrada" />\n                          </div>\n                        )}\n                        <span className="min-w-0 leading-tight">\n                          <span className="text-green-300/75">Indicado por: </span>\n                          <strong className="font-bold text-green-300">{displayName}</strong>\n                        </span>\n                      </div>\n                    );\n                  })()}\n`;

replaceRequired(
  detailsButton,
  referralCard + detailsButton,
  'foto do indicador no resumo de todo card'
);

fs.writeFileSync(file, source);
console.log('[admin-customers-referrer-photo] OK: foto do indicador visivel em todo card com referencia.');
