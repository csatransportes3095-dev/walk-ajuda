from pathlib import Path
import re

DB_PATH = Path("server/db.ts")
ADMIN_PATH = Path("client/src/pages/AdminSchedule.tsx")
TEST_PATH = Path("server/scheduleSlotReturnRules.test.ts")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 bloco, encontrado {count}")
    return text.replace(old, new, 1)


def main() -> None:
    db = DB_PATH.read_text(encoding="utf-8")
    old_cleanup = '''// Remove todos os slots já passados (data anterior a hoje)
export async function cleanupOldScheduleSlots(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const today = new Date().toISOString().slice(0, 10);
  await db.delete(scheduleSlots).where(sql`${scheduleSlots.slotDate} < ${today}`);
}
'''
    new_cleanup = '''// Remove somente slots de datas anteriores ao dia civil de São Paulo.
// IMPORTANTE: não usar UTC aqui. Depois das 21h no Brasil, o UTC já está no dia seguinte
// e isso apagava os horários restantes do mesmo dia, impedindo reagendamento.
export async function cleanupOldScheduleSlots(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const localDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  await db.delete(scheduleSlots).where(sql`${scheduleSlots.slotDate} < ${today}`);
}
'''
    db = replace_once(db, old_cleanup, new_cleanup, "cleanupOldScheduleSlots")
    DB_PATH.write_text(db, encoding="utf-8")

    admin = ADMIN_PATH.read_text(encoding="utf-8")
    pattern = re.compile(
        r"utils\.schedule\.listAppointments\.invalidate\(\);(?!\s*utils\.schedule\.listSlots\.invalidate\(\);)"
    )
    admin, count = pattern.subn(
        "utils.schedule.listAppointments.invalidate(); utils.schedule.listSlots.invalidate();",
        admin,
    )
    if count < 5:
        raise SystemExit(f"AdminSchedule: esperava atualizar pelo menos 5 invalidacoes, encontrei {count}")
    ADMIN_PATH.write_text(admin, encoding="utf-8")

    test = '''import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function dbSource() {
  return readFile(new URL("./db.ts", import.meta.url), "utf8");
}

async function adminSource() {
  return readFile(new URL("../client/src/pages/AdminSchedule.tsx", import.meta.url), "utf8");
}

describe("regras de retorno de horarios do agendamento", () => {
  it("limpa dias antigos pela data de Sao Paulo e nao pela virada UTC", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function cleanupOldScheduleSlots");
    const end = source.indexOf("// --- Agendamentos por pedido ---", start);
    const cleanup = source.slice(start, end);

    expect(cleanup).toContain("now.getTime() - 3 * 60 * 60 * 1000");
    expect(cleanup).toContain("getUTCFullYear");
    expect(cleanup).not.toContain("new Date().toISOString().slice(0, 10)");
  });

  it("mantem horarios futuros do mesmo dia disponiveis para escolha", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function listAvailableScheduleSlots");
    const end = source.indexOf("// Cria múltiplos slots", start);
    const availability = source.slice(start, end);

    expect(availability).toContain("gte(scheduleSlots.slotDate, today)");
    expect(availability).toContain("if (r.slotDate === today)");
    expect(availability).toContain("if (slotTotalMin <= currentTotalMin) return false");
  });

  it("libera a vaga ao finalizar e ao reagendar sem apagar o slot", async () => {
    const source = await dbSource();

    const reopenStart = source.indexOf("export async function reopenAppointment");
    const reopenEnd = source.indexOf("export async function completeAppointment", reopenStart);
    const reopen = source.slice(reopenStart, reopenEnd);
    expect(reopen).toContain("bookedCount: sql`GREATEST(${scheduleSlots.bookedCount} - 1, 0)`");
    expect(reopen).not.toContain("db.delete(scheduleSlots)");

    const completeStart = source.indexOf("export async function completeAppointment");
    const completeEnd = source.indexOf("/**", completeStart);
    const complete = source.slice(completeStart, completeEnd);
    expect(complete).toContain("bookedCount: sql`GREATEST(${scheduleSlots.bookedCount} - 1, 0)`");
    expect(complete).not.toContain("db.delete(scheduleSlots)");
  });

  it("atualiza imediatamente a aba Horarios apos mudancas de ocupacao", async () => {
    const source = await adminSource();
    const refreshes = source.match(/listSlots\.invalidate\(\)/g) || [];
    expect(refreshes.length).toBeGreaterThanOrEqual(5);
  });
});
'''
    TEST_PATH.write_text(test, encoding="utf-8")

    print(f"OK: db.ts corrigido, AdminSchedule atualizado em {count} pontos e teste criado")


if __name__ == "__main__":
    main()
