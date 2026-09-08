from pathlib import Path

DB_PATH = Path("server/db.ts")
ROUTER_PATH = Path("server/routers/schedule.ts")
TEST_PATH = Path("server/scheduleConsumeRules.test.ts")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 bloco, encontrado {count}")
    return text.replace(old, new, 1)


def main() -> None:
    db = DB_PATH.read_text(encoding="utf-8")

    db = replace_once(
        db,
        "export async function listAvailableScheduleSlots(templateId?: number | null): Promise<ScheduleSlot[]> {",
        "export async function listAvailableScheduleSlots(templateId?: number | null, futureDaysOnly = false): Promise<ScheduleSlot[]> {",
        "assinatura listAvailableScheduleSlots",
    )

    db = replace_once(
        db,
        "    if (r.slotDate < today) return false;\n    // Para hoje: excluir horários que já passaram (sem grace period)",
        "    if (r.slotDate < today) return false;\n    // Reagendamento: nunca permite escolher novamente no mesmo dia.\n    if (futureDaysOnly && r.slotDate <= today) return false;\n    // Para hoje: excluir horários que já passaram (sem grace period)",
        "filtro futureDaysOnly",
    )

    old_reopen = '''// Permite reabrir um agendamento para o cliente reescolher (reagendar):
// libera o slot atual e volta status para 'pending'.
export async function reopenAppointment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
  if (rows.length === 0) return;
  const appt = rows[0];
  if (appt.slotId) {
    await db.update(scheduleSlots)
      .set({ bookedCount: sql`GREATEST(${scheduleSlots.bookedCount} - 1, 0)` })
      .where(eq(scheduleSlots.id, appt.slotId));
  }
  await db.update(scheduleAppointments).set({ status: 'pending', slotId: null, slotDate: null, slotTime: null, confirmedAt: null }).where(eq(scheduleAppointments.id, id));
}
'''
    new_reopen = '''// Permite reabrir um agendamento para o cliente reescolher (reagendar).
// REGRA: o horário abandonado é consumido definitivamente e some da grade.
// confirmedAt é preservado para marcar que este pending é um REAGENDAMENTO;
// assim o cliente só poderá escolher datas posteriores ao dia atual.
export async function reopenAppointment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
  if (rows.length === 0) return;
  const appt = rows[0];
  const oldSlotId = appt.slotId;
  await db.update(scheduleAppointments)
    .set({ status: 'pending', slotId: null, slotDate: null, slotTime: null })
    .where(eq(scheduleAppointments.id, id));
  if (oldSlotId) {
    await db.delete(scheduleSlots).where(eq(scheduleSlots.id, oldSlotId));
  }
}
'''
    db = replace_once(db, old_reopen, new_reopen, "reopenAppointment")

    old_complete = '''export async function completeAppointment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
  if (rows.length === 0) return;
  const appt = rows[0];
  // liberar o slot se estava confirmado
  if (appt.status === 'confirmed' && appt.slotId) {
    await db.update(scheduleSlots)
      .set({ bookedCount: sql`GREATEST(${scheduleSlots.bookedCount} - 1, 0)` })
      .where(eq(scheduleSlots.id, appt.slotId));
  }
  await db.update(scheduleAppointments).set({ status: 'completed', slotId: null, slotDate: null, slotTime: null }).where(eq(scheduleAppointments.id, id));
}
'''
    new_complete = '''export async function completeAppointment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
  if (rows.length === 0) return;
  const appt = rows[0];
  const consumedSlotId = appt.status === 'confirmed' ? appt.slotId : null;
  await db.update(scheduleAppointments)
    .set({ status: 'completed', slotId: null, slotDate: null, slotTime: null })
    .where(eq(scheduleAppointments.id, id));
  // REGRA: atendimento finalizado consome o horário. Ele não volta para a grade.
  if (consumedSlotId) {
    await db.delete(scheduleSlots).where(eq(scheduleSlots.id, consumedSlotId));
  }
}
'''
    db = replace_once(db, old_complete, new_complete, "completeAppointment")

    old_slot_check = '''  const slot = slotRows[0];
  if (slot.status !== 'available') return { ok: false, reason: 'Este horário não está mais disponível' };

  // Reserva atômica: só incrementa se ainda houver vaga
'''
    new_slot_check = '''  const slot = slotRows[0];
  if (slot.status !== 'available') return { ok: false, reason: 'Este horário não está mais disponível' };

  // Se este pedido já teve um horário e voltou para pending, é reagendamento:
  // a nova escolha deve ser obrigatoriamente em um dia posterior ao dia atual (São Paulo).
  if (appt.confirmedAt) {
    const now = new Date();
    const localDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const year = localDate.getUTCFullYear();
    const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(localDate.getUTCDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    if (slot.slotDate <= today) {
      return { ok: false, reason: 'Para trocar o horário, escolha uma data a partir de amanhã.' };
    }
  }

  // Reserva atômica: só incrementa se ainda houver vaga
'''
    db = replace_once(db, old_slot_check, new_slot_check, "validacao de reagendamento")
    DB_PATH.write_text(db, encoding="utf-8")

    router = ROUTER_PATH.read_text(encoding="utf-8")
    old_slots = "  const slots = updateRequired ? [] : await listAvailableScheduleSlots(appt.templateId ?? null);"
    new_slots = "  const slots = updateRequired ? [] : await listAvailableScheduleSlots(appt.templateId ?? null, appt.status === 'pending' && Boolean(appt.confirmedAt));"
    router = replace_once(router, old_slots, new_slots, "buildAuthenticatedScheduleData slots")
    ROUTER_PATH.write_text(router, encoding="utf-8")

    test = '''import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function dbSource() {
  return readFile(new URL("./db.ts", import.meta.url), "utf8");
}

async function routerSource() {
  return readFile(new URL("./routers/schedule.ts", import.meta.url), "utf8");
}

describe("regras definitivas de consumo dos horarios", () => {
  it("ao finalizar o horario some da grade em vez de voltar", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function completeAppointment");
    const end = source.indexOf("/**", start);
    const block = source.slice(start, end);
    expect(block).toContain("db.delete(scheduleSlots)");
    expect(block).not.toContain("bookedCount: sql`GREATEST");
  });

  it("ao trocar o horario antigo some da grade em vez de voltar", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function reopenAppointment");
    const end = source.indexOf("export async function completeAppointment", start);
    const block = source.slice(start, end);
    expect(block).toContain("db.delete(scheduleSlots)");
    expect(block).not.toContain("bookedCount: sql`GREATEST");
    expect(block).not.toContain("confirmedAt: null");
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

  it("router ativa futureDaysOnly somente para pending que ja foi agendado", async () => {
    const source = await routerSource();
    expect(source).toContain("listAvailableScheduleSlots(appt.templateId ?? null, appt.status === 'pending' && Boolean(appt.confirmedAt))");
  });
});
'''
    TEST_PATH.write_text(test, encoding="utf-8")
    print("OK: regras de consumo definitivo e reagendamento futuro aplicadas")


if __name__ == "__main__":
    main()
