import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(process.cwd(), "client/src/pages/AdminOrders.tsx");
const source = fs.readFileSync(sourcePath, "utf8");

describe("filtro operacional Em Análise", () => {
  it("classifica somente o status real de Foto em Análise", () => {
    expect(source).toContain("if (status === 'foto_em_anal') return 'em_analise';");
  });

  it("não confunde o status de agendamento confirmado com Foto em Análise", () => {
    expect(source).not.toContain("if (status === 'foto_em_analise') return 'em_analise';");
  });

  it("preserva a prioridade dos agendamentos confirmados e pendentes", () => {
    const confirmedIndex = source.indexOf("if (order?.scheduleStatus === 'confirmed') return 'agendamento_confirmado';");
    const pendingIndex = source.indexOf("if (order?.scheduleStatus === 'pending') return 'agendamento';");
    const analysisIndex = source.indexOf("if (status === 'foto_em_anal') return 'em_analise';");

    expect(confirmedIndex).toBeGreaterThanOrEqual(0);
    expect(pendingIndex).toBeGreaterThanOrEqual(0);
    expect(analysisIndex).toBeGreaterThan(pendingIndex);
  });
});
