import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("wiring da atualização cadastral obrigatória", () => {
  it("expõe no card correto do ADM a ativação e o checklist por cliente", () => {
    const source = read("client/src/pages/AdminCustomers.tsx");
    expect(source).toContain("trpc.customers.setProfileUpdatePolicy.useMutation");
    expect(source).toContain("Atualização obrigatória do cadastro");
    expect(source).toContain("Obrigar este cliente a confirmar uma nova atualização");
    expect(source).toContain("Foto ausente: obrigatória automaticamente.");
    expect(source).toContain("CUSTOMER_PROFILE_UPDATE_FIELD_OPTIONS.map");
    expect(source).toContain("Ativar ou desativar não altera nenhum dado do cliente.");
  });

  it("a Home não libera filhos quando a sessão retorna pendência", () => {
    const source = read("client/src/components/PasswordGate.tsx");
    expect(source).toContain("cpwdCheckSessionQuery.data.profileUpdateRequired");
    expect(source).toContain("navigate('/atualizarcadastro')");
    expect(source).toContain("Atualização cadastral obrigatória pelo administrador.");
  });

  it("Gastos e Empréstimos expulsam sessões persistidas pendentes", () => {
    for (const relativePath of ["client/src/pages/GastosPage.tsx", "client/src/pages/EmprestimoPage.tsx"]) {
      const source = read(relativePath);
      expect(source).toContain("profileUpdateRequired");
      expect(source).toContain("navigate('/atualizarcadastro')");
    }
    const gastosSource = read("client/src/pages/GastosLoginPage.tsx");
    expect(gastosSource).toContain("profilePhotoUrl");
    expect(gastosSource).toContain("requiredFields");
  });

  it("o servidor bloqueia confirmação e reagendamento do agendamento", () => {
    const source = read("server/routers/schedule.ts");
    expect(source).toContain("shouldBlockScheduleForCustomer");
    expect(source).toContain("Atualização cadastral obrigatória pelo administrador.");
    expect(source).toContain("if (await shouldBlockScheduleForCustomer(customer))");
  });

  it("o acompanhamento não consulta dados enquanto a revisão estiver pendente", () => {
    const panelSource = read("client/src/components/OnlineEntryPanel.tsx");
    const entrySource = read("server/online-support/entry.ts");
    expect(panelSource).toContain("!sessionQ.data?.customer?.profileUpdateRequired");
    expect(panelSource).toContain("Atualização cadastral obrigatória");
    expect(entrySource).toContain("if (profileUpdateState.pending && !options?.allowProfileUpdate)");
  });
});
