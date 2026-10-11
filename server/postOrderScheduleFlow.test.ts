import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const home = fs.readFileSync(path.resolve(root, "client/src/pages/Home.tsx"), "utf8");
const schedule = fs.readFileSync(path.resolve(root, "client/src/pages/SchedulePage.tsx"), "utf8");

describe("fluxo pos-pedido: agendamento antes do WhatsApp", () => {
  it("oferece fazer agora ou agendar depois antes do WhatsApp", () => {
    expect(home).toContain("FAZER AGORA");
    expect(home).toContain("AGENDAR DEPOIS");
    expect(home).toContain("postOrderScheduleDecision === 'choose'");
    expect(home).toContain("postOrderScheduleDecision === 'later'");
    expect(home).toContain("postOrderScheduleDecision === 'completed'");
  });

  it("fazer agora preserva o contexto do pedido e abre o token exato", () => {
    expect(home).toContain("POST_ORDER_FLOW_KEY");
    expect(home).toContain("persistPostOrderScheduleFlow(validLinks, 0)");
    expect(home).toContain("window.location.href = validLinks[0]");
    expect(home).toContain("whatsappUrl,");
    expect(home).toContain("buildPostOrderWhatsappUrl");
  });

  it("agendar depois nao altera agenda nem chama mutation", () => {
    expect(home).toContain("setPostOrderScheduleDecision('later')");
    expect(home).not.toContain("AGENDAR DEPOIS</button>\n                    {");
  });

  it("apos confirmar, a pagina de agenda permite voltar ao pedido", () => {
    expect(schedule).toContain("continuePostOrderScheduleFlow(token)");
    expect(schedule).toContain("CONTINUAR PEDIDO");
    expect(schedule).toContain("CONTINUAR PARA O PRÓXIMO AGENDAMENTO");
    expect(schedule).toContain("const whatsappUrl = typeof flow.saved?.whatsappUrl === 'string'");
    expect(schedule).toContain("whatsappLink.target = '_blank'");
    expect(schedule).toContain("window.location.replace('/')");
    expect(schedule).toContain("sessionStorage.removeItem(POST_ORDER_FLOW_KEY)");
  });

  it("nao altera a mutation existente de confirmacao do horario", () => {
    expect(schedule).toContain("trpc.schedule.confirm.useMutation");
    expect(schedule).toContain("confirmMut.mutate({ token, accessToken, slotId: selectedSlot })");
  });
});
