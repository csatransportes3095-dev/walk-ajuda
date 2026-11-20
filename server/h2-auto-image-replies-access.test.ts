import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { h2AutoPersonalizationSchema, type H2AutoFaqRule } from "../shared/h2AutoPersonalization";
import { h2AutoReplyImagePath, type H2AutoReplyImage } from "../shared/h2AutoReplyImage";

const state = vi.hoisted(() => ({ stage: "choice", bot: true, blocked: "", faq: [] as any[], statements: [] as string[] }));
const token = "a".repeat(64), device = "0123456789abcdef01234567", conversation = "c".repeat(64);
vi.mock("./db", () => ({ getDb: async () => {
  const execute = async (query: any) => {
    const text = new MySqlDialect().sqlToQuery(query).sql;
    state.statements.push(text);
    if (text.includes("SELECT token_hash")) return [[{ token_hash: createHash("sha256").update(token).digest("hex") }]];
    if (text.includes("AS confirmation_json")) return [[{ bot_on: state.bot ? "true" : "false", identity_on: "true", session_hours: 24,
      collection_on: "false", blocked_phones: state.blocked,
      personalization_json: { enabled: true, tone: "objetivo", faq: state.faq } }]];
    if (text.includes("SELECT * FROM h2_auto_access_sessions")) return state.stage === "absent" ? [[]] : [[{
      stage: state.stage, updated_at: Date.now(), expires_at: Date.now() + 100000,
    }]];
    return [[]];
  };
  return { execute, transaction: async (callback: any) => callback({ execute }) };
} }));
import { registerH2AutoAccessRoutes } from "./h2-auto-access";
import { supportsH2AutoImageReplies } from "./h2-auto-image-reply-response";
import { h2AutoDiagnosticsSchema } from "./h2-auto-diagnostics";

let server: Server, base: string;
const image = (letter = "a"): H2AutoReplyImage => ({ id: letter.repeat(32), sha256: letter.repeat(64), mimeType: "image/jpeg",
  fileSize: 32, width: 20, height: 10, downloadPath: h2AutoReplyImagePath(device, letter.repeat(32)) });
const rule = (id = "photo_example", question = "Mostre a imagem do exemplo", answer = "", picture = image()): H2AutoFaqRule =>
  ({ id, question, answer, image: picture, variations: "Pode enviar a imagem de exemplo?", enabled: true });
beforeAll(async () => {
  const app = express(); app.use(express.json()); registerH2AutoAccessRoutes(app);
  server = app.listen(0); await new Promise<void>(resolve => server.once("listening", resolve));
  base = "http://127.0.0.1:" + (server.address() as any).port;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => { state.stage = "choice"; state.bot = true; state.blocked = ""; state.statements = []; state.faq = [rule()]; });
async function step(input: string, options: { capabilities?: string; auth?: boolean; contactLabel?: string } = {}) {
  const response = await fetch(base + "/api/h2-auto/access/step", { method: "POST", headers: {
    "Content-Type": "application/json",
    ...(options.auth === false ? {} : { "x-h2-device-id": device, "x-h2-device-token": token }),
    "x-h2-capabilities": options.capabilities ?? "imageRepliesV1",
  }, body: JSON.stringify({ conversationId: conversation, input, contactLabel: options.contactLabel }) });
  return { status: response.status, body: await response.json() };
}

describe("H2 Auto configured images through the real access route", () => {
  it.each(["choice", "absent"])("returns a real attachment contract and no link or artificial text in %s", async stage => {
    state.stage = stage;
    const response = await step("Mostre a imagem do exemplo");
    expect(response).toMatchObject({ status: 200, body: { state: "choice", message: "", imageReplyStatus: "ready",
      images: [{ ...image(), faqId: "photo_example" }] } });
    expect(response.body.message).not.toContain(image().downloadPath);
  });
  it("uses variations and keeps the complete written reply alongside the image", async () => {
    state.faq = [rule(undefined, undefined, "Confira este exemplo de imagem.")];
    const response = await step("Pode enviar a imagem de exemplo?");
    expect(response.body.message).toContain("Confira este exemplo de imagem.");
    expect(response.body.images[0].id).toBe(image().id);
  });
  it.each(["customer_phone", "referrals_phone", "referral_phone"])("keeps the pending identity reminder in %s", async stage => {
    state.stage = stage;
    const response = await step("Mostre a imagem do exemplo");
    expect(response.body.state).toBe(stage);
    expect(response.body.message).toContain("informe seu telefone com DDD");
    expect(response.body.images).toHaveLength(1);
    expect(state.statements.filter(text => /INSERT INTO h2_auto_phone_failures/.test(text))).toHaveLength(0);
  });
  it("preserves two different attachments when a notification groups two questions", async () => {
    state.faq = [rule(), rule("photo_uniform", "Qual imagem do uniforme?", "Exemplo do uniforme.", image("b"))];
    const response = await step("Mostre a imagem do exemplo\nQual imagem do uniforme?");
    expect(response.body.images.map((attachment: any) => attachment.id)).toEqual([image().id, image("b").id]);
    expect(response.body.message).toContain("Exemplo do uniforme.");
    expect(response.body.message).not.toContain("/reply-images/");
  });
  it("does not send the same image twice for two matching rules", async () => {
    state.faq = [rule(), rule("photo_uniform", "Qual imagem do uniforme?", "Confira o mesmo exemplo.", image())];
    const response = await step("Mostre a imagem do exemplo\nQual imagem do uniforme?");
    expect(response.body.images).toHaveLength(1);
  });
  it("caps a burst at three images and explicitly asks for the remaining questions separately", async () => {
    state.faq = [rule("photo_one", "Mostre figura do primeiro exemplo", "", image("a")),
      rule("photo_two", "Mostre figura da segunda roupa", "", image("b")),
      rule("photo_three", "Mostre figura da terceira paisagem", "", image("c")),
      rule("photo_four", "Mostre figura do quarto objeto", "", image("d"))];
    const response = await step(state.faq.map(entry => entry.question).join("\n"));
    expect(response.body.images).toHaveLength(3);
    expect(response.body.imagesTruncated).toBe(true);
    expect(response.body.message).toContain("demais perguntas separadamente");
  });
  it("preserves text for an older APK and never hands it an image URL", async () => {
    state.faq = [rule(undefined, undefined, "Texto que o APK anterior consegue responder.")];
    const response = await step("Mostre a imagem do exemplo", { capabilities: "" });
    expect(response.body.message).toContain("Texto que o APK anterior consegue responder.");
    expect(response.body.images).toBeUndefined();
    expect(response.body.imageReplyStatus).toBe("apk_update_required");
    expect(JSON.stringify(response.body)).not.toContain("/reply-images/");
  });
  it("reports unavailable image-only replies on an older APK instead of returning an empty reply", async () => {
    const response = await step("Mostre a imagem do exemplo", { capabilities: "" });
    expect(response.body.message).toBe("Não consegui enviar a imagem desta resposta agora.");
    expect(response.body.imageReplyStatus).toBe("apk_update_required");
  });
  it("does not bypass authentication, disabled devices, contacts or validation blocks", async () => {
    expect((await step("Mostre a imagem do exemplo", { auth: false })).status).toBe(401);
    state.bot = false; expect((await step("Mostre a imagem do exemplo")).body.images).toBeUndefined();
    state.bot = true; state.stage = "blocked"; expect((await step("Mostre a imagem do exemplo")).body.state).toBe("blocked");
    state.stage = "choice"; state.blocked = "11999999999";
    expect((await step("Mostre a imagem do exemplo", { contactLabel: "11999999999" })).body.images).toBeUndefined();
  });
  it("keeps numeric codes, MENU and disabled FAQ rules out of attachment replies", async () => {
    state.faq[0].enabled = false;
    expect((await step("Mostre a imagem do exemplo")).body.images).toBeUndefined();
    state.faq[0].enabled = true;
    for (const input of ["MENU", "123456", "11999999999"])
      expect((await step(input)).body.images).toBeUndefined();
  });
  it("requires the exact capability name and keeps old image-free configs valid", () => {
    expect(supportsH2AutoImageReplies("imageRepliesV1")).toBe(true);
    expect(supportsH2AutoImageReplies("another, imageRepliesV1")).toBe(true);
    expect(supportsH2AutoImageReplies("imageRepliesV10")).toBe(false);
    expect(h2AutoPersonalizationSchema.safeParse({ enabled: true, faq: [{ id: "old_rule", question: "Qual exemplo?", answer: "Uma resposta antiga." }] }).success).toBe(true);
  });
  it("accepts fixed image diagnostics without storing filenames, URLs or arbitrary errors", () => {
    const minimal = { apkVersion: "2.14", apkVersionCode: 114, mediaEnabled: false, transcribeConfigured: false,
      recordAudioPermission: false, listenerConnected: true, statusCode: "NOT_CHECKED", statusAt: 0,
      androidErrorCode: -1, replyStatusCode: "NOT_CHECKED", replyStatusAt: 0 };
    expect(h2AutoDiagnosticsSchema.safeParse({ ...minimal, imageRepliesSupported: true, imageCacheReady: 2,
      imageCacheFailed: 0, imageReplyStatusCode: "ACTION_ACCEPTED_UNVERIFIED", imageReplyStatusAt: 0,
      imageReplyQueuePending: 1 }).success).toBe(true);
    expect(h2AutoDiagnosticsSchema.safeParse({ ...minimal, imageDownloadUrl: "https://invalid.test/private" }).success).toBe(false);
    expect(h2AutoDiagnosticsSchema.safeParse({ ...minimal, imageReplyStatusCode: "SENT TO CLIENT NAME" }).success).toBe(false);
  });
});
