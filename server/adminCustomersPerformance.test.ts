import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/AdminCustomers.tsx"), "utf8");

describe("ADM clientes: desempenho sem alterar filtros", () => {
  it("prepara índices de empréstimos para cartões em vez de varredura por cliente", () => {
    expect(source).toContain("const loanCustomerLookup = useMemo");
    expect(source).toContain("loanCustomerLookup.phones.has(phone)");
    expect(source).toContain("loanCustomerLookup.cpfs.has(cpf)");
    expect(source).not.toContain("return ((loanClientsForCardColorQuery.data || []) as any[]).some");
  });
  it("preserva todos os filtros e a ordenação com resultados memoizados", () => {
    expect(source).toContain("const sortedCustomers = useMemo");
    expect(source).toContain("const filtered = useMemo");
    for (const key of ["showOnlyVip", "showOnlyOrders", "showOnlyNoOrders", "showOnlyBlocked", "isOrderSearch", "isCadastroSearch"]) {
      expect(source).toContain(key);
    }
  });
  it("preserva cartões, fotos, seleção múltipla e exportação integral", () => {
    for (const key of ["filtered.map((c)", "profilePhotoUrl", "toggleSelect(c.id)", "Exportar CSV", "hasLoanForCustomer(c)"]) {
      expect(source).toContain(key);
    }
  });
});
