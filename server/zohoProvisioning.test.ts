import { describe, expect, it } from "vitest";
import { buildZohoCreateUserPayload, describeZohoApiError, resolveZohoProvisioningDomain } from "./zohoProvisioning";

describe("zohoProvisioning", () => {
  it("prefere o domínio observado nas contas reais quando a configuração está errada", () => {
    expect(resolveZohoProvisioningDomain("walkajuda.com", [
      { primaryEmailAddress: "h2@h2colombiano.com" },
      { primaryEmailAddress: "igor@h2colombiano.com" },
    ])).toBe("h2colombiano.com");
  });

  it("mantém o domínio configurado quando ainda não há usuários para inferir", () => {
    expect(resolveZohoProvisioningDomain("@walkajuda.com", [])).toBe("walkajuda.com");
  });

  it("envia o payload documentado com papel de membro", () => {
    expect(buildZohoCreateUserPayload({
      primaryEmailAddress: " Olivia.Teste@WalkAjuda.com ",
      displayName: " Olivia Araujo ",
      password: "Walk@@3095",
      firstName: " Olivia ",
      lastName: " Araujo ",
    })).toEqual({
      primaryEmailAddress: "olivia.teste@walkajuda.com",
      password: "Walk@@3095",
      firstName: "Olivia",
      lastName: "Araujo",
      displayName: "Olivia Araujo",
      role: "member",
      oneTimePassword: false,
    });
  });

  it("preserva o motivo de um Internal Error do Zoho", () => {
    expect(describeZohoApiError({ status: { code: 500, description: "Internal Error" }, data: {} }, 500)).toEqual({
      message: "Internal Error",
      errorCode: "",
    });
  });

  it("entende também a resposta antiga em array do Zoho", () => {
    expect(describeZohoApiError([0, { msg: "USERNAME_NOT_SET" }], 500).message).toContain("USERNAME_NOT_SET");
  });
});
