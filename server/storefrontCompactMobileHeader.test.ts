import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const home = readFileSync("client/src/pages/Home.tsx", "utf8");
const filters = readFileSync("client/src/components/StorefrontFilters.tsx", "utf8");
const css = readFileSync("client/public/h2-main-route-cards-v2.css", "utf8");
const html = readFileSync("client/index.html", "utf8");
const header = home.slice(home.indexOf('data-testid="storefront-quick-services"'), home.indexOf("</header>", home.indexOf('data-testid="storefront-quick-services"')));

describe("vitrine: inicio compacto no celular", () => {
  it("preserva os cinco atalhos e os destinos cadastrados no ADM", () => {
    for (const service of ["orders", "loan", "gastos", "vip", "schedule"]) {
      expect(header.split('data-h2-service="' + service + '"')).toHaveLength(2);
    }
    expect(header).toContain("settings?.home_btn2_url");
    expect(header).toContain("shortcutUrl('loan', '/emprestimo')");
    expect(header).toContain("shortcutUrl('gastos', '/gastos')");
    expect(header).toContain("shortcutUrl('vip', '/parcelas-vip')");
    expect(header).toContain("Meus serviços");
    expect(header).toContain("grid grid-cols-2 gap-1.5");
    expect(header.match(/min-h-\[44px\]/g)).toHaveLength(5);
  });
  it("mantem o agendamento por token, bloqueio e status confirmado", () => {
    expect(header).toContain("disabled={!isActive}");
    expect(header).toContain("/agendar/\${schedule.token}");
    expect(header).toContain("schedule.status === 'confirmed'");
    expect(header).toContain("Agendamento confirmado");
    expect(header).toContain("group col-span-2 flex min-h-[44px]");
    expect(header.indexOf('data-h2-service="vip"')).toBeLessThan(header.indexOf('data-h2-service="schedule"'));
  });
  it("isola as regras legadas e usa identificadores estaveis em vez de labels do ADM", () => {
    const legacy = css.slice(css.indexOf("@media (max-width: 639px)"), css.indexOf("@media (min-width: 640px)"));
    expect(legacy).toContain("header:not(:has(.h2-storefront-quick-services))");
    expect(legacy).not.toMatch(/(?:^|\n)\s*header button/);
    expect(css).toContain(".h2-storefront-quick-services [data-h2-service]");
    expect(css).toContain("min-height: 48px;");
    expect(css).toContain('[data-category-count="4"]');
    expect(html).toContain("h2-main-route-cards-v2.css?v=20261127-compact-layout-v3");
  });
  it("compacta a busca e categorias sem ocultar categorias, contagens ou selecao", () => {
    expect(filters).toContain('data-testid="storefront-category-strip"');
    expect(filters).toContain("grid grid-cols-2 gap-1.5");
    expect(filters).toContain("data-category-count={categories.length}");
    expect(filters).not.toContain("overflow-x-auto");
    expect(filters).toContain("categories.map((category) =>");
    expect(filters).toContain("aria-pressed={active}");
    expect(filters).toContain("onCategoryChange(category)");
    expect(filters).toContain("{count}");
    expect(filters).toContain("{resultCount}");
    expect(filters).toContain('onSearchChange("")');
    expect(filters).toContain("onSearchChange(event.target.value)");
  });
});
