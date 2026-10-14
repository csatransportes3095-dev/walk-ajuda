import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const question = fs.readFileSync(path.join(root, "client/src/components/PublicQuestionFlowEnhancer.tsx"), "utf8");
const home = fs.readFileSync(path.join(root, "client/src/pages/Home.tsx"), "utf8");

describe("desempenho e segurança do fluxo de perguntas", () => {
  it("consulta o DOM uma vez em vez de fazer varreduras para cada pergunta", () => {
    expect(question).toContain("findFirstVisibleQuestion(candidates)");
    expect(question).toContain("const byText = new Map<string, number[]>()");
    expect(question).not.toContain("findSmallestQuestionElement");
  });
  it("não reconstrói breadcrumbs sem mudança e mantém texto sem innerHTML", () => {
    expect(question).toContain("path.dataset.h2PathSignature !== signature");
    expect(question).toContain("path.replaceChildren");
    expect(question).not.toContain("path.innerHTML");
  });
  it("agrega mutações em requestAnimationFrame com limpeza de recursos", () => {
    expect(question).toContain("if (frame) return");
    expect(question).toContain("observer.disconnect()");
    expect(question).toContain("if (frame) cancelAnimationFrame(frame)");
  });
  it("salva rascunho após digitação sem perder salvamento nas etapas", () => {
    expect(home).toContain("window.setTimeout(() => {\n      try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch {}\n    }, 250)");
    expect(home).toContain("window.clearTimeout(timer)");
  });
  it("mantém as regras e as etapas de pedido, agendamento e WhatsApp", () => {
    expect(home).toContain('setStep("cadastro"); setCadastroSubStep(\'dados\')');
    expect(home).toContain("POST_ORDER_CONFIRMATION_KEY");
    expect(home).toContain("buildPostOrderWhatsappUrl");
    expect(home).toContain("submitLockRef.current");
  });
});
