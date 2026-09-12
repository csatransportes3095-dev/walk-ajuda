from pathlib import Path

path = Path("client/src/components/AdminVipInstallmentsPanel.tsx")
text = path.read_text(encoding="utf-8")

import_anchor = 'import { toast } from "sonner";'
import_line = 'import AdminVipInstallmentProductsPanel from "@/components/AdminVipInstallmentProductsPanel";'
if import_line not in text:
    if text.count(import_anchor) != 1:
        raise SystemExit(f"Unexpected panel import anchor count: {text.count(import_anchor)}")
    text = text.replace(import_anchor, import_anchor + "\n" + import_line, 1)

panel_line = '        <AdminVipInstallmentProductsPanel />'
if panel_line not in text:
    anchor = '        <div className="grid grid-cols-3 gap-3">'
    if text.count(anchor) != 1:
        raise SystemExit(f"Unexpected stats anchor count: {text.count(anchor)}")
    text = text.replace(anchor, panel_line + "\n\n" + anchor, 1)

if text.count(import_line) != 1 or text.count(panel_line) != 1:
    raise SystemExit("Product panel integration must be unique")

path.write_text(text, encoding="utf-8")
print("VIP product rules panel integrated")
