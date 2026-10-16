import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveProductBadgeAppearance } from "../client/src/lib/productBadgeAppearance.ts";

const code = path => readFileSync(path, "utf8");

test("UBER CARRO VIAGENS defaults to a larger, high-contrast badge", () => {
  const badge = resolveProductBadgeAppearance({ name: "UBER  CARRO VIAGENS" });
  assert.equal(badge.highlighted, true);
  assert.equal(badge.size, "large");
  assert.equal(badge.background, "#1d4ed8");
  assert.equal(badge.text, "#ffffff");
  assert.equal(badge.border, "#67e8f9");
});
test("unrelated product keeps original pill styling by default", () => {
  const badge = resolveProductBadgeAppearance({ name: "DOCUMENTO CRLV" });
  assert.equal(badge.highlighted, false);
  assert.equal(badge.align, "left");
});
test("ADM overrides colors, sizing and alignment for one product", () => {
  const badge = resolveProductBadgeAppearance({
    name: "OTHER PRODUCT", badgeBgColor: "#123456", badgeTextColor: "#ffeeaa",
    badgeBorderColor: "#ff00aa", badgeSize: "small", badgeAlign: "right",
  });
  assert.equal(badge.highlighted, true);
  assert.equal(badge.background, "#123456");
  assert.equal(badge.text, "#ffeeaa");
  assert.equal(badge.border, "#ff00aa");
  assert.equal(badge.size, "small");
  assert.equal(badge.alignClass, "justify-end");
});
test("invalid color, size or alignment never reach inline CSS", () => {
  const badge = resolveProductBadgeAppearance({ name: "UBER CARRO VIAGENS", badgeBgColor: "red; x:y", badgeSize: "huge", badgeAlign: "bottom" });
  assert.equal(badge.background, "#1d4ed8");
  assert.equal(badge.size, "large");
  assert.equal(badge.align, "left");
});
test("clearing all five settings restores the product default", () => {
  const before = resolveProductBadgeAppearance({ name: "OTHER", badgeBgColor: "#010203", badgeSize: "large" });
  const after = resolveProductBadgeAppearance({ name: "OTHER", badgeBgColor: null, badgeSize: null, badgeTextColor: null, badgeBorderColor: null, badgeAlign: null });
  assert.equal(before.highlighted, true);
  assert.equal(after.highlighted, false);
});
test("storage, API and public product serialization share five badge fields", () => {
  const schema = code("drizzle/schema.ts");
  const db = code("server/db.ts");
  const router = code("server/routers.ts");
  const admin = code("client/src/pages/AdminProducts.tsx");
  const storefront = code("client/src/components/StorefrontProductCard.tsx");
  for (const field of ["badgeBgColor", "badgeTextColor", "badgeBorderColor", "badgeSize", "badgeAlign"]) {
    assert.ok(schema.includes(`${field}: varchar("${field}"`), `schema: ${field}`);
    assert.ok(db.includes(`${field}: source.${field}`), `clone: ${field}`);
    assert.ok(router.includes(`${field}: z.`), `admin API: ${field}`);
    assert.ok(admin.includes(`${field}: edit`), `ADM saves: ${field}`);
    assert.ok(storefront.includes(`item.product`) && storefront.includes("resolveProductBadgeAppearance"), "public card");
  }
  assert.ok(router.includes("result.push({ ...p, options: optionsWithRelations })"), "public output includes product settings");
});
test("deployment migrates additive nullable columns before starting the API", () => {
  const script = code("scripts/apply-product-badge-appearance-migration.ts");
  const boot = code("scripts/render-start.sh");
  assert.ok(script.includes("SHOW COLUMNS FROM"));
  assert.ok(script.includes("ADD COLUMN"));
  assert.ok(script.includes("NULL"));
  assert.ok(boot.includes("db-migrate-product-badge-appearance"));
  assert.ok(boot.indexOf("db-migrate-product-badge-appearance") < boot.indexOf("exec node dist/index.js"));
});
test("checkout flow is untouched by badge settings", () => {
  const ui = code("client/src/components/StorefrontProductCard.tsx");
  assert.ok(ui.includes('runProtectedAction("buy")'));
  assert.ok(ui.includes('runProtectedAction("cart")'));
  assert.ok(ui.includes("productPill"));
});
