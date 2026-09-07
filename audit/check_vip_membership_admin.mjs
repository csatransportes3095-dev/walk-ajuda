import fs from "node:fs";
const checks = [
  ["backend membership", "server/routers/vipMemberships.ts", ["vipMemberships", "adminDirectory", "activate:", "renew:", "setExpiry:", "cancel:", "vipMembershipHistory"]],
  ["secure checkout", "server/routers.ts", ["isVipMemberByPhone(input.phone)", "vipMemberships: vipMembershipsRouter", "vipActive: Boolean(vipMembership?.active)"]],
  ["client membership hook", "client/src/hooks/useVipMembership.ts", ["vipMemberships.status", "walk_vip_active", "legacyVipState"]],
  ["VIP admin manager", "client/src/pages/AdminVip.tsx", ["Clientes VIP", "Ativar VIP", "Renovar", "Alterar validade", "Histórico VIP"]],
  ["customer VIP filter", "client/src/pages/AdminCustomers.tsx", ["showOnlyVip", "Clientes VIP (", "VIP ATIVO", "c.vipActive", "border-amber-300"]],
  ["storefront membership", "client/src/components/StorefrontProductCard.tsx", ["useVipMembership", "const { isVipCustomer } = useVipMembership()"]],
  ["checkout membership pricing", "client/src/pages/Home.tsx", ["useVipMembership", "const { isVipCustomer } = useVipMembership()"]],
  ["bot membership pricing", "client/src/components/ColombiaBot.tsx", ["useVipMembership", "const { isVipCustomer } = useVipMembership()"]],
  ["VIP public status", "client/src/pages/VipPage.tsx", ["useVipMembership", "isVipCustomer: isVip"]],
];
let ok=0;
for (const [label,file,needles] of checks) {
  const text=fs.readFileSync(file,"utf8");
  const missing=needles.filter((needle)=>!text.includes(needle));
  if (missing.length) { console.error(`FAIL ${label}: ${missing.join(", ")}`); process.exitCode=1; }
  else { console.log(`OK ${label}`); ok++; }
}
console.log(`${ok}/${checks.length} checks OK`);
