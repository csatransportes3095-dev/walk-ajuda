import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
const api=readFileSync("server/customerOtpAccess.ts","utf8");
const router=readFileSync("server/routers/customerPassword.ts","utf8");
const component=readFileSync("client/src/components/CustomerOtpLogin.tsx","utf8");
describe("Fallback CPF e data de nascimento em login H2",()=>{
  it("aparece no login e exige CPF e data",()=>{
    const codeStep=component.slice(component.indexOf('<form onSubmit={confirm}'),component.indexOf('          </form>',component.indexOf('<form onSubmit={confirm}')));
    expect(codeStep).toContain("Não recebeu o código");
    expect(component).toContain("ENTRAR COM CPF E DATA DE NASCIMENTO");
    expect(component).toContain('data-testid="h2-cpf-birth-login"');
    expect(component).toContain('maxLength={11}');
    expect(component).toContain('id="h2-birth-direct"');
    expect(component).toContain('trpc.customerPassword.verifyCustomerCpf.useMutation()');
    expect(component).toContain('await onAuthenticated({');
  });
  it("não cria OTP e reutiliza a validação de sessão",()=>{
    const cpf=api.slice(api.indexOf('export async function verifyCustomerCpfBirthDate('),api.indexOf('/** Proof previously generated'));
    expect(cpf).toContain("isValidCPF(cpf)");
    expect(cpf).toContain("isValidCustomerBirthDate(birthDate)");
    expect(cpf).toContain("readCustomerBirthDate(tx");
    expect(cpf).toContain("getRegistrationReviewStatus(tx");
    expect(cpf).toContain('maximum:5');
    expect(cpf).toContain('maximum:20');
    expect(cpf).toContain('return issueSession(tx,customer,now)');
    expect(cpf).not.toContain("deliverOwnSiteCode(");
    expect(cpf).not.toContain("enqueueIncomingWhatsappOtp(");
    expect(router).toContain('birthDate: z.string().regex');
    expect(router).toContain('verifyCustomerCpfBirthDate');
  });
});
