import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BACKUP_STALE_AFTER_MS, isBackupStale } from "./backupService";

const source = readFileSync(new URL("./backupService.ts", import.meta.url), "utf8");
const startup = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

describe("Render rolling deploy must not interrupt active backups on another instance", () => {
  it("retains a shared ten-minute stale threshold while protecting active work", () => {
    const now = Date.parse("2026-11-17T03:00:00.000Z");
    expect(isBackupStale(new Date(now - 30_000), now)).toBe(false);
    expect(isBackupStale(new Date(now - BACKUP_STALE_AFTER_MS + 1), now)).toBe(false);
    expect(isBackupStale(new Date(now - BACKUP_STALE_AFTER_MS), now)).toBe(true);
    expect(source).toContain("async function failOnlyStaleBackupRuns");
    expect(source).toContain("lte(systemBackups.updatedAt, cutoff)");
    expect(source).toContain('inArray(systemBackups.status, ["queued", "running"])');
    expect(source).toContain("if (!isBackupStale(row.updatedAt, now)) continue");
  });
  it("uses the same guarded recovery on server start and admin stale reconcile", () => {
    expect(source).toContain('return failOnlyStaleBackupRuns(db, now.getTime(), "Execução encerrada por falta de atualização.");');
    expect(source).toContain('db, now, "Execução sem atividade após reinício ou substituição de instância."');
    expect(startup).toContain("void reconcileBackupsAfterRestart()");
  });
  it("does not mark an active deep verification failed during rolling deploy", () => {
    expect(source).toContain("const verificationHeartbeat = setInterval");
    expect(source).toContain("clearInterval(verificationHeartbeat)");
    expect(source).toContain("getBackupRemoteVerification(row.manifestJson).status !== \"verifying\"");
    expect(source).toContain("eq(systemBackups.manifestJson, row.manifestJson)");
    expect(source).toContain("lte(systemBackups.updatedAt, cutoff)");
  });
  it("keeps existing encryption, archive safety and in-memory admin restore guard untouched", () => {
    expect(source).toContain("MAX_CONCURRENT_BACKUPS = 1");
    expect(source).toContain("verifyEncryptedArchiveStreamContent");
    expect(source).toContain("const activeBackupControllers = new Map");
  });
});
