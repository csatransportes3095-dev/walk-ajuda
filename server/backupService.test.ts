import { describe, expect, it } from "vitest";
import { parseDatabaseUrl, safeBackupObjectPath } from "./backupService";
import { getBackupDownloadName } from "./routers/backup";

describe("backupService", () => {
  it("interpreta uma conexão MySQL/TiDB sem expor o valor completo", () => {
    const result = parseDatabaseUrl("mysql://backup-user:p%40ss@example.test:4000/walk_ajuda?ssl=true");
    expect(result).toMatchObject({
      host: "example.test",
      port: "4000",
      user: "backup-user",
      database: "walk_ajuda",
      useTls: true,
    });
    expect(result.password).toBe("p@ss");
  });

  it("rejeita protocolos e conexões incompletas", () => {
    expect(() => parseDatabaseUrl("postgres://user:pass@example.test/db")).toThrow(/MySQL\/TiDB/);
    expect(() => parseDatabaseUrl("mysql://user:pass@example.test/")).toThrow(/host, utilizador ou banco/);
  });

  it("impede path traversal ao copiar objetos do R2", () => {
    expect(safeBackupObjectPath("clientes/foto.jpg")).toBe("files/clientes/foto.jpg");
    expect(() => safeBackupObjectPath("../fora-do-backup.txt")).toThrow(/inválida/);
    expect(() => safeBackupObjectPath("clientes\\foto.jpg")).toThrow(/inválida/);
    expect(() => safeBackupObjectPath("clientes/./foto.jpg")).toThrow(/inválida/);
  });

  it("usa um nome de download determinado pelo ID hexadecimal validado pelo router", () => {
    expect(getBackupDownloadName("a".repeat(48))).toBe(`walk-ajuda-backup-${"a".repeat(48)}.wajuda.enc`);
  });
});
