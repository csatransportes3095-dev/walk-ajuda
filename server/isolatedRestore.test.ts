import { afterEach, describe, expect, it } from "vitest";
import { assertIsolatedConfirmation, normalizeArchiveEntry, parseRestoreArgs, validateArchiveEntries } from "./isolatedRestore";

describe("isolatedRestore", () => {
  const original = {
    mode: process.env.RESTORE_MODE,
    confirm: process.env.RESTORE_CONFIRM,
    label: process.env.RESTORE_TARGET_LABEL,
  };

  afterEach(() => {
    if (original.mode === undefined) delete process.env.RESTORE_MODE;
    else process.env.RESTORE_MODE = original.mode;
    if (original.confirm === undefined) delete process.env.RESTORE_CONFIRM;
    else process.env.RESTORE_CONFIRM = original.confirm;
    if (original.label === undefined) delete process.env.RESTORE_TARGET_LABEL;
    else process.env.RESTORE_TARGET_LABEL = original.label;
  });

  it("aceita somente argumentos com saída explícita", () => {
    expect(parseRestoreArgs(["backup.wajuda.enc", "--output", "/tmp/restore", "--dry-run"])).toEqual({
      encryptedFile: "backup.wajuda.enc",
      outputDir: "/tmp/restore",
      dryRun: true,
    });
    expect(parseRestoreArgs(["--", "backup.wajuda.enc", "--output", "/tmp/restore", "--dry-run"])).toEqual({
      encryptedFile: "backup.wajuda.enc",
      outputDir: "/tmp/restore",
      dryRun: true,
    });
    expect(() => parseRestoreArgs(["backup.wajuda.enc"])).toThrow(/--output/);
    expect(() => parseRestoreArgs(["backup.wajuda.enc", "--no-verify", "x"])).toThrow(/Argumento desconhecido/);
  });

  it("aceita o formato de caminhos tar produzido pelo backup e rejeita traversal", () => {
    expect(normalizeArchiveEntry("./files/clientes/foto.jpg")).toBe("files/clientes/foto.jpg");
    expect(() => validateArchiveEntries(["./database.sql", "./source.tar.gz", "./manifest.json", "./files/cliente/foto.jpg"])).not.toThrow();
    expect(() => validateArchiveEntries(["../../etc/passwd"])).toThrow(/Entrada insegura/);
    expect(() => validateArchiveEntries(["./files/../database.sql"])).toThrow(/Entrada insegura/);
    expect(() => validateArchiveEntries(["./secrets.txt"])).toThrow(/Entrada inesperada/);
  });

  it("exige modo, confirmação e rótulo isolado antes de restaurar", () => {
    delete process.env.RESTORE_MODE;
    delete process.env.RESTORE_CONFIRM;
    delete process.env.RESTORE_TARGET_LABEL;
    expect(() => assertIsolatedConfirmation()).toThrow(/RESTORE_MODE=isolated/);

    process.env.RESTORE_MODE = "isolated";
    expect(() => assertIsolatedConfirmation()).toThrow(/RESTORE_CONFIRM/);

    process.env.RESTORE_CONFIRM = "I_UNDERSTAND_THIS_ISOLATED_TARGET";
    expect(() => assertIsolatedConfirmation()).toThrow(/RESTORE_TARGET_LABEL/);

    process.env.RESTORE_TARGET_LABEL = "production-live";
    expect(() => assertIsolatedConfirmation()).toThrow(/não produtivo/);

    process.env.RESTORE_TARGET_LABEL = "staging-restore-2026-08-25";
    expect(() => assertIsolatedConfirmation()).not.toThrow();
  });
});
