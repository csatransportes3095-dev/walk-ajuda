from pathlib import Path

path = Path('client/src/App.tsx')
text = path.read_text(encoding='utf-8')

vip_import = 'import VipPage from "./pages/VipPage";'
new_imports = 'import VipInstallmentsPage from "./pages/VipInstallmentsPage";\nimport AdminVipReceivablesPage from "./pages/AdminVipReceivablesPage";'
if 'import VipInstallmentsPage' not in text:
    if text.count(vip_import) != 1:
        raise SystemExit('VipPage import anchor mismatch')
    text = text.replace(vip_import, vip_import + '\n' + new_imports, 1)

admin_anchor = '''      <Route path={"/admin/vip"}>
        <AdminGuard><AdminVip /></AdminGuard>
      </Route>
'''
admin_route = '''      <Route path={"/admin/vip"}>
        <AdminGuard><AdminVip /></AdminGuard>
      </Route>
      <Route path={"/admin/vip-recebiveis"}>
        <AdminGuard><AdminVipReceivablesPage /></AdminGuard>
      </Route>
'''
if '/admin/vip-recebiveis' not in text:
    if text.count(admin_anchor) != 1:
        raise SystemExit('admin vip route anchor mismatch')
    text = text.replace(admin_anchor, admin_route, 1)

tracking_anchor = '      <Route path={"/acompanhar"} component={OrderTracking} />\n'
customer_route = '      <Route path={"/parcelas-vip"} component={VipInstallmentsPage} />\n'
if '/parcelas-vip' not in text:
    if text.count(tracking_anchor) != 1:
        raise SystemExit('customer route anchor mismatch')
    text = text.replace(tracking_anchor, tracking_anchor + customer_route, 1)

path.write_text(text, encoding='utf-8')
