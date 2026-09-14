import { describe, expect, it } from "vitest";
import {
  normalizeSchedulePhone,
  selectEffectiveScheduleAppointment,
} from "../shared/scheduleAppointmentResolution";

type Appt = {
  id: number;
  status: string;
  customerPhone: string;
  token?: string;
};

describe("resolução do agendamento efetivo do pedido", () => {
  it("normaliza telefone com ou sem DDI 55", () => {
    expect(normalizeSchedulePhone("(11) 91892-9480")).toBe("11918929480");
    expect(normalizeSchedulePhone("55 (11) 91892-9480")).toBe("11918929480");
  });

  it("mantém vínculo direto quando ele está ativo", () => {
    const direct: Appt = { id: 20, status: "confirmed", customerPhone: "11918929480", token: "direto" };
    const newer: Appt = { id: 21, status: "pending", customerPhone: "11918929480", token: "outro" };
    expect(selectEffectiveScheduleAppointment(direct, [newer, direct], direct.customerPhone)?.token).toBe("direto");
  });

  it("recupera agendamento ativo mais novo pelo telefone após recadastro", () => {
    const directOld: Appt = { id: 30, status: "completed", customerPhone: "11918929480", token: "antigo" };
    const activeNew: Appt = { id: 31, status: "pending", customerPhone: "5511918929480", token: "ativo" };
    expect(selectEffectiveScheduleAppointment(directOld, [activeNew, directOld], "(11) 91892-9480")?.token).toBe("ativo");
  });

  it("não ressuscita confirmação antiga depois de cancelamento mais novo", () => {
    const oldConfirmed: Appt = { id: 40, status: "confirmed", customerPhone: "11918929480", token: "confirmado-antigo" };
    const latestCancelled: Appt = { id: 41, status: "cancelled", customerPhone: "11918929480", token: "cancelado" };
    expect(selectEffectiveScheduleAppointment(null, [oldConfirmed, latestCancelled], "11918929480")).toBeNull();
  });

  it("não troca vínculo concluído por agendamento ativo mais antigo", () => {
    const directCompleted: Appt = { id: 51, status: "completed", customerPhone: "11918929480", token: "concluido" };
    const olderConfirmed: Appt = { id: 50, status: "confirmed", customerPhone: "11918929480", token: "confirmado-antigo" };
    expect(selectEffectiveScheduleAppointment(directCompleted, [olderConfirmed, directCompleted], "11918929480")?.token).toBe("concluido");
  });

  it("encontra agendamento ativo quando não existe vínculo direto", () => {
    const active: Appt = { id: 61, status: "confirmed", customerPhone: "11918929480", token: "confirmado" };
    expect(selectEffectiveScheduleAppointment(null, [active], "5511918929480")?.token).toBe("confirmado");
  });
});
