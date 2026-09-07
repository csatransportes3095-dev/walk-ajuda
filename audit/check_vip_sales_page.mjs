import fs from "node:fs";
const checks = [
  ["pagina publica VIP", "client/src/pages/VipPage.tsx", ["Assinatura H2 VIP", "Já paguei — ativar VIP", "trpc.pix.getActive"]],
  ["configuracao admin VIP", "client/src/pages/AdminVip.tsx", ["vip_membership_price", "vip_membership_days", "Salvar configuração VIP"]],
  ["rotas VIP", "client/src/App.tsx", ["/admin/vip", "/vip", "isVipRoute"]],
  ["atalho admin", "client/src/pages/AdminCodes.tsx", ["href: '/admin/vip'", "label: 'VIP'"]],
  ["preco VIP visivel", "client/src/components/StorefrontProductCard.tsx", ["Cliente VIP paga", "Quero ser VIP", "Economize até", "vipPreviewPrice"]],
];
let ok = 0;
for (const [label, file, needles] of checks) {
  const text = fs.readFileSync(file, "utf8");
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) {
    console.error(`FAIL ${label}: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`OK ${label}`);
    ok++;
  }
}
console.log(`${ok}/${checks.length} checks OK`);
