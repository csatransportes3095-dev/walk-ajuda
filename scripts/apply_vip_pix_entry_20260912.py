from pathlib import Path

p = Path('client/src/pages/Home.tsx')
s = p.read_text(encoding='utf-8')

old = '''  // Valor a exibir no PIX: à vista mantém o cálculo atual; Parcelamento VIP cobra somente a parcela 1 congelada pelo servidor.\n  const cashPixValue = cart.length > 1 ? ((couponDiscount || hasResellerDiscount) ? cartTotalWithDiscount : cartTotalFormatted) : ((couponDiscount || hasResellerDiscount) ? finalValue : originalValue);\n  const vipFirstInstallmentCents = Number(vipInstallmentSelection.quote?.quote?.installments?.[0]?.amountCents || 0);\n  const pixValue = vipInstallmentSelection.mode === "vip_installment" && vipFirstInstallmentCents > 0\n    ? (vipFirstInstallmentCents / 100).toFixed(2).replace('.', ',')\n    : cashPixValue;'''
new = '''  // Valor a exibir no PIX: à vista mantém o cálculo atual; Parcelamento VIP cobra a entrada quando configurada.\n  const cashPixValue = cart.length > 1 ? ((couponDiscount || hasResellerDiscount) ? cartTotalWithDiscount : cartTotalFormatted) : ((couponDiscount || hasResellerDiscount) ? finalValue : originalValue);\n  const vipEntryCents = Number(vipInstallmentSelection.quote?.quote?.firstInstallmentAmountCents || 0);\n  const vipFirstParcelCents = Number(vipInstallmentSelection.quote?.quote?.installments?.[0]?.amountCents || 0);\n  const vipCurrentPixCents = vipEntryCents > 0 ? vipEntryCents : vipFirstParcelCents;\n  const pixValue = vipInstallmentSelection.mode === "vip_installment" && vipCurrentPixCents > 0\n    ? (vipCurrentPixCents / 100).toFixed(2).replace('.', ',')\n    : cashPixValue;'''
if s.count(old) != 1:
    raise SystemExit(f'pix amount anchor count={s.count(old)}')
s = s.replace(old, new, 1)

old = '''                  {vipInstallmentSelection.mode === 'vip_installment' && <p className="text-violet-300 text-xs font-black">PARCELA 1 DE {vipInstallmentSelection.installmentCount}</p>}'''
new = '''                  {vipInstallmentSelection.mode === 'vip_installment' && <p className="text-violet-300 text-xs font-black">{vipEntryCents > 0 ? 'ENTRADA' : `PARCELA 1 DE ${vipInstallmentSelection.installmentCount}`}</p>}'''
if s.count(old) != 1:
    raise SystemExit(f'pix label anchor count={s.count(old)}')
s = s.replace(old, new, 1)

old = '''                    <p className="text-white/60 text-xs tracking-widest mb-1">VALOR A PAGAR</p>'''
new = '''                    <p className="text-white/60 text-xs tracking-widest mb-1">{vipInstallmentSelection.mode === 'vip_installment' && vipEntryCents > 0 ? 'VALOR DA ENTRADA' : 'VALOR A PAGAR'}</p>'''
if s.count(old) != 1:
    raise SystemExit(f'pix value label anchor count={s.count(old)}')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
