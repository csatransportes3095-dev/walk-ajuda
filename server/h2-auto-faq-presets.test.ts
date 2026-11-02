import { describe,it,expect } from "vitest";
import { H2_AUTO_FAQ_SUGGESTIONS,prepareH2AutoCommonFaq,mergeH2AutoExpandedFaq } from "../shared/h2AutoFaqPresets";
import { H2_AUTO_PERSONALIZATION_DEFAULT,h2AutoPersonalizationSchema,getH2AutoPersonalizedReply } from "../shared/h2AutoPersonalization";
describe("H2 AUTO prefilled FAQ suggestions",()=>{
  it("provides 40 distinct complete answers, inactive by default",()=>{
    expect(H2_AUTO_FAQ_SUGGESTIONS).toHaveLength(40);
    expect(new Set(H2_AUTO_FAQ_SUGGESTIONS.map(x=>x.id)).size).toBe(38);
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
    expect(first.added).toBe(39);
    const removed={...first.personalization,faq:first.personalization.faq.filter(x=>x.id!=="h2_login_cliente")};
    expect(prepareH2AutoCommonFaq(removed).added).toBe(0);
    expect(prepareH2AutoCommonFaq(removed).personalization.faq.some(x=>x.id==="h2_login_cliente")).toBe(false);
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
