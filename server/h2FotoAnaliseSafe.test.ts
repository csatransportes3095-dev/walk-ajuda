import { describe, expect, it } from "vitest";
import fs from "node:fs";

const dbSource = fs.readFileSync("server/db.ts", "utf8");
const lifecycleSource = fs.readFileSync("shared/scheduleOrderLifecycle.ts", "utf8");

describe("H2 Foto em Analise - agenda", () => {
  it("reconhece todas as chaves de Foto em Analise", () => {
    expect(lifecycleSource).toContain("normalizeOrderStatusSemantic(key) === 'foto em analise'");
    expect(lifecycleSource).not.toContain("'em_analise'");
  });

  it("repassa o telefone para compatibilidade de re-cadastro", () => {
    expect(dbSource).toContain("latestEntry.customerPhone");
    expect(dbSource).toContain("completeOpenAppointmentsForOrder(");
  });

  it("prioriza pedido/subpedido exato e nao usa telefone se existir historico direto", () => {
    expect(dbSource).toContain("eq(scheduleAppointments.registrationId, registrationId)");
    expect(dbSource).toContain("eq(scheduleAppointments.subOrderIndex, subOrderIndex)");
    expect(dbSource).toContain("if (directHistory.length > 0) return 0;");
  });

  it("fallback por telefone so considera pending/confirmed e preserva historico via completeAppointment", () => {
    expect(dbSource).toContain("where(inArray(scheduleAppointments.status, ['pending', 'confirmed']))");
    expect(dbSource).toContain("await completeAppointment(fallback.id)");
  });
});
