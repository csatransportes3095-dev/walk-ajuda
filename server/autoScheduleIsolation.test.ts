import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, "..", path), "utf8");

describe("agendamento automatico isolado", () => {
  it("mantem a opcao desativada por padrao no banco", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toContain('autoScheduleEnabled: int("autoScheduleEnabled").notNull().default(0)');
  });

  it("usa campo separado do optionId que alimenta comissao e audio", () => {
    const router = read("server/routers.ts");
    expect(router).toContain("autoScheduleOptionId: z.number().int().positive().optional()");
    expect(router).toContain("if (input.autoScheduleOptionId && effectivePhone)");
    expect(router).toContain("optionId: input.autoScheduleOptionId");
    expect(router).toContain("if (previousOrderCount === 0 && input.optionId)");
  });

  it("nao deixa falha de agenda derrubar pedido persistido", () => {
    const router = read("server/routers.ts");
    expect(router).toContain("[AutoSchedule] Pedido salvo, mas a liberação automática do agendamento falhou");
    expect(router).toContain("scheduleUrl: automaticScheduleUrl ?? null");
  });

  it("reutiliza agenda ativa no checkout e preserva regeneracao separada", () => {
    const service = read("server/autoSchedule.ts");
    const start = service.indexOf("export async function ensureAutomaticScheduleForOrder(");
    const end = service.indexOf("export async function regenerateScheduleForOrder(", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const checkout = service.slice(start, end);
    // Check the actual guard, not a legacy comment that prohibited the now-approved
    // automatic reopening on return to Em Analise (covered by analysisSchedulePriority).
    expect(checkout).toContain("const existing = await getAppointmentByOrder(registrationId, subOrderIndex)");
    expect(checkout).toContain('if (existing && (existing.status === "pending" || existing.status === "confirmed"))');
    const reuse = checkout.slice(checkout.indexOf('if (existing && (existing.status === "pending"'), checkout.indexOf('if (existing && (existing.status === "completed"'));
    expect(reuse).toContain("created: false");
    expect(reuse).toContain("appointmentId: existing.id");
    expect(reuse).toContain("token: existing.token");
    expect(reuse).not.toContain("createAppointment(");
    expect(service).toContain("export async function ensureActiveAutomaticScheduleForAnalysis(");
    expect(service).toContain("forceNewOnReturn?: boolean");
    expect(service).toContain("await completeOpenAppointmentsForOrder(registrationId, subOrderIndex, customerPhone, false)");
  });

  it("sincroniza pedido antigo somente em acesso autenticado", () => {
    const scheduleRouter = read("server/routers/schedule.ts");
    expect(scheduleRouter).toContain("const session = await requireCustomerSession(input.cpToken, input.phone)");
    expect(scheduleRouter).toContain("await syncAutomaticSchedulesForCustomer(session.phone)");
  });

  it("nao altera o link publico individual de agendamento", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain('<Route path={"/agendar/:token"} component={SchedulePage} />');
  });
});
