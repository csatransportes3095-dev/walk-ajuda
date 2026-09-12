from pathlib import Path

path = Path('server/vipInstallmentContractService.ts')
text = path.read_text(encoding='utf-8')
select_anchor = '''    SELECT id, registrationId, productName, baseAmountCents, interestBps, interestAmountCents,
           totalAmountCents, paidAmountCents, balanceCents, installmentCount, frequency, dailyMode, status, createdAt
'''
select_replacement = '''    SELECT id, registrationId, orderStatusId, orderNumber, productName, baseAmountCents, interestBps, interestAmountCents,
           totalAmountCents, paidAmountCents, balanceCents, installmentCount, frequency, dailyMode, status, createdAt
'''
if 'SELECT id, registrationId, orderStatusId, orderNumber, productName' not in text:
    if text.count(select_anchor) != 1:
        raise SystemExit('customer plans select anchor mismatch')
    text = text.replace(select_anchor, select_replacement, 1)

return_anchor = '''      registrationId: plan.registrationId == null ? null : Number(plan.registrationId),
      productName: String(plan.productName || ""),
'''
return_replacement = '''      registrationId: plan.registrationId == null ? null : Number(plan.registrationId),
      orderStatusId: plan.orderStatusId == null ? null : Number(plan.orderStatusId),
      orderNumber: plan.orderNumber == null ? null : Number(plan.orderNumber),
      productName: String(plan.productName || ""),
'''
if 'orderNumber: plan.orderNumber' not in text:
    if text.count(return_anchor) != 1:
        raise SystemExit('customer plans return anchor mismatch')
    text = text.replace(return_anchor, return_replacement, 1)

path.write_text(text, encoding='utf-8')
