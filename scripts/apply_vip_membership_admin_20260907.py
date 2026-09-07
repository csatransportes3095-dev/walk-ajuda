from pathlib import Path
import subprocess
import sys

source_path = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/vip-source.yml")
src = source_path.read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(src) if "python - <<'PY'" in line) + 1
end = next(i for i in range(start, len(src)) if src[i].strip() == "PY")
prefix = "          "
lines = [line[len(prefix):] if line.startswith(prefix) else line for line in src[start:end]]

def remove_replace_block(label: str) -> None:
    marker = next(i for i, line in enumerate(lines) if ("'" + label + "')") in line)
    block_start = marker
    while block_start >= 0 and "s = replace_once(s," not in lines[block_start]:
        block_start -= 1
    if block_start < 0:
        raise SystemExit("No replace start for " + label)
    del lines[block_start:marker + 1]

for label in [
    "secure checkout membership",
    "customer VIP fields",
    "AdminCustomers VIP filter button",
    "AdminCustomers VIP background",
    "AdminCustomers VIP border",
    "AdminCustomers VIP shadow",
    "AdminCustomers VIP photo border",
    "AdminCustomers VIP crown badge",
]:
    remove_replace_block(label)

patch_path = Path("/tmp/vip_patch.py")
patch_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

routers = Path("server/routers.ts")
text = routers.read_text(encoding="utf-8")
checkout_target = "          if (input.priceModelId) {\n            const modelAccess = await checkOptionPriceModelCheckoutAccess(input.priceModelId, isVipModelAccess);"
checkout_insert = "          if (!isVipModelAccess && input.phone) {\n            isVipModelAccess = await isVipMemberByPhone(input.phone);\n          }\n"
if checkout_insert.strip() not in text:
    if checkout_target not in text:
        raise SystemExit("checkout target missing")
    text = text.replace(checkout_target, checkout_insert + checkout_target, 1)
customer_target = "          hasOrder: Number(r.hasOrder) === 1,\n          fixedPwdActive: Number(r.fixedPwdActive) === 1,"
customer_insert = "          hasOrder: Number(r.hasOrder) === 1,\n          vipActive: Boolean(vipMembership?.active),\n          vipStatus: vipMembership?.status || 'none',\n          vipStartedAt: vipMembership?.startsAtMs || null,\n          vipExpiresAt: vipMembership?.expiresAtMs || null,\n          vipDaysLeft: vipMembership?.daysLeft || 0,\n          fixedPwdActive: Number(r.fixedPwdActive) === 1,"
if "vipActive: Boolean(vipMembership?.active)" not in text:
    if customer_target not in text:
        raise SystemExit("customer return target missing")
    text = text.replace(customer_target, customer_insert, 1)
routers.write_text(text, encoding="utf-8")

customers = Path("client/src/pages/AdminCustomers.tsx")
c = customers.read_text(encoding="utf-8")
toolbar_marker = "{!showOnlyBlocked && customers.some(c => c.blocked === 1) && ("
vip_button = '''<button
  onClick={() => {
    const next = !showOnlyVip;
    setShowOnlyVip(next);
    if (next) { setShowOnlyOrders(false); setShowOnlyBlocked(false); setSelectedIds(new Set()); }
  }}
  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-colors border ${showOnlyVip ? 'bg-amber-400 text-amber-950 border-amber-300 shadow-[0_0_16px_rgba(251,191,36,.28)]' : 'bg-amber-500/15 border-amber-400/35 text-amber-300 hover:bg-amber-500/25'}`}
  title="Filtrar somente clientes com VIP ativo"
>
  <Crown className="w-3.5 h-3.5 fill-current" />
  {showOnlyVip ? `Mostrando VIP (${filtered.length})` : `Clientes VIP (${customers.filter(c => c.vipActive).length})`}
</button>
'''
if "Clientes VIP (${customers.filter(c => c.vipActive).length})" not in c:
    pos = c.find(toolbar_marker)
    if pos < 0:
        raise SystemExit("customer toolbar marker missing")
    c = c[:pos] + vip_button + c[pos:]
customers.write_text(c, encoding="utf-8")

subprocess.run([sys.executable, str(patch_path)], check=True)

p = Path("client/src/pages/AdminCustomers.tsx")
s = p.read_text(encoding="utf-8")

def insert_vip_case(property_name: str, vip_value: str) -> None:
    global s
    start_pos = s.find(property_name + ": c.blocked === 1")
    if start_pos < 0:
        raise SystemExit(property_name + " block missing")
    target = ": c.hasOrder && hasLoanForCustomer(c)"
    pos = s.find(target, start_pos)
    if pos < 0:
        raise SystemExit(property_name + " normal color target missing")
    replacement = ": c.vipActive\n                  ? " + repr(vip_value) + "\n                  : c.hasOrder && hasLoanForCustomer(c)"
    s = s[:pos] + replacement + s[pos + len(target):]

insert_vip_case("background", "linear-gradient(135deg, #5b3700 0%, #2a1749 50%, #6b4300 100%)")
insert_vip_case("border", "2px solid rgba(250,204,21,0.95)")
insert_vip_case("boxShadow", "0 0 0 1px rgba(253,224,71,0.18), 0 8px 30px rgba(250,204,21,0.32), inset 0 0 34px rgba(168,85,247,0.12)")

photo_old = "${c.isBlocked ? 'border-2 border-red-500/60' : 'border-2 border-primary/30'}"
photo_new = "${c.isBlocked ? 'border-2 border-red-500/60' : c.vipActive ? 'border-[3px] border-amber-300 shadow-[0_0_18px_rgba(250,204,21,.38)]' : 'border-2 border-primary/30'}"
if photo_old not in s:
    raise SystemExit("VIP photo border target missing")
s = s.replace(photo_old, photo_new, 1)

badge_marker = "{/* Badge bloqueado */}"
badge = '''{c.vipActive && (
  <a href={`/admin/vip?phone=${encodeURIComponent(c.phone.replace(/\\D/g, ''))}`} onClick={(event) => event.stopPropagation()} className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-amber-950 shadow-[0_0_20px_rgba(250,204,21,.48)] animate-pulse" title="Abrir gestão deste cliente VIP">
    <Crown className="h-3.5 w-3.5 fill-current" /> VIP ATIVO • {c.vipDaysLeft || 0} DIAS
  </a>
)}
{/* Badge bloqueado */}'''
if "VIP ATIVO • {c.vipDaysLeft || 0} DIAS" not in s:
    pos = s.find(badge_marker)
    if pos < 0:
        raise SystemExit("VIP badge marker missing")
    s = s[:pos] + badge + s[pos + len(badge_marker):]

p.write_text(s, encoding="utf-8")
print("VIP membership patch applied successfully")
