import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function dbSource() {
  return readFile(new URL("./db.ts", import.meta.url), "utf8");
}

async function scheduleRouterSource() {
  return readFile(new URL("./routers/schedule.ts", import.meta.url), "utf8");
}

async function appRouterSource() {
  return readFile(new URL("./routers.ts", import.meta.url), "utf8");
}

describe("regras definitivas de consumo dos horarios", () => {
  it("ao finalizar consome o horario e nunca devolve bookedCount", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function completeAppointment");
    const end = source.indexOf("/**", start);
    const block = source.slice(start, end);
    expect(block).toContain("db.transaction");
    expect(block).toContain("tx.delete(scheduleSlots)");
    expect(block).not.toContain("bookedCount: sql`GREATEST");
    expect(block).not.toContain("slotDate: null");
    expect(block).not.toContain("slotTime: null");
    expect(block).toContain("[Schedule][consume] reason=completed");
  });

  it("ao trocar consome o horario antigo e preserva marcador de reagendamento", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function reopenAppointment");
    const end = source.indexOf("export async function completeAppointment", start);
    const block = source.slice(start, end);
    expect(block).toContain("db.transaction");
    expect(block).toContain("tx.delete(scheduleSlots)");
    expect(block).not.toContain("bookedCount: sql`GREATEST");
    expect(block).toContain("appt.confirmedAt ?? new Date()");
    expect(block).toContain("[Schedule][consume] reason=reschedule");
  });

  it("capacidade maior que um nao reabre vaga consumida", async () => {
    const source = await dbSource();
    expect(source).toContain("const otherConfirmed = await tx.select({ id: scheduleAppointments.id })");
    expect(source).toContain("capacity: otherConfirmed.length, bookedCount: otherConfirmed.length");
  });

  it("reagendamento nao oferece o mesmo dia", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function listAvailableScheduleSlots");
    const end = source.indexOf("// Cria múltiplos slots", start);
    const block = source.slice(start, end);
    expect(block).toContain("futureDaysOnly && r.slotDate <= today");
  });

  it("backend bloqueia tentativa de reagendar para hoje", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function confirmAppointment");
    const end = source.indexOf("// Lista todos os agendamentos", start);
    const block = source.slice(start, end);
    expect(block).toContain("if (appt.confirmedAt)");
    expect(block).toContain("if (slot.slotDate <= today)");
    expect(block).toContain("escolha uma data a partir de amanhã");
  });

  it("router oferece datas futuras somente para pending que ja foi agendado", async () => {
    const source = await scheduleRouterSource();
    expect(source).toContain("listAvailableScheduleSlots(appt.templateId ?? null, appt.status === 'pending' && Boolean(appt.confirmedAt))");
  });

  it("Foto em Analise automatico encerra pelo mesmo helper auditado", async () => {
    const source = await appRouterSource();
    expect(source).toContain("['foto_em_anal', 'foto_em_analise', 'foto_analise', 'em_analise'].includes(input.status)");
    expect(source).toContain("completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex, input.customerPhone)");
  });
});
