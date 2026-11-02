import { describe,it,expect } from "vitest";
import { H2_AUTO_FAQ_SUGGESTIONS,prepareH2AutoCommonFaq } from "../shared/h2AutoFaqPresets";
import { H2_AUTO_PERSONALIZATION_DEFAULT,h2AutoPersonalizationSchema,getH2AutoPersonalizedReply } from "../shared/h2AutoPersonalization";
describe("H2 AUTO prefilled FAQ suggestions",()=>{
  it("provides 38 distinct complete answers, inactive by default",()=>{
    expect(H2_AUTO_FAQ_SUGGESTIONS).toHaveLength(38);
    expect(new Set(H2_AUTO_FAQ_SUGGESTIONS.map(x=>x.id)).size).toBe(38);
    for(const r of H2_AUTO_FAQ_SUGGESTIONS) {
      expect(r.enabled).toBe(false);
      expect(h2AutoPersonalizationSchema.shape.faq.element.safeParse(r).success).toBe(true);
      expect(r.answer).toContain("*");
    }
  });
  it("fills an empty device without changing enabled state",()=>{
    const p=prepareH2AutoCommonFaq(H2_AUTO_PERSONALIZATION_DEFAULT);
    expect(p.added).toBe(38);
    expect(p.personalization.enabled).toBe(false);
    expect(p.personalization.faq.every(x=>!x.enabled)).toBe(true);
    expect(h2AutoPersonalizationSchema.safeParse(p.personalization).success).toBe(true);
  });
  it("preserves existing rules and does not repopulate deleted items after saved",()=>{
    const existing={...H2_AUTO_PERSONALIZATION_DEFAULT,enabled:true,faq:[{id:"mine",question:"Minha pergunta",variations:"",answer:"Minha resposta",enabled:true}]};
    const first=prepareH2AutoCommonFaq(existing);
    expect(first.personalization.faq[0]).toEqual(existing.faq[0]);
    expect(first.personalization.enabled).toBe(true);
    expect(first.added).toBe(38);
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
});
