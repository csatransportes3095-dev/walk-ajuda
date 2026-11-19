import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";

// Only external email transport and the DB getter are replaced. Every quota,
// transaction, challenge write and encrypted WhatsApp queue operation is real.
const isolated = vi.hoisted(() => ({ db: null as any, deliver: vi.fn() }));
vi.mock("./db", () => ({ getDb: async () => isolated.db }));
vi.mock("./siteAccessCodeDelivery", () => ({ deliverOwnSiteCode: isolated.deliver }));

import { CUSTOMER_CODE_MS, ensureCustomerOtpTables, requestCustomerCode } from "./customerOtpAccess";
import { ensureIncomingWhatsappOtpQueue } from "./h2-auto-incoming-otp";
import { decrypt } from "./h2-auto-otp-apk";

const testUrl = process.env.CUSTOMER_OTP_DELIVERY_TEST_DB_URL?.trim();
const secret = "isolated-customer-otp-delivery-secret-never-production-20261119";
const deviceId = "abcd".repeat(6);
const phoneA = "11999990001", phoneB = "11999990002";
const emailA = "otp-delivery-one@example.test";
const epoch = Date.parse("2026-11-19T19:00:00Z");
let now = epoch;
let pool: Pool | undefined;

function safeDatabaseUrl(value: string): URL {
  const parsed = new URL(value);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (parsed.protocol !== "mysql:" || !["127.0.0.1", "localhost", "::1", "mysql"].includes(host)
    || decodeURIComponent(parsed.pathname) !== "/h2_customer_otp_delivery_test" || parsed.search || parsed.hash) {
    throw new Error("CUSTOMER_OTP_DELIVERY_TEST_DB_URL must use the isolated local h2_customer_otp_delivery_test database.");
  }
  return parsed;
}
async function query(statement: string, values: any[] = []): Promise<any> {
  const [result] = await pool!.query(statement, values);
  return result;
}
const key = (scope: string, value: string) => createHmac("sha256", secret)
  .update("customer-otp-v2:" + scope + ":" + value).digest("hex");
const sendKey = (phone = phoneA) => key("limit", "phone:" + phone);
const source = (ip = "203.0.113.21", cf?: string) => ({
  ip, socket: { remoteAddress: ip }, headers: cf ? { "cf-connecting-ip": cf } : {},
}) as any;
const send = (channel: "email" | "whatsapp" = "email", phone = phoneA, request = source()) =>
  requestCustomerCode(phone, request, channel);
async function quotaHits(phone = phoneA) {
  const [row] = await query("SELECT hits FROM customerOtpLimits WHERE limitKey=?", [sendKey(phone)]);
  return Number(row?.hits || 0);
}
async function committedState(phone = phoneA) {
  return {
    challenge: await query("SELECT * FROM customerOtpChallenges WHERE phoneKey=?", [key("phone", phone)]),
    deliveryLimits: await query("SELECT * FROM customerOtpLimits WHERE limitKey IN (?,?,?) ORDER BY limitKey", [
      sendKey(phone), key("otp-resend:email", phone), key("otp-resend:whatsapp", phone),
    ]),
    queue: await query("SELECT * FROM h2_auto_otp_incoming_queue ORDER BY id"),
  };
}
async function assertIssued(result: Awaited<ReturnType<typeof send>>) {
  expect(result).toMatchObject({ success: true, resendBlocked: false, retryAfterSeconds: 60, cooldownScope: "channel" });
}

describe.skipIf(!testUrl)("Customer OTP delivery — real isolated MySQL", () => {
  beforeAll(async () => {
    const parsed = safeDatabaseUrl(testUrl!);
    pool = createPool({
      host: parsed.hostname, port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password),
      database: "h2_customer_otp_delivery_test", timezone: "Z", connectionLimit: 8,
    });
    expect((await query("SELECT DATABASE() AS name"))[0].name).toBe("h2_customer_otp_delivery_test");
    isolated.db = drizzle(pool);
    vi.stubEnv("JWT_SECRET", secret);
    vi.stubEnv("H2_SITE_ACCESS_SECRET", secret);
    vi.stubEnv("H2_AUTO_OTP_ENCRYPTION_SECRET", secret);
    vi.stubEnv("H2_CUSTOMER_OTP_V2_ENABLED", "true");
    vi.stubEnv("H2_AUTO_OTP_APK_ENABLED", "true");
    vi.stubEnv("H2_AUTO_OTP_DEVICE_ID", deviceId);
    vi.stubEnv("RENDER", "false");
    await query("DROP TRIGGER IF EXISTS otp_delivery_test_reject_queue");
    for (const table of ["h2_auto_otp_incoming_queue", "h2_auto_devices", "customerOtpSessions", "customerOtpChallenges", "customerOtpLimits", "customerOtpUsedProofs", "customers"]) {
      await query(`DROP TABLE IF EXISTS ${table}`);
    }
    await query(`CREATE TABLE customers (
      id INT NOT NULL PRIMARY KEY, phone VARCHAR(32) NOT NULL, email VARCHAR(320) NOT NULL,
      name VARCHAR(128) NOT NULL, blocked INT NOT NULL DEFAULT 0, deletedAt TIMESTAMP NULL,
      cpf VARCHAR(32) NULL, cep VARCHAR(16) NULL, street VARCHAR(255) NULL,
      addressNumber VARCHAR(32) NULL, neighborhood VARCHAR(128) NULL, city VARCHAR(128) NULL,
      uf VARCHAR(2) NULL, profilePhotoUrl TEXT NULL
    ) ENGINE=InnoDB`);
    await query("CREATE TABLE h2_auto_devices (id VARCHAR(32) NOT NULL PRIMARY KEY,token_hash CHAR(64) NOT NULL) ENGINE=InnoDB");
    await ensureCustomerOtpTables(isolated.db);
    // DDL is explicitly outside every code-issuance transaction.
    await ensureIncomingWhatsappOtpQueue(isolated.db);
  }, 30_000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    now = epoch;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubEnv("RENDER", "false");
    isolated.deliver.mockReset().mockResolvedValue({ channel: "smtp", messageId: "isolated-otp-delivery" });
    await query("DROP TRIGGER IF EXISTS otp_delivery_test_reject_queue");
    for (const table of ["h2_auto_otp_incoming_queue", "h2_auto_devices", "customerOtpSessions", "customerOtpChallenges", "customerOtpLimits", "customerOtpUsedProofs", "customers"]) {
      await query(`DELETE FROM ${table}`);
    }
    await query("INSERT INTO h2_auto_devices (id,token_hash) VALUES (?,?)", [
      deviceId, createHash("sha256").update("isolated-paired-device-token").digest("hex"),
    ]);
    await query("INSERT INTO customers (id,phone,email,name) VALUES (101,?,?,'Cliente sintético A'),(102,?,'otp-delivery-two@example.test','Cliente sintético B')", [phoneA, emailA, phoneB]);
  });

  afterAll(async () => {
    if (pool) await query("DROP TRIGGER IF EXISTS otp_delivery_test_reject_queue");
    await pool?.end();
    isolated.db = null;
    vi.restoreAllMocks(); vi.unstubAllEnvs();
  });

  it("does not spend six-delivery quota on cooldown clicks and keeps the other channel available", async () => {
    await assertIssued(await send());
    const initial = await committedState();
    for (let attempt = 0; attempt < 6; attempt++) {
      expect(await send()).toMatchObject({ resendBlocked: true, retryAfterSeconds: 60, cooldownScope: "channel" });
    }
    expect(await committedState()).toEqual(initial);
    expect(isolated.deliver).toHaveBeenCalledTimes(1);
    expect(await quotaHits()).toBe(1);
    await assertIssued(await send("whatsapp"));
    expect(isolated.deliver).toHaveBeenCalledTimes(1);
    expect(await quotaHits()).toBe(2);
    now += 60_000;
    await assertIssued(await send());
    expect(isolated.deliver).toHaveBeenCalledTimes(2);
    expect(await quotaHits()).toBe(3);
  });

  it("returns the actual remaining channel cooldown and permits a resend at the boundary", async () => {
    await send();
    now += 1_500;
    expect(await send()).toMatchObject({ resendBlocked: true, retryAfterSeconds: 59, cooldownScope: "channel" });
    now = epoch + 60_000;
    await assertIssued(await send());
    expect(await quotaHits()).toBe(2);
  });

  it("shares the six successful deliveries across email and WhatsApp without extending the hour on rejected requests", async () => {
    for (let index = 0; index < 6; index++) {
      now = epoch + index * 61_000;
      await assertIssued(await send(index % 2 ? "whatsapp" : "email"));
    }
    expect(await quotaHits()).toBe(6);
    now = epoch + 366_000;
    const before = await committedState();
    for (const channel of ["email", "whatsapp"] as const) {
      expect(await send(channel)).toMatchObject({ resendBlocked: true, retryAfterSeconds: 3234, cooldownScope: "all" });
    }
    expect(await committedState()).toEqual(before);
    now = epoch + 3_600_000;
    await assertIssued(await send());
    expect(await quotaHits()).toBe(1);
  });

  it("honors a durable quota left by an earlier process using the existing phone namespace", async () => {
    await query("INSERT INTO customerOtpLimits (limitKey,windowStart,hits) VALUES (?,?,6)", [sendKey(), now - 125_000]);
    expect(await send()).toMatchObject({ resendBlocked: true, retryAfterSeconds: 3475, cooldownScope: "all" });
    expect(isolated.deliver).not.toHaveBeenCalled();
    expect(await query("SELECT * FROM customerOtpChallenges WHERE codeDigest<>''")).toHaveLength(0);
    expect(await quotaHits()).toBe(6);
  });

  it("does not consume delivery quota or create a cooldown when repeated email transport attempts fail", async () => {
    isolated.deliver.mockRejectedValue(new Error("Synthetic transport unavailable"));
    for (let attempt = 0; attempt < 6; attempt++) await expect(send()).rejects.toBeDefined();
    expect(await quotaHits()).toBe(0);
    expect((await committedState()).challenge).toHaveLength(0);
    expect((await committedState()).deliveryLimits).toHaveLength(0);
    isolated.deliver.mockResolvedValue({ channel: "smtp", messageId: "isolated-recovered" });
    await assertIssued(await send());
    expect(await quotaHits()).toBe(1);
  });

  it("preserves the previous valid challenge and cooldown after a failed email resend", async () => {
    await send();
    const before = await committedState();
    now += 61_000;
    isolated.deliver.mockRejectedValueOnce(new Error("Synthetic resend failure"));
    await expect(send()).rejects.toBeDefined();
    expect(await committedState()).toEqual(before);
    await assertIssued(await send());
    expect(await quotaHits()).toBe(2);
  });

  it("commits an encrypted WhatsApp task with exactly its authoritative challenge and never emails it", async () => {
    await assertIssued(await send("whatsapp"));
    expect(isolated.deliver).not.toHaveBeenCalled();
    const [row] = await query(`SELECT q.payload_encrypted,q.phone_key,q.code_digest,q.expires_at,
      c.codeDigest,c.expiresAt,c.customerId FROM h2_auto_otp_incoming_queue q
      JOIN customerOtpChallenges c ON c.phoneKey=q.phone_key`);
    expect(row.phone_key).toBe(key("phone", phoneA));
    expect(Number(row.customerId)).toBe(101);
    expect(row.code_digest).toBe(row.codeDigest);
    expect(Number(row.expires_at)).toBe(now + CUSTOMER_CODE_MS);
    expect(Number(row.expiresAt)).toBe(Number(row.expires_at));
    const payload = JSON.parse(decrypt(String(row.payload_encrypted)));
    expect(payload.code).toMatch(/^\d{6}$/);
    expect(key("code:" + row.phone_key, payload.code)).toBe(row.codeDigest);
    expect(row.payload_encrypted).toMatch(/^[a-f0-9]{24}\.[a-f0-9]{32}\.[a-f0-9]+$/);
    expect(row.payload_encrypted).not.toContain('"code"');
  });

  it("rolls back queue replacement, challenge, cooldown and delivery quota together if the queue write fails", async () => {
    await send("whatsapp");
    const before = await committedState();
    now += 61_000;
    await query(`CREATE TRIGGER otp_delivery_test_reject_queue BEFORE INSERT ON h2_auto_otp_incoming_queue
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated OTP queue failure'`);
    for (let attempt = 0; attempt < 6; attempt++) await expect(send("whatsapp")).rejects.toBeDefined();
    expect(await committedState()).toEqual(before);
    expect(isolated.deliver).not.toHaveBeenCalled();
    await query("DROP TRIGGER otp_delivery_test_reject_queue");
    await assertIssued(await send("whatsapp"));
    expect(await quotaHits()).toBe(2);
    expect((await committedState()).queue).toHaveLength(1);
  });

  it("serializes simultaneous requests for the same phone and channel into one email", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => send()));
    expect(results.filter(result => !result.resendBlocked)).toHaveLength(1);
    expect(results.filter(result => result.resendBlocked)).toHaveLength(5);
    expect(isolated.deliver).toHaveBeenCalledTimes(1);
    expect(await quotaHits()).toBe(1);
    expect((await committedState()).challenge).toHaveLength(1);
  });

  it("allows only the sixth delivery when simultaneous channels compete for the last shared slot", async () => {
    for (let index = 0; index < 5; index++) {
      now = epoch + index * 61_000;
      await assertIssued(await send());
    }
    now = epoch + 305_000;
    const results = await Promise.all([send("email"), send("whatsapp")]);
    expect(results.filter(result => !result.resendBlocked)).toHaveLength(1);
    expect(results.filter(result => result.resendBlocked)).toEqual([
      expect.objectContaining({ cooldownScope: "all", retryAfterSeconds: 3295 }),
    ]);
    expect(await quotaHits()).toBe(6);
  });

  it("enqueues different customers concurrently into an empty queue without mixing recipients or losing tasks", async () => {
    const results = await Promise.all([
      send("whatsapp", phoneA, source("203.0.113.31")),
      send("whatsapp", phoneB, source("203.0.113.32")),
    ]);
    for (const result of results) await assertIssued(result);
    const tasks = await query(`SELECT q.phone_key,q.code_digest,c.customerId,c.codeDigest
      FROM h2_auto_otp_incoming_queue q JOIN customerOtpChallenges c ON c.phoneKey=q.phone_key
      ORDER BY c.customerId`);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((task: any) => Number(task.customerId))).toEqual([101, 102]);
    expect(tasks.map((task: any) => task.phone_key)).toEqual([key("phone", phoneA), key("phone", phoneB)]);
    for (const task of tasks) expect(task.code_digest).toBe(task.codeDigest);
    expect(await quotaHits(phoneA)).toBe(1);
    expect(await quotaHits(phoneB)).toBe(1);
    expect(isolated.deliver).not.toHaveBeenCalled();
  });

  it("keeps abuse protection for failed delivery attempts independently of the six-send quota", async () => {
    isolated.deliver.mockRejectedValue(new Error("Synthetic transport failure"));
    for (let attempt = 0; attempt < 30; attempt++) await expect(send()).rejects.toBeDefined();
    now += 10_000;
    expect(await send()).toMatchObject({ resendBlocked: true, retryAfterSeconds: 3590, cooldownScope: "all" });
    expect(isolated.deliver).toHaveBeenCalledTimes(30);
    expect(await quotaHits()).toBe(0);
    expect((await committedState()).challenge).toHaveLength(0);
  }, 30_000);

  it("limits the real Render client IP without sharing its proxy bucket with another customer", async () => {
    vi.stubEnv("RENDER", "true");
    const proxy = "10.0.0.9", clientA = "198.51.100.31", clientB = "198.51.100.32";
    for (let index = 0; index < 40; index++) {
      const unknownPhone = String(11980000000 + index);
      expect((await send("email", unknownPhone, source(proxy, clientA))).resendBlocked).not.toBe(true);
    }
    now += 1_500;
    expect(await send("email", phoneA, source(proxy, clientA))).toMatchObject({
      resendBlocked: true, retryAfterSeconds: 3599, cooldownScope: "all",
    });
    await assertIssued(await send("email", phoneB, source(proxy, clientB)));
    expect(isolated.deliver).toHaveBeenCalledTimes(1);
    expect(isolated.deliver.mock.calls[0][0]).toBe("otp-delivery-two@example.test");
    now = epoch + 3_600_000;
    await assertIssued(await send("email", phoneA, source(proxy, clientA)));
    expect(isolated.deliver).toHaveBeenCalledTimes(2);
  }, 30_000);
});
