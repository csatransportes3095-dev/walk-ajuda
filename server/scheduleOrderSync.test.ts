import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const dbSource = () => readFile(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = () => readFile(new URL("./routers.ts", import.meta.url), "utf8");

describe("sincronização de agenda após foto em análise", () => {
  it("limita o encerramento ao mesmo pedido, subpedido e agendamento confirmado", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function completeConfirmedAppointmentsForOrder");
    const helper = source.slice(start, source.indexOf("// CONFIRMAÇÃO ATÔMICA", start));

    expect(helper).toContain("eq(scheduleAppointments.registrationId, registrationId)");
    expect(helper).toContain("eq(scheduleAppointments.subOrderIndex, subOrderIndex)");
    expect(helper).toContain("eq(scheduleAppointments.status, 'confirmed')");
    expect(helper).toContain("await completeAppointment(appointment.id)");
  });

  it("preserva o histórico de agenda ao concluir o registro sem apagá-lo", async () => {
    const source = await dbSource();
    const start = source.indexOf("export async function completeAppointment");
    const completion = source.slice(start, source.indexOf("/**", start));

    expect(completion).toContain("status: 'completed'");
    expect(completion).toContain("slotDate: null");
    expect(completion).toContain("slotTime: null");
    expect(completion).not.toContain("db.delete(scheduleAppointments)");
  });

  it("executa a sincronização somente ao avançar para foto_em_analise", async () => {
    const source = await routerSource();
    expect(source).toContain("const SCHEDULE_COMPLETION_STATUSES = ['foto_em_analise']");
    expect(source).toContain("await completeConfirmedAppointmentsForOrder(input.registrationId, input.subOrderIndex)");
  });
});
