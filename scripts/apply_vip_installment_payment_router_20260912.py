from pathlib import Path

path = Path('server/routers.ts')
text = path.read_text(encoding='utf-8')

anchor = 'import { vipInstallmentsRouter } from "./routers/vipInstallments";'
new_import = 'import { vipInstallmentPaymentsRouter } from "./routers/vipInstallmentPayments";'
if new_import not in text:
    if text.count(anchor) != 1:
        raise SystemExit('vipInstallments import anchor mismatch')
    text = text.replace(anchor, anchor + '\n' + new_import, 1)

route_anchor = '  vipInstallments: vipInstallmentsRouter,'
route_line = '  vipInstallmentPayments: vipInstallmentPaymentsRouter,'
if route_line not in text:
    if text.count(route_anchor) != 1:
        raise SystemExit('vipInstallments route anchor mismatch')
    text = text.replace(route_anchor, route_anchor + '\n' + route_line, 1)

path.write_text(text, encoding='utf-8')
