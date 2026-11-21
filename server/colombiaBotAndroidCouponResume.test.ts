import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isUsableBotCouponCode,
  resolveBotCouponChoice,
  resolveBotResumeStep,
  sameBotSelectOption,
} from "../client/src/lib/colombiaBotFlow";

const source = readFileSync("client/src/components/ColombiaBot.tsx", "utf8");

describe("ColombiaBot: Android, cupom e retomada", () => {
  it("preserva respostas SIM/NÃO de subperguntas, inclusive com acentos e espaços", () => {
    expect(sameBotSelectOption(" Sim ", "SIM")).toBe(true);
    expect(sameBotSelectOption("NÃO", "NAO")).toBe(true);
    expect(sameBotSelectOption("SIM", "NÃO")).toBe(false);
    expect(source).toContain("sameBotSelectOption(parentAnswer, q.triggerOption)");
    expect(source).toContain("if (!opts.some(opt => sameBotSelectOption(val, opt))) return;");
  });

  it("separa a escolha do cupom das respostas do Android", () => {
    expect(resolveBotCouponChoice("SIM, TENHO UM CUPOM")).toBe("enter-code");
    expect(resolveBotCouponChoice("NÃO TENHO CUPOM")).toBe("skip");
    expect(resolveBotCouponChoice("NAO TENHO CUPOM")).toBe("skip");
    expect(resolveBotCouponChoice("SIM")).toBe("invalid");
    expect(resolveBotCouponChoice("NÃO")).toBe("invalid");
    expect(source).toContain("const couponChoice = resolveBotCouponChoice(answer)");
    expect(source).toContain("flowState.current.couponCode = '';");
    expect(source).toContain("queueAdvance(() => askPix(product, option), 400)");
  });

  it("não aceita código de cupom em branco", () => {
    expect(isUsableBotCouponCode("  ")).toBe(false);
    expect(isUsableBotCouponCode("H2TESTE")).toBe(true);
    expect(source).toContain("if (!isUsableBotCouponCode(code) || isValidatingCoupon) return;");
  });

  it("nunca pula perguntas ou documentos por um marcador de pagamento antigo", () => {
    expect(resolveBotResumeStep({hasUnansweredQuestions: true,hasMissingRequiredDocuments:false,wasAtPayment:true})).toBe("questions");
    expect(resolveBotResumeStep({hasUnansweredQuestions:false,hasMissingRequiredDocuments:true,wasAtPayment:true})).toBe("documents");
    expect(resolveBotResumeStep({hasUnansweredQuestions:false,hasMissingRequiredDocuments:false,wasAtPayment:true})).toBe("payment");
    expect(resolveBotResumeStep({hasUnansweredQuestions:false,hasMissingRequiredDocuments:false,wasAtPayment:false})).toBe("coupon");
  });

  it("usa temporizador real e limpa rascunho antes de recomeçar", () => {
    expect(source).toContain("window.setTimeout(() => {");
    expect(source).not.toContain("window.queueAdvance(");
    expect(source).toContain("cancelPendingAdvances();\n              clearCompletedBotProgress();");
    expect(source).toContain("startWelcome();");
  });
});
