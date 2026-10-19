import { describe, expect, it } from "vitest";
import { compactCurrentDescription } from "../shared/orderTrackingPresentation";
import fs from "node:fs";
import path from "node:path";

const tracking = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/OrderTracking.tsx"), "utf8");
describe("Acompanhamento do cliente - layout compacto", () => {
  it("remove título repetido somente na apresentação", () => {
    expect(compactCurrentDescription("⏳ AGUARDANDO AGENDAMENTO 📸 Seu pedido está aguardando a foto.", "AGUARDANDO AGENDAMENTO")).toBe("📸 Seu pedido está aguardando a foto.");
    expect(compactCurrentDescription("Mensagem específica da equipe", "Foto Reprovada")).toBe("Mensagem específica da equipe");
    expect(compactCurrentDescription("Foto aprovada", "Foto aprovada")).toBeNull();
  });
  it("mostra um único status em destaque e mantém próxima etapa compacta", () => {
    expect(tracking).toContain('aria-label="Situação atual do pedido"');
    expect(tracking).toContain('O que vem depois');
    expect(tracking).not.toContain("nextCfg.description");
    expect(tracking).not.toContain("Acontecendo agora");
  });
  it("mantém o histórico recolhido por padrão e sem descrição repetida", () => {
    expect(tracking).toContain("<details");
    expect(tracking).toContain("Ver todas as etapas");
    expect(tracking).not.toContain("<details open");
    expect(tracking).toContain("presentation.visibleKeys.includes(step.key)");
    expect(tracking).not.toContain("{cfg.description}");
  });
  it("respeita controle de visibilidade do ADM e sequência operacional", () => {
    expect(tracking).toContain("resolveStatusVisibility(keys, latestStatus, statusVisibilityQuery.data)");
    expect(tracking).toContain("presentation.showNextStep");
    expect(tracking).toContain("presentation.showProgress");
    expect(tracking).toContain("presentation.showTimeline");
    expect(tracking).toContain("resolveProgressPosition({");
  });
});
