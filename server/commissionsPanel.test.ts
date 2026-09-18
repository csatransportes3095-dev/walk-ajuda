import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routerSource = fs.readFileSync(
  path.join(path.resolve(process.cwd()), "server/routers.ts"),
  "utf8",
);

describe("painel de pagamentos de indicações", () => {
  it("aceita indicação vinculada por telefone mesmo quando o nome declarado está vazio", () => {
    expect(routerSource).toContain("WHERE c.referredByPhone IS NOT NULL");
    expect(routerSource).toContain("AND TRIM(c.referredByPhone) != ''");
    expect(routerSource).toContain("c.referredByPhone\n          ) as referredBy");
  });

  it("seleciona o primeiro acesso que possui pedido, ignorando acessos abandonados", () => {
    expect(routerSource).toContain("SELECT MIN(acp2.id) FROM accessCodePhones acp2");
    expect(routerSource).toContain("SELECT 1 FROM orderStatusHistory osh4");
    expect(routerSource).toContain("WHERE osh4.registrationId = acp2.id");
  });
});
