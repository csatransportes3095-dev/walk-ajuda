import { describe, expect, it } from "vitest";
import { inferRestoreContentType, isProtectedRestoreR2Key, restoreConfirmationPhrase } from "./backupRestoreService";

describe("backupRestoreService protections", () => {
  it("exige frase ligada aos ultimos 8 caracteres do backup", () => {
    expect(restoreConfirmationPhrase("abcdef0123456789")).toBe("RESTAURAR 23456789");
  });

  it("nunca trata backups e auditorias de restore como midia restauravel", () => {
    expect(isProtectedRestoreR2Key("system-backups/abc.wajuda.enc")).toBe(true);
    expect(isProtectedRestoreR2Key("system-restores/abc.json")).toBe(true);
    expect(isProtectedRestoreR2Key("clientes/foto.jpg")).toBe(false);
  });

  it("restaura tipos comuns de midia com Content-Type coerente", () => {
    expect(inferRestoreContentType("clientes/foto.JPG")).toBe("image/jpeg");
    expect(inferRestoreContentType("docs/arquivo.pdf")).toBe("application/pdf");
    expect(inferRestoreContentType("sem-extensao")).toBe("application/octet-stream");
  });
});
