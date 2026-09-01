import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(process.cwd(), "client/src/pages/OrderTracking.tsx");
const source = fs.readFileSync(sourcePath, "utf8");

describe("acompanhamento vertical ao vivo", () => {
  it("atualiza o status automaticamente sem refresh manual", () => {
    expect(source).toContain("refetchInterval: 5_000");
    expect(source).toContain("refetchIntervalInBackground: true");
    expect(source).toContain("refetchOnWindowFocus: true");
    expect(source).toContain("Acompanhamento ao vivo");
  });

  it("mostra a jornada inteira em coluna com atual e próximo passo", () => {
    expect(source).toContain("Jornada do seu pedido");
    expect(source).toContain("Próximo passo");
    expect(source).toContain("Todas as etapas");
    expect(source).toContain("ETAPA {stageNumber} DE {totalSteps}");
    expect(source).toContain("CONCLUÍDO");
    expect(source).toContain("AGORA");
    expect(source).toContain("PRÓXIMO");
    expect(source).toContain("DEPOIS");
  });

  it("continua usando a sequência configurada pelo ADM", () => {
    expect(source).toContain("globalProgressSequenceQuery.data?.enabled");
    expect(source).toContain("globalProgressSequenceQuery.data.keys");
    expect(source).toContain("findProgressStatusIndex");
    expect(source).toContain("resolveProgressPosition");
  });

  it("remove o layout antigo em linhas", () => {
    expect(source).not.toContain("chunkProgressKeys");
    expect(source).not.toContain("Continuação do progresso");
  });
});
