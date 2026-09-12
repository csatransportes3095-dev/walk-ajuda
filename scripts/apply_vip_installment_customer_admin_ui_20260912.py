from pathlib import Path

app = Path('client/src/App.tsx')
s = app.read_text(encoding='utf-8')
page_import = 'import VipInstallmentPayments from "./pages/VipInstallmentPayments";'
import_anchor = 'import VipPage from "./pages/VipPage";'
if page_import not in s:
    if s.count(import_anchor) != 1:
        raise SystemExit('App import anchor mismatch')
    s = s.replace(import_anchor, import_anchor + '\n' + page_import, 1)
route_line = '      <Route path={"/parcelas-vip"} component={VipInstallmentPayments} />'
route_anchor = '      <Route path={"/acompanhar"} component={OrderTracking} />'
if route_line not in s:
    if s.count(route_anchor) != 1:
        raise SystemExit('App route anchor mismatch')
    s = s.replace(route_anchor, route_anchor + '\n' + route_line, 1)
if s.count(page_import) != 1 or s.count(route_line) != 1:
    raise SystemExit('App VIP installments route not unique')
app.write_text(s, encoding='utf-8')

admin = Path('client/src/pages/AdminVip.tsx')
a = admin.read_text(encoding='utf-8')
receivables_import = 'import AdminVipReceivablesPanel from "@/components/AdminVipReceivablesPanel";'
admin_import_anchor = 'import AdminVipInstallmentsPanel from "@/components/AdminVipInstallmentsPanel";'
if receivables_import not in a:
    if a.count(admin_import_anchor) != 1:
        raise SystemExit('AdminVip import anchor mismatch')
    a = a.replace(admin_import_anchor, admin_import_anchor + '\n' + receivables_import, 1)
panel_anchor = '        <AdminVipInstallmentsPanel />'
receivables_line = '        <AdminVipReceivablesPanel />'
if receivables_line not in a:
    if a.count(panel_anchor) != 1:
        raise SystemExit('AdminVip panel anchor mismatch')
    a = a.replace(panel_anchor, panel_anchor + '\n' + receivables_line, 1)
if a.count(receivables_import) != 1 or a.count(receivables_line) != 1:
    raise SystemExit('AdminVip receivables integration not unique')
admin.write_text(a, encoding='utf-8')
