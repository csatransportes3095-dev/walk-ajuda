import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("agendamento usa somente a atualização central", () => {
  it("protege leitura, confirmação e reagendamento no backend", () => {
    const router = read("server/routers/schedule.ts");
    expect(router).toContain("resolveScheduleProfileRequirement(appt.customerPhone)");
    expect((router.match(/assertScheduleProfileForAppointment\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it("redireciona o link de agendamento para /atualizarcadastro e volta ao mesmo token", () => {
    const page = read("client/src/pages/SchedulePage.tsx");
    expect(page).toContain("/atualizarcadastro?");
    expect(page).toContain("const returnTo = `/agendar/${token}`");
  });

  it("mantém telefone fora do save do cliente e fora do adminUpdate", () => {
    const customerUpdate = read("server/routers/customerUpdate.ts");
    expect(customerUpdate).toContain("Telefone propositalmente não existe no input: é a identidade fixa do cliente.");
    const saveBlock = customerUpdate.slice(customerUpdate.indexOf("  save: publicProcedure"));
    expect(saveBlock).not.toContain("phone: z.string()");
  });

  it("não reintroduz a política antiga individual do ADM", () => {
    expect(fs.existsSync("server/customerProfileUpdatePolicy.ts")).toBe(false);
    expect(fs.existsSync("shared/customerProfileUpdate.ts")).toBe(false);
  });

  it("aceita foto válida mesmo quando o navegador não informa MIME", () => {
    expect(read("client/src/pages/AtualizarCadastro.tsx")).toContain("if (file.type && !/^image\\/(jpeg|png|webp)$/i.test(file.type))");
  });
});
