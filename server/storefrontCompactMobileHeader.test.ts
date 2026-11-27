import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const home = readFileSync("client/src/pages/Home.tsx", "utf8");
const filters = readFileSync("client/src/components/StorefrontFilters.tsx", "utf8");
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
  it("compacta a busca e categorias sem ocultar categorias, contagens ou selecao", () => {
    expect(filters).toContain('data-testid="storefront-category-strip"');
    expect(filters).toContain("flex gap-1.5 overflow-x-auto");
    expect(filters).toContain("categories.map((category) =>");
    expect(filters).toContain("aria-pressed={active}");
    expect(filters).toContain("onCategoryChange(category)");
    expect(filters).toContain("{count}");
    expect(filters).toContain("{resultCount}");
    expect(filters).toContain('onSearchChange("")');
    expect(filters).toContain("onSearchChange(event.target.value)");
  });
});
