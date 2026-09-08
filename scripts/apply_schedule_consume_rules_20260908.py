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

    # 1) Reagendamento nunca oferece o mesmo dia.
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

    # 2) Reabrir para troca consome a vaga antiga definitivamente.
    # A operação é transacional para não existir estado intermediário em que
    # o agendamento foi solto mas o slot continuou disponível.
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
// REGRA: o horário abandonado é consumido definitivamente e não volta para a grade.
// confirmedAt é preservado (ou criado para legado) como marcador de REAGENDAMENTO,
// fazendo a nova escolha começar somente no dia seguinte.
export async function reopenAppointment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  let audit: { slotId: number | null; slotDate: string | null; slotTime: string | null; registrationId: number; subOrderIndex: number } | null = null;

  await db.transaction(async (tx) => {
    const rows = await tx.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
    if (rows.length === 0) return;
    const appt = rows[0];
    const oldSlotId = appt.slotId;
    const wasPreviouslyScheduled = appt.status === 'confirmed' || Boolean(appt.confirmedAt) || Boolean(appt.slotId);

    audit = {
      slotId: oldSlotId,
      slotDate: appt.slotDate,
      slotTime: appt.slotTime,
      registrationId: appt.registrationId,
      subOrderIndex: appt.subOrderIndex,
    };

    await tx.update(scheduleAppointments)
      .set({
        status: 'pending',
        slotId: null,
        slotDate: null,
        slotTime: null,
        confirmedAt: wasPreviouslyScheduled ? (appt.confirmedAt ?? new Date()) : null,
      })
      .where(eq(scheduleAppointments.id, id));

    if (oldSlotId) {
      // Se o admin configurou capacidade > 1, não apagamos um slot que ainda possua
      // outro cliente confirmado. Neste caso congelamos o slot como lotado, sem
      // devolver a vaga abandonada. Quando o último confirmado sair, o slot é apagado.
      const otherConfirmed = await tx.select({ id: scheduleAppointments.id })
        .from(scheduleAppointments)
        .where(and(
          eq(scheduleAppointments.slotId, oldSlotId),
          eq(scheduleAppointments.status, 'confirmed'),
        ));

      if (otherConfirmed.length === 0) {
        await tx.delete(scheduleSlots).where(eq(scheduleSlots.id, oldSlotId));
      } else {
        await tx.update(scheduleSlots)
          .set({ capacity: otherConfirmed.length, bookedCount: otherConfirmed.length })
          .where(eq(scheduleSlots.id, oldSlotId));
      }
    }
  });

  if (audit?.slotId) {
    console.info(`[Schedule][consume] reason=reschedule appointmentId=${id} slotId=${audit.slotId} date=${audit.slotDate ?? '-'} time=${audit.slotTime ?? '-'} order=${audit.registrationId}/${audit.subOrderIndex}`);
  }
}
'''
    db = replace_once(db, old_reopen, new_reopen, "reopenAppointment")

    # 3) Finalizar atendimento consome o slot em vez de decrementar bookedCount.
    # Mantemos slotDate/slotTime/confirmedAt no histórico do appointment.
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

  let audit: { slotId: number | null; slotDate: string | null; slotTime: string | null; registrationId: number; subOrderIndex: number } | null = null;

  await db.transaction(async (tx) => {
    const rows = await tx.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
    if (rows.length === 0) return;
    const appt = rows[0];
    const consumedSlotId = appt.status === 'confirmed' ? appt.slotId : null;

    audit = {
      slotId: consumedSlotId,
      slotDate: appt.slotDate,
      slotTime: appt.slotTime,
      registrationId: appt.registrationId,
      subOrderIndex: appt.subOrderIndex,
    };

    // Preserva data/hora/confirmedAt no histórico. Só rompe a ligação com o slot.
    await tx.update(scheduleAppointments)
      .set({ status: 'completed', slotId: null })
      .where(eq(scheduleAppointments.id, id));

    if (consumedSlotId) {
      // REGRA: atendimento finalizado consome a vaga; nunca decrementa bookedCount.
      // Se há outro cliente confirmado no mesmo slot (capacidade > 1), o horário
      // continua visível apenas para representar esse cliente e fica lotado.
      const otherConfirmed = await tx.select({ id: scheduleAppointments.id })
        .from(scheduleAppointments)
        .where(and(
          eq(scheduleAppointments.slotId, consumedSlotId),
          eq(scheduleAppointments.status, 'confirmed'),
        ));

      if (otherConfirmed.length === 0) {
        await tx.delete(scheduleSlots).where(eq(scheduleSlots.id, consumedSlotId));
      } else {
        await tx.update(scheduleSlots)
          .set({ capacity: otherConfirmed.length, bookedCount: otherConfirmed.length })
          .where(eq(scheduleSlots.id, consumedSlotId));
      }
    }
  });

  if (audit?.slotId) {
    console.info(`[Schedule][consume] reason=completed appointmentId=${id} slotId=${audit.slotId} date=${audit.slotDate ?? '-'} time=${audit.slotTime ?? '-'} order=${audit.registrationId}/${audit.subOrderIndex}`);
  }
}
'''
    db = replace_once(db, old_complete, new_complete, "completeAppointment")

    # 4) Bloqueio também no backend; não depende somente da lista mostrada na tela.
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

    # 5) O cliente reaberto recebe somente datas futuras (> hoje).
    router = ROUTER_PATH.read_text(encoding="utf-8")
    old_slots = "  const slots = updateRequired ? [] : await listAvailableScheduleSlots(appt.templateId ?? null);"
    new_slots = "  const slots = updateRequired ? [] : await listAvailableScheduleSlots(appt.templateId ?? null, appt.status === 'pending' && Boolean(appt.confirmedAt));"
    router = replace_once(router, old_slots, new_slots, "buildAuthenticatedScheduleData slots")
    ROUTER_PATH.write_text(router, encoding="utf-8")

    # Testes de regressão: incluem o caminho automático Foto em Análise.
    test = '''import { describe, expect, it } from "vitest";
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
'''
    TEST_PATH.write_text(test, encoding="utf-8")
    print("OK: auditoria aplicada - consumo definitivo, capacidade, histórico e reagendamento futuro")


if __name__ == "__main__":
    main()
