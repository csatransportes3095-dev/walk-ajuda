import { describe, expect, it } from "vitest";
import { classifyScheduleProfileCustomer } from "./scheduleProfileGuard";

const completeCustomer = {
  name: "JOAO DA SILVA",
  phone: "11999999999",
  email: "joao@example.com",
  cpf: "52998224725",
  zipCode: "06454000",
  addressLine: "RUA DAS FLORES",
  neighborhood: "CENTRO",
  addressNumber: "123",
  city: "BARUERI",
  uf: "SP",
  profilePhotoUrl: "https://example.com/foto.jpg",
  blocked: 0,
};

describe("scheduleProfileGuard", () => {
  it("libera somente cadastro principal completo", () => {
    expect(classifyScheduleProfileCustomer(completeCustomer, completeCustomer.phone).status).toBe("complete");
  });

  it("manda cadastro incompleto para a atualização central", () => {
    const state = classifyScheduleProfileCustomer({ ...completeCustomer, profilePhotoUrl: "" }, completeCustomer.phone);
    expect(state.status).toBe("required");
    expect(state.missing).toContain("profilePhotoUrl");
  });

  it("bloqueia cadastro bloqueado", () => {
    expect(classifyScheduleProfileCustomer({ ...completeCustomer, blocked: 1 }, completeCustomer.phone).status).toBe("blocked");
  });

  it("não libera agendamento sem cadastro principal", () => {
    expect(classifyScheduleProfileCustomer(null, completeCustomer.phone)).toEqual({ status: "not_found", phone: completeCustomer.phone, missing: [] });
  });
});
