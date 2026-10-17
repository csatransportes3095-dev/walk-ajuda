import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const router = readFileSync("server/routers/h2bico.ts", "utf8");
const page = readFileSync("client/src/pages/AdminH2Bico.tsx", "utf8");

describe("H2BICO - marcacao EAR persistente", () => {
  it("armazena uma selecao por registro sem mudar status, CPF ou fotos", () => {
    expect(router).toContain("CREATE TABLE IF NOT EXISTS h2bico_ear_marks");
    expect(router).toContain("recordId INT NOT NULL PRIMARY KEY");
    expect(router).toContain("LEFT JOIN h2bico_ear_marks em ON em.recordId = r.id");
    expect(router).toContain('setEarMarker: adminProcedure.input');
    expect(router).toContain('z.enum(["com_ear", "sem_ear"]).nullable()');
    expect(router).toContain("ON DUPLICATE KEY UPDATE earStatus");
    expect(router).toContain("DELETE FROM h2bico_ear_marks");
    expect(router).toContain("INSERT INTO h2bico_history");
  });
  it("mostra marcadores acessiveis, mutualmente exclusivos e salva por toque", () => {
    expect(page).toContain("trpc.h2bico.setEarMarker.useMutation");
    expect(page).toContain('["com_ear","sem_ear"] as const');
    expect(page).toContain('aria-pressed={active}');
    expect(page).toContain('previous===selected?null:selected');
    expect(page).toContain('savingEar.has(r.id)');
    expect(page).toContain("🟢 COM EAR");
    expect(page).toContain("🔴 SEM EAR");
  });
});
