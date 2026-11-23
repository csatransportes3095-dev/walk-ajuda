import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hasRegisteredCpf } from "../shared/broadcastCpfFilter";

describe("Filtro de CPF no Envio em Massa", () => {
  it("exclui cadastros sem CPF ou incompletos", () => {
    expect(hasRegisteredCpf(null)).toBe(false);
    expect(hasRegisteredCpf("")).toBe(false);
    expect(hasRegisteredCpf("123.456.789")).toBe(false);
    expect(hasRegisteredCpf("123.456.789-00")).toBe(true);
    expect(hasRegisteredCpf("12345678900")).toBe(true);
  });

  it("aplica o filtro no servidor antes da fila e do envio imediato", () => {
    const server = readFileSync("server/routers.ts", "utf8");
    const start = server.indexOf("  broadcasts: router({");
    const end = server.indexOf("  // Segurança: reportar", start);
    const broadcast = server.slice(start, end);
    expect(broadcast).toContain("requireCpf: z.boolean().default(true)");
    expect(broadcast).toContain("recipients = recipients.filter(c => hasRegisteredCpf(c.cpf))");
    expect(broadcast).toContain("hasCpf: hasRegisteredCpf(c.cpf)");
  });

  it("filtra a geração dos links e a prévia de destinatários", () => {
    const page = readFileSync("client/src/pages/AdminBroadcast.tsx", "utf8");
    expect(page).toContain("Ignorar clientes sem CPF cadastrado");
    expect(page).toContain("const targets = rawTargets.filter(c => !requireCpf || c.hasCpf)");
    expect(page).toContain("previewTargetsUnfiltered.filter(c => !requireCpf || c.hasCpf)");
    expect(page).toContain("intervalSeconds, requireCpf");
  });
});
