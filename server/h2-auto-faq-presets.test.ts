import { describe,it,expect } from "vitest";
import { H2_AUTO_FAQ_SUGGESTIONS,prepareH2AutoCommonFaq,mergeH2AutoExpandedFaq } from "../shared/h2AutoFaqPresets";
import { H2_AUTO_PERSONALIZATION_DEFAULT,h2AutoPersonalizationSchema,getH2AutoPersonalizedReply } from "../shared/h2AutoPersonalization";
describe("H2 AUTO prefilled FAQ suggestions",()=>{
  it("provides 40 distinct complete answers, inactive by default",()=>{
    expect(H2_AUTO_FAQ_SUGGESTIONS).toHaveLength(40);
    expect(new Set(H2_AUTO_FAQ_SUGGESTIONS.map(x=>x.id)).size).toBe(40);
    for(const r of H2_AUTO_FAQ_SUGGESTIONS) {
      expect(r.enabled).toBe(false);
      expect(h2AutoPersonalizationSchema.safeParse({...H2_AUTO_PERSONALIZATION_DEFAULT,faq:[r]}).success).toBe(true);
      expect(r.answer).toContain("*");
    }
  });
  it("fills an empty device without changing enabled state",()=>{
    const p=prepareH2AutoCommonFaq(H2_AUTO_PERSONALIZATION_DEFAULT);
    expect(p.added).toBe(40);
    expect(p.personalization.enabled).toBe(false);
    expect(p.personalization.faq.every(x=>!x.enabled)).toBe(true);
    expect(h2AutoPersonalizationSchema.safeParse(p.personalization).success).toBe(true);
  });
  it("preserves existing rules and does not repopulate deleted items after saved",()=>{
    const existing={...H2_AUTO_PERSONALIZATION_DEFAULT,enabled:true,faq:[{id:"mine",question:"Minha pergunta",variations:"",answer:"Minha resposta",enabled:true}]};
    const first=prepareH2AutoCommonFaq(existing);
    expect(first.personalization.faq[0]).toEqual(existing.faq[0]);
    expect(first.personalization.enabled).toBe(true);
    expect(first.added).toBe(40);
    const removed={...first.personalization,faq:first.personalization.faq.filter(x=>x.id!=="h2_login_cliente")};
    expect(prepareH2AutoCommonFaq(removed).added).toBe(0);
    expect(prepareH2AutoCommonFaq(removed).personalization.faq.some(x=>x.id==="h2_login_cliente")).toBe(false);
  });
  it("permite mais de 40 perguntas sem truncar, modificar ou reativar respostas",()=>{
    const originalFaq=Array.from({length:65},(_,i)=>({
      id:`minha_faq_${i}`,
      question:`Minha pergunta personalizada ${i + 1}`,
      variations:"",
      answer:`Minha resposta personalizada ${i + 1}`,
      enabled:i % 2 === 0,
    }));
    const config={...H2_AUTO_PERSONALIZATION_DEFAULT,enabled:true,faqPresetsLoaded:true,faq:originalFaq};
    expect(h2AutoPersonalizationSchema.safeParse(config).success).toBe(true);
    const prepared=prepareH2AutoCommonFaq(config);
    expect(prepared.personalization.faq).toEqual(originalFaq);
    expect(prepared.added).toBe(0);
    const merged=mergeH2AutoExpandedFaq(config);
    expect(merged.personalization.faq.slice(0,65)).toEqual(originalFaq);
    expect(merged.personalization.faq.length).toBeGreaterThan(40);
    expect(h2AutoPersonalizationSchema.safeParse(merged.personalization).success).toBe(true);
  });
  it("preserva entradas existentes mesmo ao adicionar sugestões acima de 40",()=>{
    const rules=Array.from({length:45},(_,i)=>({
      id:`custom_${i}`,question:`Pergunta exclusiva ${i + 1}`,variations:"",
      answer:`Resposta exclusiva ${i + 1}`,enabled:false,
    }));
    const source={...H2_AUTO_PERSONALIZATION_DEFAULT,faq:rules};
    const prepared=prepareH2AutoCommonFaq(source);
    expect(prepared.personalization.faq.length).toBe(85);
    expect(prepared.personalization.faq.slice(0,45)).toEqual(rules);
    expect(h2AutoPersonalizationSchema.safeParse(prepared.personalization).success).toBe(true);
  });
  it("never answers a suggested FAQ before explicit individual activation",()=>{
    const p=prepareH2AutoCommonFaq({...H2_AUTO_PERSONALIZATION_DEFAULT,enabled:true}).personalization;
    expect(getH2AutoPersonalizedReply("Como faço login no site?",p)?.topic).not.toBe("personalizada");
    const enabled={...p,faq:p.faq.map(r=>r.id==="h2_login_cliente"?{...r,enabled:true}:r)};
    expect(getH2AutoPersonalizedReply("Como faço login no site?",enabled)?.message).toContain("https://h2colombiano.com/login");
  });
  it("enriches existing topic with variants without changing custom enabled status or rewriting custom answers",()=>{
    const original={...H2_AUTO_PERSONALIZATION_DEFAULT,faqPresetsLoaded:true,enabled:true,faq:[{id:"h2_pedido_demora",question:"Por que meu pedido está demorando?",variations:"Meu pedido está parado",answer:"Minha resposta personalizada",enabled:true}]};
    const merged=mergeH2AutoExpandedFaq(original);
    expect(merged.personalization.faq.find(x=>x.id==="h2_pedido_demora")?.answer).toBe("Minha resposta personalizada");
    expect(merged.personalization.faq.find(x=>x.id==="h2_pedido_demora")?.enabled).toBe(true);
    expect(merged.personalization.faq.find(x=>x.id==="h2_pedido_demora")?.variations).toContain("Quanto tempo demora para entregar?");
    expect(mergeH2AutoExpandedFaq(merged.personalization).personalization).toEqual(merged.personalization);
  });
  it("all 40 FAQ variants fit schema and existing 38 answers remain disabled",()=>{
    expect(H2_AUTO_FAQ_SUGGESTIONS).toHaveLength(40);
    for(const item of H2_AUTO_FAQ_SUGGESTIONS)expect(h2AutoPersonalizationSchema.safeParse({...H2_AUTO_PERSONALIZATION_DEFAULT,faq:[item]}).success).toBe(true);
  });
});
