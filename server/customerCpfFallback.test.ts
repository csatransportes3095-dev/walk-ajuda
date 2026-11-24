import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
const api=readFileSync("server/customerOtpAccess.ts","utf8");
const router=readFileSync("server/routers/customerPassword.ts","utf8");
const component=readFileSync("client/src/components/CustomerOtpLogin.tsx","utf8");
describe("Fallback CPF completo em login H2",()=>{
  it("aparece depois de solicitar o código e exige os onze dígitos",()=>{
    const codeStep=component.slice(component.indexOf('<form onSubmit={confirm}'),component.indexOf('          </form>',component.indexOf('<form onSubmit={confirm}')));
    expect(codeStep).toContain("Não recebeu o código");
    expect(codeStep).toContain("Não recebeu o código? Entrar com CPF");
    expect(codeStep).toContain('data-testid="h2-otp-cpf-login"');
    expect(codeStep).toContain('maxLength={11}');
    expect(codeStep).toContain('cpf.length !== 11');
    expect(component).toContain('trpc.customerPassword.verifyCustomerCpf.useMutation()');
    expect(component).toContain('await onAuthenticated({');
  });
  it("não cria OTP e reutiliza a validação de sessão",()=>{
    const cpf=api.slice(api.indexOf('export async function verifyCustomerCpf('),api.indexOf('/** Proof previously generated'));
    expect(cpf).toContain("isValidCPF(cpf)");
    expect(cpf).toContain("uniqueCustomer(tx,phone)");
    expect(cpf).toContain("getRegistrationReviewStatus(tx");
    expect(cpf).toContain('maximum:5');
    expect(cpf).toContain('maximum:25');
    expect(cpf).toContain('return issueSession(tx,customer,now)');
    expect(cpf).not.toContain("deliverOwnSiteCode(");
    expect(cpf).not.toContain("enqueueIncomingWhatsappOtp(");
    expect(router).toContain('verifyCustomerCpf: publicProcedure');
  });
});
