import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(process.cwd(), "client/src/pages/AdminOrders.tsx");
const bucketPath = path.resolve(process.cwd(), "shared/orderBuckets.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const bucketSource = fs.readFileSync(bucketPath, "utf8");

describe("filtro operacional Em Análise", () => {
  it("classifica a chave canônica e preserva o alias legado de Foto em Análise", () => {
    expect(bucketSource).toContain('["em_analise", "foto_em_analise", "foto_em_anal"]');
    expect(bucketSource).toContain('return "em_analise";');
  });

  it("não mantém a lógica hardcoded antiga no componente", () => {
    expect(source).not.toContain("if (status === 'foto_em_anal') return 'em_analise';");
    expect(source).toContain('import { getOperationalBucket } from "@shared/orderBuckets";');
  });

  it("preserva a prioridade dos agendamentos confirmados e pendentes", () => {
    const confirmedIndex = bucketSource.indexOf('if (order.scheduleStatus === "confirmed") return "agendamento_confirmado";');
    const pendingIndex = bucketSource.indexOf('if (order.scheduleStatus === "pending") return "agendamento";');
    const analysisIndex = bucketSource.indexOf('return "em_analise";');

    expect(confirmedIndex).toBeGreaterThanOrEqual(0);
    expect(pendingIndex).toBeGreaterThanOrEqual(0);
    expect(analysisIndex).toBeGreaterThan(pendingIndex);
  });
});
