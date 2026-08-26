import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { concatenateDumplingSqlFiles, DEFAULT_DUMPLING_CA_PATH, orderDumplingSqlFiles, parseDatabaseUrl, resolveDumplingTlsPaths, safeBackupObjectPath } from "./backupService";
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
