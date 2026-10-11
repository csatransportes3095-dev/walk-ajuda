import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const pageSource = readFileSync(resolve(root, "client/src/pages/SchedulePage.tsx"), "utf8");
const routerSource = readFileSync(resolve(root, "server/routers/schedule.ts"), "utf8");

describe("agendamento público — desmarcar e remarcar", () => {
  it("expõe uma ação autenticada para liberar o próprio horário confirmado", () => {
    expect(routerSource).toContain("requestReschedule: publicProcedure");
    expect(routerSource).toContain("requireScheduleAccess(input.token, input.accessToken)");
    expect(routerSource).toContain("await reopenAppointment(appt.id)");
  });

  it("libera o horário confirmado antes de mostrar a escolha do novo horário", () => {
    expect(pageSource).toContain("trpc.schedule.requestReschedule.useMutation");
    expect(pageSource).toContain("requestRescheduleMut.mutate({ token, accessToken })");
    expect(pageSource).toContain("Desmarcar e escolher novo horário");
    expect(pageSource).toContain("Horário liberado. Escolha uma nova data e horário.");
  });

  it("fecha definitivamente o modo de troca depois que o novo horário é confirmado", () => {
    expect(pageSource).toContain("onSuccess: async () => {");
    expect(pageSource).toContain("setShowChangeDate(false)");
    expect(pageSource).toContain("setSelectedDate(null)");
    expect(pageSource).toContain("setSelectedSlot(null)");
    expect(pageSource).not.toContain("setShowChangeDate(true);\n      utils.schedule.getByToken.invalidate");
  });
});
