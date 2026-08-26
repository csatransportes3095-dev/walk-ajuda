import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_STALE_AFTER_MS, concatenateDumplingSqlFiles, createEncryptedArchiveStream, DEFAULT_DUMPLING_CA_PATH, isBackupStale, logProcessDiagnostic, orderDumplingSqlFiles, parseDatabaseUrl, resolveDumplingTlsPaths, safeBackupObjectPath } from "./backupService";
import { getBackupDownloadName } from "./routers/backup";

const TEST_BACKUP_KEY = Buffer.alloc(32, 7).toString("hex");
const originalBackupKey = process.env.BACKUP_ENCRYPTION_KEY;

describe("backupService", () => {
  beforeEach(() => {
    process.env.BACKUP_ENCRYPTION_KEY = TEST_BACKUP_KEY;
  });

  afterEach(() => {
    if (originalBackupKey === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
    else process.env.BACKUP_ENCRYPTION_KEY = originalBackupKey;
  });
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

  it("aceita TLS de mão única com CA e sem certificado de cliente", () => {
    expect(resolveDumplingTlsPaths("/run/secrets/ca.pem", undefined, undefined)).toEqual({
      caPath: "/run/secrets/ca.pem",
      certPath: "",
      keyPath: "",
      useEphemeralClientCertificate: true,
    });
  });

  it("usa a CA do trust store do sistema quando não há CA customizada", () => {
    expect(resolveDumplingTlsPaths(undefined, undefined, undefined)).toEqual({
      caPath: DEFAULT_DUMPLING_CA_PATH,
      certPath: "",
      keyPath: "",
      useEphemeralClientCertificate: true,
    });
  });

  it("aceita certificado e chave de cliente somente como par", () => {
    expect(resolveDumplingTlsPaths("/run/secrets/ca.pem", "/run/secrets/client.pem", "/run/secrets/client.key")).toMatchObject({
      caPath: "/run/secrets/ca.pem",
      certPath: "/run/secrets/client.pem",
      keyPath: "/run/secrets/client.key",
      useEphemeralClientCertificate: false,
    });
    expect(() => resolveDumplingTlsPaths("/run/secrets/ca.pem", "/run/secrets/client.pem", undefined)).toThrow(/par/);
  });

  it("ordena os arquivos SQL do Dumpling por dependência e ignora metadados não SQL", () => {
    expect(orderDumplingSqlFiles([
      "walk-ajuda.clientes.000000001.sql",
      "walk-ajuda-schema-post.sql",
      "metadata",
      "walk-ajuda-schema-create.sql",
      "walk-ajuda.pedidos-schema.sql",
      "walk-ajuda.pedidos.000000000.sql",
      "walk-ajuda-schema-trigger.sql",
    ])).toEqual([
      "walk-ajuda-schema-create.sql",
      "walk-ajuda.pedidos-schema.sql",
      "walk-ajuda.clientes.000000001.sql",
      "walk-ajuda.pedidos.000000000.sql",
      "walk-ajuda-schema-post.sql",
      "walk-ajuda-schema-trigger.sql",
    ]);
  });

  it("monta um database.sql compatível a partir da saída do Dumpling", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "wajuda-dumpling-test-"));
    try {
      await writeFile(path.join(directory, "walk-ajuda.pedidos.000000000.sql"), "INSERT INTO pedidos VALUES (1);\n");
      await writeFile(path.join(directory, "walk-ajuda-schema-post.sql"), "CREATE INDEX idx_pedidos ON pedidos (id);\n");
      await writeFile(path.join(directory, "walk-ajuda-schema-create.sql"), "CREATE DATABASE IF NOT EXISTS `walk_ajuda`;\n");
      await writeFile(path.join(directory, "walk-ajuda.pedidos-schema.sql"), "CREATE TABLE `pedidos` (`id` INT);\n");
      await concatenateDumplingSqlFiles(path.join(directory), path.join(directory, "database.sql"), "walk_ajuda");
      const sql = await readFile(path.join(directory, "database.sql"), "utf8");
      expect(sql.indexOf("CREATE DATABASE IF NOT EXISTS")).toBeLessThan(sql.indexOf("USE `walk_ajuda`;"));
      expect(sql.indexOf("USE `walk_ajuda`;")).toBeLessThan(sql.indexOf("CREATE TABLE `pedidos`"));
      expect(sql.indexOf("CREATE TABLE `pedidos`")).toBeLessThan(sql.indexOf("INSERT INTO pedidos"));
      expect(sql.indexOf("INSERT INTO pedidos")).toBeLessThan(sql.indexOf("CREATE INDEX idx_pedidos"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("cifra uma fixture por streaming e retorna bytes/hash sem arquivo de pacote local", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "wajuda-archive-test-"));
    const previousKey = process.env.BACKUP_ENCRYPTION_KEY;
    process.env.BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("hex");
    try {
      await mkdir(path.join(directory, "files"), { recursive: true });
      await writeFile(path.join(directory, "database.sql"), "CREATE TABLE teste (id INT);\n");
      await writeFile(path.join(directory, "manifest.json"), '{"formatVersion":1}\n');
      const archive = createEncryptedArchiveStream(directory);
      const chunks: Buffer[] = [];
      for await (const chunk of archive.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const result = await archive.completion;
      const body = Buffer.concat(chunks);
      expect(result.bytes).toBe(body.length);
      expect(result.sha256).toBe(createHash("sha256").update(body).digest("hex"));
      expect(result.bytes).toBeGreaterThan(32);
    } finally {
      if (previousKey === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
      else process.env.BACKUP_ENCRYPTION_KEY = previousKey;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejeita timeout de inatividade da cifra e limpa o subprocesso", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "wajuda-archive-timeout-test-"));
    const binDirectory = await mkdtemp(path.join(os.tmpdir(), "wajuda-tar-timeout-bin-"));
    const previousPath = process.env.PATH;
    try {
      const fakeTar = path.join(binDirectory, "tar");
      await writeFile(fakeTar, "#!/bin/sh\nsleep 1\n", "utf8");
      await chmod(fakeTar, 0o755);
      process.env.PATH = `${binDirectory}:${previousPath || ""}`;
      const archive = createEncryptedArchiveStream(directory, undefined, undefined, { backupId: "backup-test", stage: "archive", startedAt: Date.now() }, 25);
      archive.stream.on("error", () => undefined);
      await expect(archive.completion).rejects.toThrow(/sem progresso/);
    } finally {
      process.env.PATH = previousPath;
      await rm(directory, { recursive: true, force: true });
      await rm(binDirectory, { recursive: true, force: true });
    }
  });

  it("rejeita subprocesso tar com código diferente de zero", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "wajuda-archive-exit-test-"));
    const binDirectory = await mkdtemp(path.join(os.tmpdir(), "wajuda-tar-exit-bin-"));
    const previousPath = process.env.PATH;
    try {
      const fakeTar = path.join(binDirectory, "tar");
      await writeFile(fakeTar, "#!/bin/sh\necho 'synthetic tar failure' >&2\nexit 7\n", "utf8");
      await chmod(fakeTar, 0o755);
      process.env.PATH = `${binDirectory}:${previousPath || ""}`;
      const archive = createEncryptedArchiveStream(directory, undefined, undefined, { backupId: "backup-test", stage: "archive", startedAt: Date.now() }, 500);
      archive.stream.on("error", () => undefined);
      await expect(archive.completion).rejects.toThrow(/código 7/);
    } finally {
      process.env.PATH = previousPath;
      await rm(directory, { recursive: true, force: true });
      await rm(binDirectory, { recursive: true, force: true });
    }
  });

  it("propaga cancelamento do stream sem concluir", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "wajuda-archive-cancel-test-"));
    const binDirectory = await mkdtemp(path.join(os.tmpdir(), "wajuda-tar-cancel-bin-"));
    const previousPath = process.env.PATH;
    try {
      const fakeTar = path.join(binDirectory, "tar");
      await writeFile(fakeTar, "#!/bin/sh\nsleep 1\n", "utf8");
      await chmod(fakeTar, 0o755);
      process.env.PATH = `${binDirectory}:${previousPath || ""}`;
      const archive = createEncryptedArchiveStream(directory, undefined, undefined, { backupId: "backup-test", stage: "archive", startedAt: Date.now() }, 500);
      archive.stream.on("error", () => undefined);
      archive.cancel(new Error("synthetic cancellation"));
      await expect(archive.completion).rejects.toThrow("synthetic cancellation");
    } finally {
      process.env.PATH = previousPath;
      await rm(directory, { recursive: true, force: true });
      await rm(binDirectory, { recursive: true, force: true });
    }
  });

  it("sanitiza logs de processo sem expor URL ou token", () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      logProcessDiagnostic("synthetic", { error: "request https://user:secret@example.invalid/path token=hidden" });
      const output = logSpy.mock.calls.flat().join(" ");
      expect(output).not.toContain("user:secret");
      expect(output).not.toContain("token=hidden");
      expect(output).toContain("event=synthetic");
    } finally {
      logSpy.mockRestore();
    }
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

  it("considera stale somente uma execução sem atualização há pelo menos 10 minutos", () => {
    const now = Date.parse("2026-08-26T07:00:00.000Z");
    expect(isBackupStale(new Date(now - BACKUP_STALE_AFTER_MS + 1), now)).toBe(false);
    expect(isBackupStale(new Date(now - BACKUP_STALE_AFTER_MS), now)).toBe(true);
    expect(isBackupStale(null, now)).toBe(false);
    expect(isBackupStale("data inválida", now)).toBe(false);
  });
});
