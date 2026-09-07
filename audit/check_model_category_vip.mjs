import fs from "node:fs";
const files = {
  router: fs.readFileSync("server/routers/optionPriceModels.ts", "utf8"),
  submit: fs.readFileSync("server/routers.ts", "utf8"),
  admin: fs.readFileSync("client/src/pages/AdminProducts.tsx", "utf8"),
  card: fs.readFileSync("client/src/components/StorefrontProductCard.tsx", "utf8"),
  home: fs.readFileSync("client/src/pages/Home.tsx", "utf8"),
  bot: fs.readFileSync("client/src/components/ColombiaBot.tsx", "utf8"),
};
const checks = [
  ["VIP salvo em optionPriceModels", files.router.includes("vipAccessMode") && files.router.includes("vipDiscountValue")],
  ["admin configura modelo/categoria", files.admin.includes("VIP DESTE MODELO / CATEGORIA") && files.admin.includes("Somente VIP")],
  ["vitrine bloqueia somente VIP", files.card.includes("isVipOnlyLocked") && files.card.includes("SOMENTE VIP")],
  ["checkout envia priceModelId", files.home.includes("priceModelId: item.priceModel?.id") && files.home.includes("priceModelId: selectedPriceModel?.id")],
  ["bot respeita modelo/categoria VIP", files.bot.includes("SOMENTE VIP") && files.bot.includes("priceModelId: flowState.current.priceModel?.id")],
  ["servidor valida restricao", files.submit.includes("checkOptionPriceModelCheckoutAccess") && files.submit.includes("input.priceModelId")],
  ["nenhum campo VIP adicionado ao produto pai", !files.submit.includes("productVipAccessMode") && !files.admin.includes("VIP DESTE CARD")],
];
for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"} - ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
