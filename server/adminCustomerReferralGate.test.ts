import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const routerSource = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
const customerPage = fs.readFileSync(path.join(root, "client/src/pages/AdminCustomers.tsx"), "utf8");

describe("indicação obrigatória no cadastro manual e visual do ADM", () => {
  it("resolve o nome do indicador pelo telefone na lista de clientes", () => {
    expect(routerSource).toContain("AS resolvedReferrerName");
    expect(routerSource).toContain("REGEXP_REPLACE(referrer.phone, '[^0-9]', '') = REGEXP_REPLACE(c.referredByPhone, '[^0-9]', '')");
  });

  it("não chama não respondeu quando o telefone de indicador está salvo", () => {
    expect(customerPage).toContain("resolvedReferrerName");
    expect(customerPage).toContain("Indicador informado:");
    expect(customerPage).toContain("c.referredByPhone");
  });

  it("exige telefone de indicador e reutiliza a regra central no cadastro manual", () => {
    expect(routerSource).toContain("referredByPhone: z.string().regex(/^\\d{10,11}$/");
    expect(routerSource).toContain("const restrictedAccessError = restrictedReferralAccessError(referral);");
    expect(routerSource).toContain("Erro ao registrar indicação do cadastro manual");
    expect(customerPage).toContain("Telefone do indicador cadastrado *");
    expect(customerPage).toContain("referredByPhone: createReferrerPhone");
  });
});
