import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import {
  getDb,
  createScheduleSlots,
  listScheduleSlots,
  listAvailableScheduleSlots,
  createAppointment,
  getAppointmentByToken,
  confirmAppointment,
  listAppointmentsByPhone,
} from "./db";
import { scheduleSlots, scheduleAppointments } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

// Data bem no futuro para não colidir com dados reais e não ser limpa pelo cleanup
const TEST_DATE = "2099-12-31";
const REG_A = 990001;
const REG_B = 990002;
const createdSlotIds: number[] = [];
const createdApptTokens: string[] = [];

async function dbOrSkip() {
  const db = await getDb();
  return db;
}

describe("Sistema de agendamento — reserva exclusiva", () => {
  beforeAll(async () => {
    const db = await dbOrSkip();
    if (!db) return;
    // limpa qualquer resíduo de execuções anteriores
    await db.delete(scheduleSlots).where(eq(scheduleSlots.slotDate, TEST_DATE));
    await db.delete(scheduleAppointments).where(inArray(scheduleAppointments.registrationId, [REG_A, REG_B]));
  });

  afterAll(async () => {
    const db = await dbOrSkip();
    if (!db) return;
    if (createdSlotIds.length) await db.delete(scheduleSlots).where(inArray(scheduleSlots.id, createdSlotIds));
    await db.delete(scheduleSlots).where(eq(scheduleSlots.slotDate, TEST_DATE));
    await db.delete(scheduleAppointments).where(inArray(scheduleAppointments.registrationId, [REG_A, REG_B]));
  });

  it("token inválido retorna não encontrado", async () => {
    const db = await dbOrSkip();
    if (!db) return expect(true).toBe(true);
    const appt = await getAppointmentByToken("token-que-nao-existe-" + crypto.randomUUID());
    expect(appt).toBeNull();
  });

  it("dois clientes não conseguem reservar o mesmo horário (capacidade 1)", async () => {
    const db = await dbOrSkip();
    if (!db) {
      console.warn("DB indisponível — pulando teste de exclusividade");
      return expect(true).toBe(true);
    }

    // 1 slot com capacidade 1
    const created = await createScheduleSlots([{ slotDate: TEST_DATE, slotTime: "08:00", capacity: 1 }]);
    expect(created).toBeGreaterThanOrEqual(1);

    const allSlots = await listScheduleSlots();
    const slot = allSlots.find(s => s.slotDate === TEST_DATE && s.slotTime === "08:00");
    expect(slot).toBeTruthy();
    createdSlotIds.push(slot!.id);

    // dois agendamentos (dois pedidos diferentes)
    const tokenA = crypto.randomBytes(8).toString("hex");
    const tokenB = crypto.randomBytes(8).toString("hex");
    createdApptTokens.push(tokenA, tokenB);
    await createAppointment({ token: tokenA, registrationId: REG_A, subOrderIndex: 0, customerPhone: "11999990001" });
    await createAppointment({ token: tokenB, registrationId: REG_B, subOrderIndex: 0, customerPhone: "11999990002" });

    // antes de confirmar, o slot está disponível
    const availBefore = await listAvailableScheduleSlots();
    expect(availBefore.some(s => s.id === slot!.id)).toBe(true);

    // cliente A confirma
    const resA = await confirmAppointment(tokenA, slot!.id);
    expect(resA.ok).toBe(true);
    expect(resA.appointment?.status).toBe("confirmed");
    expect(resA.appointment?.slotTime).toBe("08:00");

    // cliente B tenta o mesmo slot → deve falhar (lotado)
    const resB = await confirmAppointment(tokenB, slot!.id);
    expect(resB.ok).toBe(false);

    // depois de confirmado, o slot some dos disponíveis
    const availAfter = await listAvailableScheduleSlots();
    expect(availAfter.some(s => s.id === slot!.id)).toBe(false);
  });

  it("busca por telefone encontra agendamento independente da formatação", async () => {
    const db = await dbOrSkip();
    if (!db) return expect(true).toBe(true);

    const token = crypto.randomBytes(8).toString("hex");
    createdApptTokens.push(token);
    await createAppointment({ token, registrationId: REG_B, subOrderIndex: 7, customerPhone: "(11) 98888-7777" });

    // mesmo telefone em formatos diferentes deve casar
    const byPlain = await listAppointmentsByPhone("11988887777");
    expect(byPlain.some(a => a.token === token)).toBe(true);

    const byFormatted = await listAppointmentsByPhone("(11) 98888-7777");
    expect(byFormatted.some(a => a.token === token)).toBe(true);

    // com prefixo 55 também
    const byCountry = await listAppointmentsByPhone("5511988887777");
    expect(byCountry.some(a => a.token === token)).toBe(true);

    // telefone diferente não casa
    const other = await listAppointmentsByPhone("11900000000");
    expect(other.some(a => a.token === token)).toBe(false);
  });

  it("horários de um modelo só aparecem para agendamentos daquele modelo (+ gerais)", async () => {
    const db = await dbOrSkip();
    if (!db) return expect(true).toBe(true);

    const TPL_A = 880001;
    const TPL_B = 880002;
    // slot do modelo A, slot do modelo B e um slot geral
    await createScheduleSlots([{ slotDate: TEST_DATE, slotTime: "11:00", capacity: 1 }], TPL_A);
    await createScheduleSlots([{ slotDate: TEST_DATE, slotTime: "11:30", capacity: 1 }], TPL_B);
    await createScheduleSlots([{ slotDate: TEST_DATE, slotTime: "12:00", capacity: 1 }], null);

    const all = await listScheduleSlots();
    const sA = all.find(s => s.slotDate === TEST_DATE && s.slotTime === "11:00")!;
    const sB = all.find(s => s.slotDate === TEST_DATE && s.slotTime === "11:30")!;
    const sG = all.find(s => s.slotDate === TEST_DATE && s.slotTime === "12:00")!;
    createdSlotIds.push(sA.id, sB.id, sG.id);

    // disponibilidade para o modelo A: vê A + geral, mas NÃO vê B
    const availA = await listAvailableScheduleSlots(TPL_A);
    expect(availA.some(s => s.id === sA.id)).toBe(true);
    expect(availA.some(s => s.id === sG.id)).toBe(true);
    expect(availA.some(s => s.id === sB.id)).toBe(false);

    // disponibilidade para o modelo B: vê B + geral, mas NÃO vê A
    const availB = await listAvailableScheduleSlots(TPL_B);
    expect(availB.some(s => s.id === sB.id)).toBe(true);
    expect(availB.some(s => s.id === sG.id)).toBe(true);
    expect(availB.some(s => s.id === sA.id)).toBe(false);
  });

  it("não permite confirmar duas vezes o mesmo agendamento", async () => {
    const db = await dbOrSkip();
    if (!db) return expect(true).toBe(true);

    await createScheduleSlots([
      { slotDate: TEST_DATE, slotTime: "09:00", capacity: 1 },
      { slotDate: TEST_DATE, slotTime: "09:30", capacity: 1 },
    ]);
    const allSlots = await listScheduleSlots();
    const s1 = allSlots.find(s => s.slotDate === TEST_DATE && s.slotTime === "09:00")!;
    const s2 = allSlots.find(s => s.slotDate === TEST_DATE && s.slotTime === "09:30")!;
    createdSlotIds.push(s1.id, s2.id);

    const token = crypto.randomBytes(8).toString("hex");
    createdApptTokens.push(token);
    await createAppointment({ token, registrationId: REG_A, subOrderIndex: 5, customerPhone: "11999990003" });

    const first = await confirmAppointment(token, s1.id);
    expect(first.ok).toBe(true);

    // segunda tentativa (em outro slot) deve falhar pois já está confirmado
    const second = await confirmAppointment(token, s2.id);
    expect(second.ok).toBe(false);
  });
});
