import { afterEach, describe, expect, it } from "vitest";
import { isRecoveredCustomerName } from "../shared/customerProfile";
import {
  createScheduleAccessToken,
  missingCustomerFields,
  shouldBlockScheduleCompletion,
  phonesMatch,
  verifyScheduleAccessToken,
  getCustomerPasswordState,
} from "./routers/schedule";

const originalSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

describe("acesso protegido do agendamento", () => {
  it("aceita telefone com e sem nono dígito quando representam o mesmo cadastro", () => {
    expect(phonesMatch("(11) 9999-1234", "1199991234")).toBe(true);
    expect(phonesMatch("(11) 8888-1234", "1199991234")).toBe(false);
  });

  it("identifica nomes provisórios recuperados em qualquer posição", () => {
    expect(isRecoveredCustomerName("CLIENTE RECUPERADO 5852")).toBe(true);
    expect(isRecoveredCustomerName("Pessoa Recuperada")).toBe(true);
    expect(isRecoveredCustomerName("CLIENTE RECUPEADO 5852")).toBe(true);
    expect(isRecoveredCustomerName("Maria de Souza")).toBe(false);
  });

  it("sinaliza somente os campos incompletos do cadastro principal", () => {
    expect(missingCustomerFields({
      name: "Cliente Recuperado",
      email: "",
      cpf: "00000000000",
      city: "São Paulo",
      uf: "SP",
      profilePhotoUrl: "https://example.invalid/photo.jpg",
    })).toEqual(["name", "email", "cpf"]);

    expect(missingCustomerFields({
      name: "Cliente Recuperado 5852",
      email: "cliente@example.com",
      cpf: "52998224725",
      city: "São Paulo",
      uf: "SP",
      profilePhotoUrl: "https://example.invalid/photo.jpg",
    })).toContain("name");

    expect(missingCustomerFields({
      name: "Pessoa Completa",
      email: "cliente@example.com",
      cpf: "52998224725",
      city: "São Paulo",
      uf: "SP",
      profilePhotoUrl: "https://example.invalid/photo.jpg",
    })).toEqual([]);
  });

  it("bloqueia a finalização somente quando o modo obrigatório está ativo e há pendências", () => {
    const completeCustomer = {
      name: "Pessoa Completa",
      email: "cliente@example.com",
      cpf: "52998224725",
      city: "São Paulo",
      uf: "SP",
      profilePhotoUrl: "https://example.invalid/photo.jpg",
    };
    expect(shouldBlockScheduleCompletion(true, completeCustomer)).toBe(false);
    expect(shouldBlockScheduleCompletion(false, { ...completeCustomer, profilePhotoUrl: "" })).toBe(false);
    expect(shouldBlockScheduleCompletion(true, { ...completeCustomer, profilePhotoUrl: "" })).toBe(true);
    expect(shouldBlockScheduleCompletion(true, { ...completeCustomer, email: "" })).toBe(true);
  });

  it("classifica corretamente a ausência, expiração, aprovação e ativação da senha", () => {
    expect(getCustomerPasswordState(null)).toBe("no_password");
    expect(getCustomerPasswordState({ expiresAt: new Date(Date.now() - 1) })).toBe("expired");
    expect(getCustomerPasswordState({ pendingApproval: 1, expiresAt: new Date(Date.now() + 60_000) })).toBe("pending_approval");
    expect(getCustomerPasswordState({ pendingApproval: 0, expiresAt: new Date(Date.now() + 60_000) })).toBe("active");
  });

  it("vincula a sessão ao token do agendamento e rejeita adulteração", () => {
    process.env.JWT_SECRET = "schedule-test-secret-with-more-than-16";
    const access = createScheduleAccessToken("appointment-token", 42);
    expect(verifyScheduleAccessToken(access, "appointment-token")).toMatchObject({
      appointmentToken: "appointment-token",
      customerId: 42,
    });
    expect(verifyScheduleAccessToken(access, "other-appointment-token")).toBeNull();
    const tampered = `${access.slice(0, -1)}${access.endsWith("a") ? "b" : "a"}`;
    expect(verifyScheduleAccessToken(tampered, "appointment-token")).toBeNull();
  });
});
