import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const dbSource = () => readFile(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = () => readFile(new URL("./routers.ts", import.meta.url), "utf8");

describe("independência entre status do pedido e agendamento", () => {
  it("mantém o helper manual limitado ao mesmo pedido, subpedido e agendamento confirmado", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function completeConfirmedAppointmentsForOrder");
    const helper = source.slice(start, source.indexOf("// CONFIRMAÇÃO ATÔMICA", start));

    expect(helper).toContain("eq(scheduleAppointments.registrationId, registrationId)");
    expect(helper).toContain("eq(scheduleAppointments.subOrderIndex, subOrderIndex)");
    expect(helper).toContain("eq(scheduleAppointments.status, 'confirmed')");
    expect(helper).toContain("await completeAppointment(appointment.id)");
  });

  it("mantém a conclusão manual preservando a linha histórica sem exclusão", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function completeAppointment");
    const completion = source.slice(start, source.indexOf("/**", start));

    expect(completion).toContain("status: 'completed'");
    expect(completion).toContain("slotDate: null");
    expect(completion).toContain("slotTime: null");
    expect(completion).not.toContain("db.delete(scheduleAppointments)");
  });

  it("não encerra agendamento confirmado ao alterar o pedido para foto em análise", async () => {
    const source = await routerSource();
    const updateStart = source.indexOf("updateStatus: adminProcedure");
    const updateEnd = source.indexOf("// Admin: atualizar orderSource", updateStart);
    const updateProcedure = source.slice(updateStart, updateEnd);

    expect(updateProcedure).not.toContain("SCHEDULE_COMPLETION_STATUSES");
    expect(updateProcedure).not.toContain("completeConfirmedAppointmentsForOrder");
    expect(updateProcedure).toContain("Alterar o status do pedido não encerra nem modifica a agenda do cliente.");
  });

  it("mantém a regra de filtro: somente agenda aberta tem prioridade operacional", async () => {
    const source = await routerSource();
    const start = source.indexOf("// Buscar o último estado de agenda de cada pedido");
    const block = source.slice(start, source.indexOf("// Fallback por telefone", start));

    expect(block).toContain("ORDER BY id DESC");
    expect(block).not.toContain("status != 'cancelled'");
    expect(block).toContain("const resolvedScheduleKeys = new Set<string>()");
    expect(block).toContain("if (sr.status === 'cancelled' || sr.status === 'completed') continue");
  });

  it("não usa fallback por telefone quando o pedido já possui agenda encerrada", async () => {
    const source = await routerSource();
    expect(source).toContain("!resolvedScheduleKeys.has(`${o.id}_${o.subOrderIndex}`)");
    expect(source).toContain("fallbackStatus !== 'cancelled' && fallbackStatus !== 'completed'");
  });
});
