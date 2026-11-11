import { describe, expect, it } from "vitest";
import { displayH2AutoFaqWithDraftFirst } from "../client/src/lib/h2AutoFaqEditorOrder";
import { h2AutoPersonalizationSchema } from "../shared/h2AutoPersonalization";

describe("H2 AUTO - nova pergunta aparece no topo antes de salvar", () => {
  const existing = [
    { id: "faq_01", question: "Como fazer login?", answer: "Abra o site de login.", enabled: true, variations: "" },
    { id: "faq_02", question: "Como acompanhar?", answer: "Consulte o acompanhamento.", enabled: true, variations: "" },
  ];
  const newQuestion = { id: "faq_03", question: "Como pedir ajuda?", answer: "Acesse a ajuda.", enabled: true, variations: "" };

  it("mostra o rascunho primeiro sem alterar a ordem enviada ao servidor", () => {
    const canonical = [...existing, newQuestion];
    const displayed = displayH2AutoFaqWithDraftFirst(canonical, newQuestion.id);
    expect(displayed.map(q => q.id)).toEqual(["faq_03", "faq_01", "faq_02"]);
    expect(canonical.map(q => q.id)).toEqual(["faq_01", "faq_02", "faq_03"]);
    expect(h2AutoPersonalizationSchema.parse({ faq: canonical }).faq.map(q => q.id))
      .toEqual(["faq_01", "faq_02", "faq_03"]);
  });

  it("depois de salvar e limpar destaque, a nova pergunta fica na ultima posicao", () => {
    const canonical = [...existing, newQuestion];
    expect(displayH2AutoFaqWithDraftFirst(canonical, null).map(q => q.id))
      .toEqual(["faq_01", "faq_02", "faq_03"]);
    expect(displayH2AutoFaqWithDraftFirst(canonical, "nao-existe").map(q => q.id))
      .toEqual(["faq_01", "faq_02", "faq_03"]);
  });

  it("mantem outras perguntas e conteudos inalterados", () => {
    const canonical = [...existing, newQuestion];
    const displayed = displayH2AutoFaqWithDraftFirst(canonical, newQuestion.id);
    expect(displayed[0]).toBe(newQuestion);
    expect(displayed[1]).toBe(existing[0]);
    expect(displayed[2]).toBe(existing[1]);
  });
});
