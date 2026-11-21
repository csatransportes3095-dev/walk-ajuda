import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { H2_AUTO_BOT_DIRECT_LINK, H2_AUTO_BOT_LINK_FAQ } from "../shared/h2AutoFaqPresets";
import { h2AutoFaqRuleSchema } from "../shared/h2AutoPersonalization";

const read=(path:string)=>readFileSync(path,"utf8");
const app=read("client/src/App.tsx");
const home=read("client/src/pages/Home.tsx");
const bot=read("client/src/components/ColombiaBot.tsx");
const otpGate=read("client/src/components/CustomerOtpSiteGate.tsx");
const update=read("client/src/pages/AtualizarCadastro.tsx");
const admin=read("client/src/pages/AdminH2Auto.tsx");

describe("Link direto do ColombiaBot com login H2 preservado",()=>{
  it("reutiliza a rota /bot e o gate de login do site",()=>{
    expect(app).toContain('<Route path={"/bot"} component={Home} />');
    expect(app).toContain('<UnifiedCustomerGate>');
    expect(home).toContain('directEntry={matchBot}');
    expect(home).toContain('if (matchBot && products && products.length > 0 && !botAutoOpened)');
  });
  it("inicia o serviço sem perguntar entre bot e site somente no link direto",()=>{
    expect(bot).toContain("if (!directEntry)");
    expect(bot).toContain("startWelcome();");
    expect(bot).toContain("askService();");
    expect(bot).toContain("if (!restoreBotProgress()) startEntry();");
    expect(bot).toContain("startEntry();");
    expect(bot).toContain('options: [`🤖 Quero ajuda do ${displayName}`, "Continuar sozinho"]');
  });
  it("mantém autenticação por token e OTP e retorna /bot após atualização de cadastro",()=>{
    expect(otpGate).toContain('trpc.customerPassword.checkSession.useQuery(');
    expect(otpGate).toContain('trpc.spreadsheet.checkRouteAccess.useQuery(');
    expect(otpGate).toContain('if (window.location.pathname === "/bot") sessionStorage.setItem("h2_customer_return_to", "/bot")');
    expect(update).toContain('"/bot", "/acompanhar"');
  });
  it("FAQ do H2 AUTO é válida e não concede acesso por link",()=>{
    expect(H2_AUTO_BOT_DIRECT_LINK).toBe("https://h2colombiano.com/bot");
    expect(h2AutoFaqRuleSchema.safeParse(H2_AUTO_BOT_LINK_FAQ).success).toBe(true);
    expect(H2_AUTO_BOT_LINK_FAQ.answer).toContain(H2_AUTO_BOT_DIRECT_LINK);
    expect(H2_AUTO_BOT_LINK_FAQ.answer).toContain("\n");
    expect(admin).toContain("H2_AUTO_BOT_LINK_FAQ");
    expect(admin).toContain("+ ADICIONAR RESPOSTA DO ROBÔ");
    expect(admin).toContain("SALVAR PERGUNTA");
  });
});
