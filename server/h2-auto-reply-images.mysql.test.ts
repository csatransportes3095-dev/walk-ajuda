import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import express from "express";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import type { TrpcContext } from "./_core/context";
import { h2AutoPersonalizationSchema } from "../shared/h2AutoPersonalization";
import type { H2AutoReplyImage } from "../shared/h2AutoReplyImage";

// The database, SQL statements, image decoder, HTTP routes, authorization and
// reply selection are real. Only the external R2 object-store boundary is local.
const isolated = vi.hoisted(() => ({ db: null as any, objects: new Map<string, Buffer>() }));
vi.mock("./db", () => ({ getDb: async () => isolated.db }));
vi.mock("./storage", () => ({ storagePut: async (key: string, bytes: Buffer) => {
  isolated.objects.set(key, Buffer.from(bytes)); return { key, url: `https://storage.invalid/${key}` };
} }));
vi.mock("./r2Storage", () => ({
  r2HeadObject: async (key: string) => ({ contentLength: isolated.objects.get(key)?.length ?? null }),
  r2GetObjectBuffer: async (key: string) => Buffer.from(isolated.objects.get(key) || []),
  r2DeleteObjects: async (keys: string[]) => { for (const key of keys) isolated.objects.delete(key); },
}));
vi.mock("./backupRestoreService", () => ({ isSystemRestoreLocked: () => false }));
import { h2AutoAdminRouter, registerH2AutoDeviceRoutes } from "./h2-auto-remote";
import { registerH2AutoAccessRoutes } from "./h2-auto-access";

const testUrl = process.env.H2_AUTO_REPLY_IMAGES_TEST_DB_URL?.trim();
const databaseName = "h2_auto_reply_images_test";
const secret = "h2-auto-reply-images-isolated-mysql-secret";
let pool: Pool | undefined, server: Server | undefined, base: string, png: Buffer;
let deviceId: string, deviceToken: string;
const question = "Mostre a figura sintética de teste";

function safeUrl(value: string) {
  const url = new URL(value), host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1", "mysql"].includes(host) ||
      decodeURIComponent(url.pathname) !== "/" + databaseName || url.search || url.hash) {
    throw new Error("H2_AUTO_REPLY_IMAGES_TEST_DB_URL must point only to the isolated local h2_auto_reply_images_test database.");
  }
  return url;
}
async function query(statement: string, values: any[] = []): Promise<any> { return (await pool!.query(statement, values))[0]; }
function caller(admin = true) {
  return h2AutoAdminRouter.createCaller({ user: null,
    req: { headers: { cookie: admin ? "admin_token=" + jwt.sign({ sub: "h2-image-test", role: "admin" }, secret) : "" } } as TrpcContext["req"],
    res: {} as TrpcContext["res"] });
}
function headers() { return { "x-h2-device-id": deviceId, "x-h2-device-token": deviceToken, "x-h2-capabilities": "imageRepliesV1" }; }
async function json(path: string, body?: unknown, extraHeaders = {}) {
  const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: {
    "Content-Type": "application/json", ...headers(), ...extraHeaders,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
async function current() {
  const row = (await query("SELECT config_json,revision FROM h2_auto_devices WHERE id=?", [deviceId]))[0];
  return { config: typeof row.config_json === "string" ? JSON.parse(row.config_json) : row.config_json, revision: Number(row.revision) };
}
async function upload(color?: string) {
  const bytes = color ? await sharp({ create: { width: 24, height: 18, channels: 3, background: color } }).png().toBuffer() : png;
  return (await caller().uploadReplyImage({ id: deviceId, imageBase64: bytes.toString("base64"), mimeType: "image/png" })).image;
}
async function save(image?: H2AutoReplyImage, answer = "", expectedRevision?: number) {
  return caller().savePersonalization({ id: deviceId, expectedRevision: expectedRevision ?? (await current()).revision,
    personalization: h2AutoPersonalizationSchema.parse({ enabled: true, tone: "objetivo", verifiedName: false,
      faq: [{ id: "synthetic_image", question, answer, ...(image ? { image } : {}), enabled: true }] }) });
}

describe.skipIf(!testUrl)("H2 Auto images — isolated MySQL upload/save/config/access/download", () => {
  beforeAll(async () => {
    const url = safeUrl(testUrl!);
    pool = createPool({ host: url.hostname.replace(/^\[|\]$/g, ""), port: Number(url.port || 3306), user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password), database: databaseName, timezone: "Z", connectionLimit: 5 });
    expect((await query("SELECT DATABASE() AS name"))[0].name).toBe(databaseName);
    isolated.db = drizzle(pool);
    vi.stubEnv("JWT_SECRET", secret);
    await query("DROP TRIGGER IF EXISTS h2_image_test_reject_insert");
    const existing = await query("SHOW TABLES LIKE 'h2_auto_%'");
    for (const row of existing) {
      const table = String(Object.values(row)[0]);
      if (!/^h2_auto_[a-z0-9_]+$/.test(table)) throw new Error("Unexpected isolated table");
      await query(`DROP TABLE ${table}`);
    }
    const app = express(); app.use(express.json({ limit: "8mb" }));
    registerH2AutoDeviceRoutes(app); registerH2AutoAccessRoutes(app);
    server = app.listen(0); await new Promise<void>(resolve => server!.once("listening", resolve));
    base = "http://127.0.0.1:" + (server.address() as any).port;
    png = await sharp({ create: { width: 48, height: 32, channels: 4, background: "#1122aa88" } }).png().toBuffer();
  }, 30_000);
  beforeEach(async () => {
    await query("DROP TRIGGER IF EXISTS h2_image_test_reject_insert");
    const created = await caller().create({ label: "Imagem sintética de teste" });
    deviceId = created.id;
    const paired = await json("/api/h2-auto/pair", { deviceId, code: created.code });
    expect(paired.status).toBe(200); deviceToken = paired.body.token;
    const state = await current();
    await caller().save({ id: deviceId, expectedRevision: state.revision, config: { ...state.config, enabled: true } });
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (pool) { await query("DROP TRIGGER IF EXISTS h2_image_test_reject_insert"); await pool.end(); }
    vi.unstubAllEnvs();
  });

  it("persists the uploaded image, syncs its exact metadata and returns verified photo bytes after a matching question", async () => {
    const image = await upload();
    const before = await current();
    await save(image);
    const persisted = await current();
    expect(persisted.revision).toBe(before.revision + 1);
    expect(persisted.config.personalization.faq[0].image).toEqual(image);
    for (const key of ["rules", "media", "confirmation", "manualControls", "pauseMinutes", "whatsappMode"])
      expect(persisted.config[key]).toEqual(before.config[key]);
    const synced = await json("/api/h2-auto/config");
    expect(synced.status).toBe(200);
    expect(synced.body.config.personalization.faq[0].image).toEqual(image);
    const reply = await json("/api/h2-auto/access/step", { conversationId: "c".repeat(64), input: question });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ message: "", images: [{ ...image, faqId: "synthetic_image" }] });
    const response = await fetch(base + reply.body.images[0].downloadPath, { headers: headers() });
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.status).toBe(200); expect(bytes.length).toBe(image.fileSize);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.sha256);
    expect((await sharp(bytes).metadata()).width).toBe(image.width);
  });
  it("rejects public uploads/saves and cross-device metadata without changing the response", async () => {
    await expect(caller(false).uploadReplyImage({ id: deviceId, imageBase64: png.toString("base64"), mimeType: "image/png" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const image = await upload();
    const second = await caller().create({ label: "Segundo aparelho sintético" });
    const personalization = h2AutoPersonalizationSchema.parse({ enabled: true, faq: [{ id: "foreign_image", question, answer: "", image }] });
    await expect(caller().savePersonalization({ id: second.id, personalization })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller(false).savePersonalization({ id: deviceId, personalization })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await current()).config.personalization.faq).toHaveLength(0);
  });
  it("replaces an image and retires the previous APK download without deleting the saved source", async () => {
    const first = await upload(); await save(first);
    const second = await upload("#cc3300"); await save(second, "Confira o exemplo atualizado.");
    expect((await current()).config.personalization.faq[0].image).toEqual(second);
    expect((await fetch(base + first.downloadPath, { headers: headers() })).status).toBe(404);
    expect((await fetch(base + second.downloadPath, { headers: headers() })).status).toBe(200);
    expect((await query("SELECT COUNT(*) AS total FROM h2_auto_reply_images WHERE device_id=?", [deviceId]))[0].total).toBe(2);
  });
  it("removes an attachment while retaining the edited written answer", async () => {
    const image = await upload(); await save(image); await save(undefined, "Resposta agora somente em texto.");
    const faq = (await current()).config.personalization.faq[0];
    expect(faq.image).toBeUndefined(); expect(faq.answer).toBe("Resposta agora somente em texto.");
    expect((await fetch(base + image.downloadPath, { headers: headers() })).status).toBe(404);
  });
  it("keeps a disabled FAQ in the ADM but stops its paired APK download", async () => {
    const image = await upload(); await save(image);
    const saved = await current();
    await caller().savePersonalization({ id: deviceId, expectedRevision: saved.revision,
      personalization: { ...saved.config.personalization, faq: [{ ...saved.config.personalization.faq[0], enabled: false }] } });
    expect((await current()).config.personalization.faq[0].image).toEqual(image);
    expect((await fetch(base + image.downloadPath, { headers: headers() })).status).toBe(404);
    const cookie = "admin_token=" + jwt.sign({ sub: "h2-image-test", role: "admin" }, secret);
    expect((await fetch(base + image.downloadPath, { headers: { cookie } })).status).toBe(200);
  });
  it("rejects one of two concurrent saves instead of losing the newer image", async () => {
    const first = await upload(), second = await upload("#cc3300"), revision = (await current()).revision;
    const results = await Promise.allSettled([save(first, "Primeira resposta.", revision), save(second, "Segunda resposta.", revision)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "CONFLICT" });
    const persisted = await current();
    expect(persisted.revision).toBe(revision + 1);
    expect([first.id, second.id]).toContain(persisted.config.personalization.faq[0].image.id);
  });
  it("preserves attachments across an old APK import and an old general settings form", async () => {
    const image = await upload(); await save(image, "Imagem com orientação.");
    const before = await current();
    const oldConfig = structuredClone(before.config);
    delete oldConfig.personalization.faq[0].image;
    const imported = await json("/api/h2-auto/import", { config: oldConfig });
    expect(imported.status).toBe(200); expect(imported.body.imported).toBe(false);
    expect((await current()).config.personalization.faq[0].image).toEqual(image);
    await caller().save({ id: deviceId, expectedRevision: before.revision, config: { ...oldConfig, pauseMinutes: 25 } });
    expect((await current()).config.personalization.faq[0].image).toEqual(image);
  });
  it("does not acknowledge an image upload if the registry insert fails", async () => {
    const first = await upload(); await save(first, "Imagem já salva.");
    const count = isolated.objects.size;
    await query("CREATE TRIGGER h2_image_test_reject_insert BEFORE INSERT ON h2_auto_reply_images FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic registry insert rejection'");
    await expect(upload("#ff8800")).rejects.toThrow();
    expect(isolated.objects.size).toBe(count);
    expect((await current()).config.personalization.faq[0].image).toEqual(first);
  });
});
