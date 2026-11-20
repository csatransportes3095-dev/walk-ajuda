import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { createSiteAccessGateway } from "./siteAccessGateway";
import { h2AutoDiagnosticsSchema } from "./h2-auto-diagnostics";

const { execute, transaction, getDb } = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock("./db", () => ({ getDb }));

import { registerH2AutoDeviceRoutes } from "./h2-auto-remote";

type DbState = {
  token: string;
  revision: number;
  acceptUpdates: boolean;
  diagnosticInserts: number;
};
const DEVICE_ID = "0123456789abcdef01234567";
const TOKEN = "a".repeat(64);
const OTHER_TOKEN = "b".repeat(64);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const validConfig = {
  media: {
    enabled: false,
    transcribeAudio: false,
    audioFallback: "fallback",
    photoReply: "photo",
    videoReply: "video",
    documentReply: "document",
    stickerReply: "sticker",
    unknownReply: "unknown",
    cooldownSeconds: 120,
    maxAudioSeconds: 30,
  },
  enabled: false,
  ordersEnabled: false,
  orderSessionHours: 24,
  orderCodeTtlMinutes: 10,
  orderCodeMaxAttempts: 5,
  orderNoOrdersMessage: "none",
  welcome: "",
  menu: ["", "", "", "", "", "", "", "", ""],
  whatsappMode: -1,
  pauseMinutes: 60,
  scheduleOn: false,
  scheduleStart: "09:00",
  scheduleEnd: "18:00",
  blocked: "",
  rules: [],
};
const validDiagnostics = {
  apkVersion: "1.16-audio-safe",
  apkVersionCode: 16,
  mediaEnabled: true,
  transcribeConfigured: true,
  recordAudioPermission: true,
  listenerConnected: true,
  statusCode: "MEDIA_DETECTED" as const,
  statusAt: 1_700_000_000_000,
  androidErrorCode: -1,
  replyStatusCode: "MEDIA_SENT" as const,
  replyStatusAt: 1_700_000_000_000,
};

function sqlText(query: any): string {
  return (query?.queryChunks || [])
    .map((chunk: any) => {
      if (typeof chunk === "string") return "?";
      return Array.isArray(chunk?.value) ? chunk.value.join("") : "?";
    })
    .join("");
}

function configureDb(state: DbState) {
  execute.mockImplementation(async (query: any) => {
    const text = sqlText(query);
    if (text.startsWith("CREATE TABLE")) return [[]];
    if (text.includes("SELECT token_hash")) {
      return [
        [
          {
            token_hash: hash(state.token),
            revision: state.revision,
            config_json: JSON.stringify(validConfig),
          },
        ],
      ];
    }
    if (text.includes("INSERT INTO h2_auto_diagnostics")) {
      state.diagnosticInserts += 1;
      return [{ affectedRows: 1 }];
    }
    if (text.includes("UPDATE h2_auto_devices"))
      return [{ affectedRows: state.acceptUpdates ? 1 : 0 }];
    return [[]];
  });
  transaction.mockImplementation(
    async (callback: (tx: any) => Promise<unknown>) => callback({ execute })
  );
  getDb.mockResolvedValue({ execute, transaction });
}

const servers: Server[] = [];
const previousOwner = process.env.H2_SITE_SECURITY_OWNER;
const previousSecret = process.env.H2_SITE_ACCESS_SECRET;
async function request(path: string, init: RequestInit = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    createSiteAccessGateway({
      enabled: () => true,
      mode: async () => "blocked",
      isAdmin: () => false,
      visitor: async () => false,
    })
  );
  registerH2AutoDeviceRoutes(app);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("server address unavailable");
  return fetch(`http://127.0.0.1:${address.port}${path}`, init);
}

function headers(token = TOKEN) {
  return {
    "content-type": "application/json",
    "x-h2-device-id": DEVICE_ID,
    "x-h2-device-token": token,
  };
}

describe("H2 Auto mídia e ACK privacy-safe", () => {
  const state: DbState = {
    token: TOKEN,
    revision: 1,
    acceptUpdates: true,
    diagnosticInserts: 0,
  };

  beforeEach(() => {
    process.env.H2_SITE_SECURITY_OWNER = "h2-auto-test-owner";
    process.env.H2_SITE_ACCESS_SECRET =
      "h2-auto-test-secret-with-more-than-32-characters";
    vi.clearAllMocks();
    state.token = TOKEN;
    state.revision = 1;
    state.acceptUpdates = true;
    state.diagnosticInserts = 0;
    configureDb(state);
  });
  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(
          server => new Promise<void>(resolve => server.close(() => resolve()))
        )
    );
    if (previousOwner === undefined) delete process.env.H2_SITE_SECURITY_OWNER;
    else process.env.H2_SITE_SECURITY_OWNER = previousOwner;
    if (previousSecret === undefined) delete process.env.H2_SITE_ACCESS_SECRET;
    else process.env.H2_SITE_ACCESS_SECRET = previousSecret;
  });

  it("mantém o ACK antigo válido e não grava diagnóstico sem o campo opcional", async () => {
    const response = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ revision: 1 }),
    });
    expect(response.status).toBe(200);
    expect(state.diagnosticInserts).toBe(0);
  });

  it("aceita apenas o objeto de diagnóstico estrito e persiste depois da autenticação", async () => {
    expect(h2AutoDiagnosticsSchema.safeParse(validDiagnostics).success).toBe(
      true
    );
    const response = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ revision: 1, diagnostics: validDiagnostics }),
    });
    expect(response.status).toBe(200);
    expect(state.diagnosticInserts).toBe(1);

    const invalidResponse = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        revision: 1,
        diagnostics: { ...validDiagnostics, transcript: "conteúdo privado" },
      }),
    });
    expect(invalidResponse.status).toBe(400);
    expect(state.diagnosticInserts).toBe(1);
  });

  it("aceita apenas os sete novos códigos de foto dos APKs 2.16 e 2.17", async () => {
    const details = [
      "INTERVENTION_CLICK", "INTERVENTION_TEXT", "INTERVENTION_MEDIA",
      "INTERVENTION_DRAFT", "INTERVENTION_CAPTION", "INTERVENTION_COMPOSER",
      "INTERVENTION_EXTRA_MEDIA",
    ];
    for (const detail of details) {
      const response = await request("/api/h2-auto/ack", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          revision: 1,
          diagnostics: {
            ...validDiagnostics,
            apkVersion: "2.17-image-draft",
            apkVersionCode: 117,
            imageRepliesSupported: true,
            imageCacheReady: 1,
            imageCacheFailed: 0,
            imageReplyStatusCode: "PAUSED",
            imageReplyStatusAt: 1_700_000_000_000,
            imageReplyQueuePending: 0,
            imageReplyStage: "IMAGE",
            imageReplyAccessibilityConnected: true,
            imageReplyDetailCode: detail,
          },
        }),
      });
      expect(response.status, detail).toBe(200);
    }
    expect(state.diagnosticInserts).toBe(details.length);
    const unknown = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        revision: 1,
        diagnostics: {
          ...validDiagnostics,
          imageReplyDetailCode: "java.lang.Exception: mensagem privada",
        },
      }),
    });
    expect(unknown.status).toBe(400);
    expect(state.diagnosticInserts).toBe(details.length);
  });

  it("recebe no ACK o inventário individual de fotos do cache, sem aceitar paths privados", async () => {
    const inventory = [{
      faqId: "faq_86", imageId: "a".repeat(32), sha256: "b".repeat(64), state: "READY",
    }, {
      faqId: "faq_87", imageId: "c".repeat(32), sha256: "d".repeat(64), state: "MISSING",
    }];
    const diagnostics = {
      ...validDiagnostics,
      apkVersion: "2.18-image-cache",
      apkVersionCode: 118,
      imageCacheFiles: inventory,
      imageCacheFilesTruncated: false,
      imageCacheUpdatedAt: 1_700_000_000_000,
    };
    const ok = await request("/api/h2-auto/ack", {
      method: "POST", headers: headers(),
      body: JSON.stringify({ revision: 1, diagnostics }),
    });
    expect(ok.status).toBe(200);
    expect(state.diagnosticInserts).toBe(1);
    for (const invalid of [
      { ...inventory[0], path: "/data/user/0/private.jpg" },
      { ...inventory[0], imageId: "invalid" },
      { ...inventory[0], state: "SENT_CONFIRMED" },
    ]) {
      const result = await request("/api/h2-auto/ack", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ revision: 1, diagnostics: { ...diagnostics, imageCacheFiles: [invalid] } }),
      });
      expect(result.status).toBe(400);
    }
    expect(state.diagnosticInserts).toBe(1);
  });

  it("aceita o ACK da versão 1.95 com somente estado e horário de OTP", async () => {
    const response = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        revision: 1,
        diagnostics: {
          ...validDiagnostics,
          apkVersion: "1.95-auto-otp-fallback",
          apkVersionCode: 95,
          otpDeliveryStatusCode: "OTP_FALLBACK_AVAILABLE",
          otpDeliveryStatusAt: 1_700_000_000_000,
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(state.diagnosticInserts).toBe(1);
  });

  it("aceita todos os estados OTP técnicos realmente emitidos pelo APK 2.02, sem expor dados privados", async () => {
    const stages = [
      "OTP_WHATSAPP_WINDOW_VISIBLE",
      "OTP_RECIPIENT_VERIFIED",
      "OTP_RECIPIENT_NOT_VERIFIED",
      "OTP_COMPOSER_FILLED",
      "OTP_COMPOSER_FILL_FAILED",
      "OTP_SEND_BUTTON_NOT_READY",
      "OTP_SEND_BUTTON_VERIFIED",
      "OTP_WHATSAPP_WINDOW_NOT_SEEN",
      "OTP_CHAT_NOT_VERIFIED",
      "OTP_SEND_NOT_CONFIRMED",
      "OTP_FAILURE_NOTIFICATION_UNAVAILABLE",
      "OTP_INCOMING_REPLY_UNAVAILABLE",
      "OTP_INCOMING_LOOKUP_FAILED",
      "OTP_INCOMING_ACK_PENDING",
    ];
    for (const stage of stages) {
      const response = await request("/api/h2-auto/ack", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          revision: 1,
          diagnostics: {
            ...validDiagnostics,
            apkVersion: "2.02-otp-incoming-reply",
            apkVersionCode: 102,
            otpDeliveryStatusCode: stage,
            otpDeliveryStatusAt: 1_700_000_000_000,
          },
        }),
      });
      expect(response.status, stage).toBe(200);
    }
    expect(state.diagnosticInserts).toBe(stages.length);
  });

  it("rejeita códigos OTP desconhecidos, timestamps inválidos e dados privados", async () => {
    for (const extra of [
      { otpDeliveryStatusCode: "OTP_UNKNOWN", otpDeliveryStatusAt: 1_700_000_000_000 },
      { otpDeliveryStatusCode: "OTP_AUTO_OPEN_REQUESTED", otpDeliveryStatusAt: -1 },
      { otpDeliveryStatusCode: "OTP_AUTO_OPEN_REQUESTED", otpDeliveryStatusAt: "17:15" },
      { otpDeliveryStatusCode: "OTP_AUTO_OPEN_REQUESTED", otpDeliveryStatusAt: 1_700_000_000_000, code: "123456" },
      { otpDeliveryStatusCode: "OTP_AUTO_OPEN_REQUESTED", otpDeliveryStatusAt: 1_700_000_000_000, phone: "5511999999999" },
    ]) {
      const response = await request("/api/h2-auto/ack", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          revision: 1,
          diagnostics: { ...validDiagnostics, ...extra },
        }),
      });
      expect(response.status).toBe(400);
    }
    expect(state.diagnosticInserts).toBe(0);
  });

  it("não expõe endpoint amplo e mantém a mídia protegida por token e revisão", async () => {
    const extra = await request("/api/h2-auto/media/extra", {
      method: "POST",
      headers: headers(),
      body: "{}",
    });
    expect(extra.status).toBe(403);

    const validMedia = { ...validConfig.media, enabled: true };
    const accepted = await request("/api/h2-auto/media", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ expectedRevision: 1, media: validMedia }),
    });
    expect(accepted.status).toBe(200);

    const unauthorized = await request("/api/h2-auto/media", {
      method: "POST",
      headers: headers(OTHER_TOKEN),
      body: JSON.stringify({ expectedRevision: 1, media: validMedia }),
    });
    expect(unauthorized.status).toBe(401);

    state.revision = 2;
    const stale = await request("/api/h2-auto/media", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ expectedRevision: 1, media: validMedia }),
    });
    expect(stale.status).toBe(409);
  });

  it("não reintroduz diagnóstico quando a revogação vence a atualização condicional", async () => {
    state.acceptUpdates = false;
    const response = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ revision: 1, diagnostics: validDiagnostics }),
    });
    expect(response.status).toBe(409);
    expect(state.diagnosticInserts).toBe(0);
  });
});
