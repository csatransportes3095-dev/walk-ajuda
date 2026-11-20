import { describe, expect, it } from "vitest";
import { decodeH2AutoDiagnostics } from "./h2-auto-diagnostics";

const oldApkDiagnostics = {
  apkVersion: "2.21", apkVersionCode: 121,
  mediaEnabled: false, transcribeConfigured: false,
  recordAudioPermission: false, listenerConnected: true,
  statusCode: "NOT_CHECKED", statusAt: 0, androidErrorCode: -1,
  replyStatusCode: "NOT_CHECKED", replyStatusAt: 0,
};

describe("H2 AUTO image recipient diagnostics contract", () => {
  it("keeps older APK diagnostics valid without the new fields", () => {
    expect(decodeH2AutoDiagnostics(oldApkDiagnostics)).not.toBeNull();
  });

  it("accepts only fixed, privacy-safe recipient and UI stage codes", () => {
    const valid = {
      ...oldApkDiagnostics,
      imageReplyUiDiagnosticCode: "PREVIEW_RECIPIENT_NOT_VISIBLE",
      imageReplyUiStage: "PREVIEW",
    };
    const decoded = decodeH2AutoDiagnostics(valid);
    expect(decoded?.imageReplyUiDiagnosticCode).toBe("PREVIEW_RECIPIENT_NOT_VISIBLE");
    expect(decoded?.imageReplyUiStage).toBe("PREVIEW");
  });

  it("rejects arbitrary contact names, message bodies, and invalid stages", () => {
    expect(decodeH2AutoDiagnostics({
      ...oldApkDiagnostics, imageReplyUiDiagnosticCode: "Joao 11999999999",
    })).toBeNull();
    expect(decodeH2AutoDiagnostics({
      ...oldApkDiagnostics, imageReplyUiStage: "ENVIADO_PARA_CONTATO",
    })).toBeNull();
    expect(decodeH2AutoDiagnostics({
      ...oldApkDiagnostics, whatsappMessage: "conteudo privado",
    })).toBeNull();
  });
});
