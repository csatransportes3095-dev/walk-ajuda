import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import { h2AutoReplyImageSchema, h2AutoReplyImagePath } from "../shared/h2AutoReplyImage";
import { h2AutoFaqRuleSchema } from "../shared/h2AutoPersonalization";

const fixture = vi.hoisted(() => ({ execute: vi.fn(), objects: new Map<string, Buffer>(), images: [] as any[],
  linked: [] as any[], deviceExists: true, rejectInsert: false }));
vi.mock("./db", () => ({ getDb: async () => ({ execute: fixture.execute }) }));
vi.mock("./storage", () => ({ storagePut: async (key: string, buffer: Buffer) => {
  fixture.objects.set(key, Buffer.from(buffer)); return { key, url: `https://storage.invalid/${key}` };
} }));
vi.mock("./r2Storage", () => ({
  r2HeadObject: async (key: string) => ({ contentLength: fixture.objects.get(key)?.length ?? null }),
  r2GetObjectBuffer: async (key: string) => Buffer.from(fixture.objects.get(key) || []),
  r2DeleteObjects: async (keys: string[]) => { for (const key of keys) fixture.objects.delete(key); },
}));
vi.mock("./backupRestoreService", () => ({ isSystemRestoreLocked: () => false }));
import { normalizeH2AutoReplyImage, uploadH2AutoReplyImage, assertH2AutoReplyImages,
  registerH2AutoReplyImageRoutes } from "./h2-auto-reply-images";
import { isAdminJwtValid } from "./_core/trpc";
import { createSiteAccessGateway } from "./siteAccessGateway";
import { isSecurityPublicPath } from "./siteAccessPolicy";

const DEVICE = "1234567890abcdef12345678", OTHER = "abcdef1234567890abcdef12", TOKEN = "a".repeat(64);
const SECRET = "h2-image-authorization-isolated-test-secret";
const auth = { "x-h2-device-id": DEVICE, "x-h2-device-token": TOKEN };
let server: Server, base: string, png: Buffer;
const adminCookie = () => "admin_token=" + jwt.sign({ sub: "image-test", role: "admin" }, SECRET);

beforeAll(async () => {
  vi.stubEnv("JWT_SECRET", SECRET);
  png = await sharp({ create: { width: 40, height: 30, channels: 4, background: "#00cccc88" } }).png().toBuffer();
  const app = express();
  // The production gateway remains enabled and blocked: only the exact new
  // independently authenticated image path is admitted to its own handler.
  app.use(createSiteAccessGateway({ enabled: () => true, mode: async () => "blocked",
    isAdmin: isAdminJwtValid, visitor: async () => false }));
  registerH2AutoReplyImageRoutes(app);
  server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = "http://127.0.0.1:" + (server.address() as any).port;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); vi.unstubAllEnvs(); });
beforeEach(() => {
  fixture.objects.clear(); fixture.images = []; fixture.linked = []; fixture.deviceExists = true; fixture.rejectInsert = false;
  fixture.execute.mockReset().mockImplementation(async query => {
    const { sql: text, params } = new MySqlDialect().sqlToQuery(query);
    if (text.startsWith("CREATE TABLE")) return [[]];
    if (text.startsWith("SELECT id FROM h2_auto_devices")) return [fixture.deviceExists ? [{ id: DEVICE }] : []];
    if (text.startsWith("SELECT token_hash,config_json")) return [fixture.deviceExists && params[0] === DEVICE ? [{
      token_hash: createHash("sha256").update(TOKEN).digest("hex"), config_json: { personalization: { faq: fixture.linked } },
    }] : []];
    if (text.startsWith("INSERT INTO h2_auto_reply_images")) {
      if (fixture.rejectInsert) throw new Error("Synthetic failed write");
      const [device_id, id, storage_key, sha256, mime_type, file_size, width, height] = params;
      fixture.images.push({ device_id, id, storage_key, sha256, mime_type, file_size, width, height });
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith("SELECT * FROM h2_auto_reply_images"))
      return [fixture.images.filter(row => row.device_id === params[0] && params.slice(1).includes(row.id))];
    throw new Error("Unexpected image query: " + text);
  });
});
async function upload() { return (await uploadH2AutoReplyImage({ id: DEVICE, imageBase64: png.toString("base64"), mimeType: "image/png" })).image; }

describe("H2 Auto image validation and owned storage", () => {
  it("decodes transparent PNG pixels, computes integrity and returns only an authenticated path", async () => {
    const image = await upload();
    expect(image).toMatchObject({ mimeType: "image/png", width: 40, height: 30 });
    expect(image.downloadPath).toBe(h2AutoReplyImagePath(DEVICE, image.id));
    expect(JSON.stringify(image)).not.toContain("storage.invalid");
    const stored = fixture.objects.get(fixture.images[0].storage_key)!;
    expect(image.sha256).toBe(createHash("sha256").update(stored).digest("hex"));
    expect(image.fileSize).toBe(stored.length);
    expect((await sharp(stored).metadata()).hasAlpha).toBe(true);
    await expect(assertH2AutoReplyImages(DEVICE, [{ image }])).resolves.toBeUndefined();
  });
  it("converts WebP to JPEG, reduces oversized dimensions and removes source metadata", async () => {
    const input = await sharp({ create: { width: 2400, height: 600, channels: 3, background: "#445566" } })
      .withMetadata({ exif: { IFD0: { Artist: "SYNTHETIC TEST" } } }).webp().toBuffer();
    const result = await normalizeH2AutoReplyImage(input.toString("base64"), "image/webp");
    expect(result).toMatchObject({ mimeType: "image/jpeg", width: 2048, height: 512 });
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe("jpeg"); expect(metadata.exif).toBeUndefined();
  });
  it.each(["not base64!", "", "AAAA=", "data:image/png;base64,AAAA"])("rejects malformed base64 %s", async value => {
    await expect(normalizeH2AutoReplyImage(value, "image/png")).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects a fake MIME, corrupt pixels, SVG and an oversized upload", async () => {
    for (const [bytes, mime] of [[png, "image/jpeg"], [Buffer.from("not a photo"), "image/png"],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), "image/png"],
      [Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"]] as const) {
      await expect(normalizeH2AutoReplyImage(bytes.toString("base64"), mime)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });
  it("does not store an image for a missing device", async () => {
    fixture.deviceExists = false;
    await expect(upload()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fixture.objects.size).toBe(0);
  });
  it("cleans up only the new unpublished object after a database failure", async () => {
    fixture.objects.set("previous-saved-image", Buffer.from("keep")); fixture.rejectInsert = true;
    await expect(upload()).rejects.toThrow("Synthetic failed write");
    expect([...fixture.objects.keys()]).toEqual(["previous-saved-image"]);
  });
  it("rejects cross-device metadata and changes to hash or size", async () => {
    const image = await upload();
    await expect(assertH2AutoReplyImages(OTHER, [{ image }])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(assertH2AutoReplyImages(DEVICE, [{ image: { ...image, sha256: "b".repeat(64) } }])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(assertH2AutoReplyImages(DEVICE, [{ image: { ...image, fileSize: image.fileSize + 1 } }])).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("accepts image-only replies and rejects blank replies, arbitrary URLs or mismatched IDs", async () => {
    const image = await upload();
    const rule = { id: "image_rule", question: "Qual imagem de exemplo?", answer: "", image };
    expect(h2AutoFaqRuleSchema.safeParse(rule).success).toBe(true);
    expect(h2AutoFaqRuleSchema.safeParse({ ...rule, image: undefined }).success).toBe(false);
    expect(h2AutoFaqRuleSchema.safeParse({ ...rule, answer: "ok" }).success).toBe(false);
    for (const downloadPath of ["https://untrusted.invalid/photo.png", "//untrusted.invalid/photo.png", "/api/h2-auto/reply-images/../private",
      image.downloadPath.replace(image.id, "b".repeat(32))]) {
      expect(h2AutoReplyImageSchema.safeParse({ ...image, downloadPath }).success).toBe(false);
    }
  });
});

describe("H2 Auto image download authorization and integrity", () => {
  it("allows an ADM preview before saving, but not an unlinked paired APK", async () => {
    const image = await upload();
    expect((await fetch(base + image.downloadPath, { headers: { cookie: adminCookie() } })).status).toBe(200);
    expect((await fetch(base + image.downloadPath, { headers: auth })).status).toBe(404);
  });
  it("requires valid device authentication or the ADM cookie", async () => {
    const image = await upload(); fixture.linked = [{ image }];
    for (const headers of [{}, { ...auth, "x-h2-device-token": "b".repeat(64) }, { ...auth, "x-h2-device-id": OTHER },
      { cookie: "admin_token=" + jwt.sign({ sub: "synthetic", role: "user" }, SECRET) }]) {
      expect((await fetch(base + image.downloadPath, { headers })).status).toBe(401);
    }
  });
  it("serves the exact verified bytes through the restricted-site gateway", async () => {
    const image = await upload(); fixture.linked = [{ image }];
    const response = await fetch(base + image.downloadPath, { headers: auth });
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-h2-image-sha256")).toBe(image.sha256);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.sha256);
    expect(isSecurityPublicPath(image.downloadPath)).toBe(true);
    expect(isSecurityPublicPath(image.downloadPath + "/extra")).toBe(false);
    expect(isSecurityPublicPath("/api/h2-auto/reply-images/")).toBe(false);
  });
  it("stops access once the image is removed from the device configuration", async () => {
    const image = await upload(); fixture.linked = [{ image }];
    expect((await fetch(base + image.downloadPath, { headers: auth })).status).toBe(200);
    fixture.linked = [];
    expect((await fetch(base + image.downloadPath, { headers: auth })).status).toBe(404);
  });
  it("stops an APK download for a disabled FAQ while preserving the ADM preview", async () => {
    const image = await upload(); fixture.linked = [{ image, enabled: false }];
    expect((await fetch(base + image.downloadPath, { headers: auth })).status).toBe(404);
    expect((await fetch(base + image.downloadPath, { headers: { cookie: adminCookie() } })).status).toBe(200);
  });
  it("rejects changed bytes even when the file size matches", async () => {
    const image = await upload(); fixture.linked = [{ image }];
    fixture.objects.set(fixture.images[0].storage_key, Buffer.alloc(image.fileSize, 2));
    const response = await fetch(base + image.downloadPath, { headers: auth });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "image_unavailable" });
  });
});
