import { describe, expect, it } from "vitest";
import { getDisasterRecoveryState, isRecoverableEnvironmentName, mergeRecoveryDriveKitState, selectDisasterRecoveryEnvironment } from "./disasterRecoveryKit";

describe("disasterRecoveryKit", () => {
  it("nunca coloca a chave que abre o proprio backup dentro do pacote", () => {
    const selected = selectDisasterRecoveryEnvironment({
      DATABASE_URL: "mysql://example",
      JWT_SECRET: "jwt",
      BACKUP_ENCRYPTION_KEY: "nao-pode-entrar",
      RESTORE_DATABASE_URL: "tambem-nao",
      RENDER_GIT_COMMIT: "nao-precisa",
    }, ["DATABASE_URL", "JWT_SECRET", "BACKUP_ENCRYPTION_KEY", "RESTORE_DATABASE_URL", "RENDER_GIT_COMMIT"]);
    expect(selected.DATABASE_URL).toBe("mysql://example");
    expect(selected.JWT_SECRET).toBe("jwt");
    expect(selected.BACKUP_ENCRYPTION_KEY).toBeUndefined();
    expect(selected.RESTORE_DATABASE_URL).toBeUndefined();
    expect(selected.RENDER_GIT_COMMIT).toBeUndefined();
  });

  it("aceita nomes de configuracao da aplicacao e rejeita variaveis de plataforma", () => {
    expect(isRecoverableEnvironmentName("H2ADS_PROXY_ENCRYPTION_KEY")).toBe(true);
    expect(isRecoverableEnvironmentName("SMTP_PASS")).toBe(true);
    expect(isRecoverableEnvironmentName("GITHUB_TOKEN")).toBe(false);
    expect(isRecoverableEnvironmentName("BACKUP_ENCRYPTION_KEY")).toBe(false);
  });

  it("expõe somente estado seguro do kit no painel", () => {
    const manifest = JSON.stringify({
      disasterRecovery: { version: 1, environmentVariableCount: 18, missingCriticalVariables: [], files: [], backupEncryptionKeyStored: false, externalKeyRequired: true },
    });
    const withDrive = mergeRecoveryDriveKitState(manifest, {
      status: "completed",
      uploadedAt: "2026-08-28T12:00:00.000Z",
      files: [{ name: "tool.mjs", id: "drive-id" }],
      error: null,
    });
    expect(getDisasterRecoveryState(withDrive)).toMatchObject({
      disasterRecoveryReady: true,
      disasterRecoveryVersion: 1,
      recoveryEnvironmentCount: 18,
      recoveryDriveKitStatus: "completed",
    });
    expect(getDisasterRecoveryState(withDrive)).not.toHaveProperty("variables");
  });
});
