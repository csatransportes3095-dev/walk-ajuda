import { describe, it, expect } from "vitest";
import { H2_AUTO_PHONE_MAX_ATTEMPTS, h2AutoPhoneFailureMessage } from "./h2-auto-phone-attempt-message";
import { h2AutoNavigationCommand } from "./h2-auto-validation-policy";

describe("H2 AUTO - 3 tentativas de telefone por conversa", () => {
  it("limita a 3 e avisa as duas chances restantes", () => {
    expect(H2_AUTO_PHONE_MAX_ATTEMPTS).toBe(3);
    const first=h2AutoPhoneFailureMessage("cadastro","formato",1);
    expect(first).toContain("*TENTATIVA 1 DE 3*");
    expect(first).toContain("*RESTAM 2 TENTATIVAS*");
    expect(first).toContain("Informe um celular válido");
    expect(first).toContain("com DDD. Aceitamos espaços,");
    expect(first).toContain("hífens, parênteses e +55.");
    expect(first).toContain("*MENU* para início");
    expect(first).toContain("*0* para voltar");
    expect(first).not.toContain("ATENDIMENTO SUSPENSO");
  });
  it("na segunda tentativa avisa que resta uma", () => {
    const second=h2AutoPhoneFailureMessage("indicador","nao_confirmado",2);
    expect(second).toContain("*INDICADOR NÃO VALIDADO*");
    expect(second).toContain("*TENTATIVA 2 DE 3*");
    expect(second).toContain("*RESTA 1 TENTATIVA*");
    expect(second).toContain("indicador");
  });
  it("na terceira informa suspensão e encaminha ao ADM", () => {
    for (const type of ["cadastro","indicador","indicacoes"] as const) {
      const last=h2AutoPhoneFailureMessage(type,"nao_confirmado",3);
      expect(last).toContain("*ATENDIMENTO SUSPENSO*");
      expect(last).toContain("*3 DE 3 TENTATIVAS UTILIZADAS*");
      expect(last).toContain("até a liberação pelo ADM");
    }
  });
  it("MENU e 0 são comandos, não erros de telefone", () => {
    expect(h2AutoNavigationCommand("menu")).toBe("home");
    expect(h2AutoNavigationCommand("0")).toBe("back");
    expect(h2AutoNavigationCommand("11982396550")).toBe(null);
  });
  it("mantém respostas com quebras para celular", () => {
    const msg=h2AutoPhoneFailureMessage("cadastro","nao_confirmado",1);
    for (const line of msg.split("\n"))
      expect(line.length).toBeLessThanOrEqual(65);
  });
});
