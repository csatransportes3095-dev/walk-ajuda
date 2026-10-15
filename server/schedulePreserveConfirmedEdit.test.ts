import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("preservar reservas confirmadas ao editar pedido", () => {
  it("não regenera reserva confirmada através de updateOrderData", async () => {
    const source = await readFile(new URL("./routers.ts", import.meta.url), "utf8");
    const start = source.indexOf("updateOrderData: adminProcedure");
    const end = source.indexOf("reassignCustomer: adminProcedure", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const edit = source.slice(start, end);
    expect(edit).toContain("getAppointmentByOrder(input.registrationId, input.subOrderIndex)");
    expect(edit).toContain("if (currentSchedule?.status === 'confirmed')");
    expect(edit.indexOf("if (currentSchedule?.status === 'confirmed')")).toBeLessThan(edit.indexOf("regenerateAutomaticScheduleForOrder({"));
    expect(edit).toContain("schedulePreserved: true");
  });
});
