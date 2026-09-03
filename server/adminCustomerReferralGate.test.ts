import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const routerSource = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
const customerUpdateSource = fs.readFileSync(path.join(root, "server/routers/customerUpdate.ts"), "utf8");
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

  it("cadastro manual do ADM permite campos vazios e exige somente telefone", () => {
    expect(customerUpdateSource).toContain("adminCreatePartial: adminProcedure");
    expect(customerUpdateSource).toContain("phone: z.string().min(10).max(32)");
    expect(customerPage).toContain("trpc.customerUpdate.adminCreatePartial.useMutation");
    expect(customerPage).toContain("Telefone do indicador cadastrado (opcional)");
    expect(customerPage).toContain("cpf: createCpf || undefined");
    expect(customerPage).toContain("profilePhotoUrl: createPhotoUrl || undefined");
    expect(customerPage).not.toContain("CPF obrigatório e inválido");
    expect(customerPage).not.toContain("Foto de perfil obrigatória");
  });
});
