import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { createHmac, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
vi.mock("./db", () => ({ getDb: vi.fn(), addOrderStatus: vi.fn(), generateOrderNumber: vi.fn() }));
import { getDb } from "./db";
import { ensureValidraAttemptStorage } from "./validraAttemptStorage";
import { persistPaidValidraOrder } from "./validraOrderPersistence";
import { runValidraCheckout, validraPurchaseDigest } from "./validraCheckout";
import { ValidraPayClient, type ValidraCharge } from "./validraPay";
import { registerValidraWebhook } from "./validraWebhook";

// A real disposable MySQL service in CI, never DATABASE_URL or production.
// All payment provider calls are in-process fake responses.
const dbUrl = process.env.VALIDRA_TEST_DATABASE_URL;
const key = "vpk_live_" + "A".repeat(26) + "_" + "B".repeat(52);
const phone = "11999990000";
const fixtureSchema = [
  "CREATE TABLE IF NOT EXISTS financialSales (id INT AUTO_INCREMENT PRIMARY KEY,registrationId INT,customerName VARCHAR(256) NOT NULL DEFAULT '',customerPhone VARCHAR(32) NOT NULL DEFAULT '',productName VARCHAR(256) NOT NULL DEFAULT '',productOption VARCHAR(256) NOT NULL DEFAULT '',saleValue INT NOT NULL DEFAULT 0,costValue INT NOT NULL DEFAULT 0,paymentMethod VARCHAR(64) NOT NULL DEFAULT 'pix',status VARCHAR(32) NOT NULL DEFAULT 'pendente',saleDate BIGINT NOT NULL,receivedDate BIGINT,notes TEXT,createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,CHECK(productName <> 'FAIL_FINANCE')) ENGINE=InnoDB",
  "CREATE TABLE IF NOT EXISTS customers (id INT PRIMARY KEY, phone VARCHAR(32) NOT NULL, blocked INT NOT NULL DEFAULT 0, deletedAt TIMESTAMP NULL) ENGINE=InnoDB",
  "CREATE TABLE IF NOT EXISTS accessCodes (id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(64) NOT NULL UNIQUE, type ENUM('general','vip') NOT NULL DEFAULT 'vip', status ENUM('active','used','disabled') NOT NULL DEFAULT 'active', clientName TEXT, usedAt TIMESTAMP NULL, usedBy TEXT, accessedByPhone VARCHAR(32), maxUses INT DEFAULT 1, currentUses INT DEFAULT 0, expiresAt TIMESTAMP NULL, timeOnly INT NOT NULL DEFAULT 0, allowedProductIds TEXT, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
  "CREATE TABLE IF NOT EXISTS accessCodePhones (id INT AUTO_INCREMENT PRIMARY KEY, codeId INT NOT NULL, phone VARCHAR(32) NOT NULL, consumed INT DEFAULT 0, archived INT NOT NULL DEFAULT 0, rgCnhApproved INT NOT NULL DEFAULT 0, orderSource VARCHAR(16) NOT NULL DEFAULT 'auto', accessedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, refCode VARCHAR(64), refExpiresAt BIGINT, refOwnerName VARCHAR(128), deletedAt TIMESTAMP NULL, deletedReason VARCHAR(256), thirdPartyName VARCHAR(128), thirdPartyPhone VARCHAR(32), resellerDiscountApplied DECIMAL(10,2), cartGroupId VARCHAR(64), cartTotal DECIMAL(10,2), cartCouponCode VARCHAR(64), cartCouponDiscount DECIMAL(10,2), cartItemIndex INT DEFAULT 0) ENGINE=InnoDB",
  "CREATE TABLE IF NOT EXISTS orderCounter (id INT AUTO_INCREMENT PRIMARY KEY, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
  "CREATE TABLE IF NOT EXISTS orderStatusHistory (id INT AUTO_INCREMENT PRIMARY KEY, registrationId INT NOT NULL, orderNumber INT, customerPhone VARCHAR(32) NOT NULL, status VARCHAR(64) NOT NULL, note TEXT, serviceName VARCHAR(256), serviceOption VARCHAR(256), pricePaid VARCHAR(64), answers TEXT, isUrgent INT NOT NULL DEFAULT 0, commissionPaid INT NOT NULL DEFAULT 0, referralInvalid INT NOT NULL DEFAULT 0, referralInvalidReason VARCHAR(512), referralInvalidAt TIMESTAMP NULL, deliveryEstimate BIGINT, approval VARCHAR(16) NOT NULL DEFAULT 'approved', createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, deliveredNotifiedAt TIMESTAMP NULL, CHECK (serviceName <> 'FAIL_TEST_ORDER')) ENGINE=InnoDB",
  "CREATE TABLE IF NOT EXISTS orderStatusTypes (id INT AUTO_INCREMENT PRIMARY KEY, `key` VARCHAR(64) NOT NULL UNIQUE, isActive INT NOT NULL DEFAULT 1, isGlobal INT NOT NULL DEFAULT 1, sortOrder INT NOT NULL DEFAULT 0) ENGINE=InnoDB",
  "CREATE TABLE IF NOT EXISTS productStatusFlows (id INT AUTO_INCREMENT PRIMARY KEY, productId INT NOT NULL UNIQUE, flowId INT NOT NULL) ENGINE=InnoDB",
  "CREATE TABLE IF NOT EXISTS orderStatusFlows (id INT AUTO_INCREMENT PRIMARY KEY, isActive INT NOT NULL DEFAULT 1) ENGINE=InnoDB",
  "CREATE TABLE IF NOT EXISTS orderStatusFlowItems (id INT AUTO_INCREMENT PRIMARY KEY, flowId INT NOT NULL, statusKey VARCHAR(64) NOT NULL, sortOrder INT NOT NULL DEFAULT 0) ENGINE=InnoDB"
];

function makeFixture(serviceName = "Produto de teste") {
  const externalId = randomUUID();
  const order = { effectivePhone: phone, productId: 1, clientName: "Cliente teste", serviceName, serviceOption: "Opcao teste", answers: "[]" };
  const input = { externalId, customerId: 21, purchaseDigest: validraPurchaseDigest(order), amountCents: 4990, order };
  let charge: ValidraCharge = {
    id: "chg_" + externalId.replace(/-/g, ""), external_id: externalId, status: "active",
    amount: "49.90", payment: null, amount_refunded: "0.00", pix_copy_paste: "fake-ci-pix",
    qr_code_png_base64: null, expires_at: "2026-11-28T16:30:00Z", updated_at: "2026-11-28T16:00:00Z"
  };
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    if (init?.method === "POST") {
      expect(url).toBe("https://app.validrapay.com/v1/charges");
      expect(init.headers).toMatchObject({ "Idempotency-Key": "chg-" + externalId });
      expect(JSON.parse(String(init.body))).toMatchObject({ external_id: externalId, amount: "49.90" });
    } else expect(url).toBe("https://app.validrapay.com/v1/charges/" + charge.id);
    return new Response(JSON.stringify(charge), { status: init?.method === "POST" ? 201 : 200 });
  });
  return {
    input, transport, client: new ValidraPayClient(key, transport),
    paid: (change: Partial<ValidraCharge> = {}) => {
      charge = { ...charge, status: "paid", payment: { end_to_end_id: "E-test", amount: "49.90", paid_at: "2026-11-28T16:10:00Z" }, ...change };
      return charge;
    },
  };
}

describe.skipIf(!dbUrl)("ValidraPay real MySQL integration (simulated provider)", () => {
  let pool: Pool;
  async function count(table: "orderStatusHistory" | "accessCodePhones" | "orderCounter" | "validra_webhook_events" | "financialSales") {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM " + table);
    return Number(rows[0].total);
  }
  async function releaseTestPoll(externalId: string) {
    await pool.execute("UPDATE validra_checkout_attempts SET last_query_at = NULL WHERE external_id = ?", [externalId]);
  }
  beforeAll(async () => {
    const url = new URL(dbUrl!);
    if (url.protocol !== "mysql:" || url.hostname !== "127.0.0.1" || url.pathname !== "/validra_ci" || url.username !== "validra_ci") throw new Error("Only the isolated local validra_ci database is allowed");
    pool = createPool(dbUrl!);
    vi.mocked(getDb).mockResolvedValue(drizzle(pool));
    for (const ddl of fixtureSchema) await pool.query(ddl);
    await ensureValidraAttemptStorage();
  }, 30000);
  beforeEach(async () => {
    for (const table of ["financialSales","validra_checkout_attempts", "orderStatusHistory", "accessCodePhones", "accessCodes", "orderCounter", "customers", "orderStatusTypes"]) await pool.query("DELETE FROM " + table);
    await pool.execute("INSERT INTO customers (id, phone) VALUES (21, ?)", [phone]);
    await pool.execute("INSERT INTO orderStatusTypes (`key`) VALUES ('pedido_recebido')");
  });
  afterAll(async () => { if (pool) await pool.end(); });

  it("creates an unpaid Pix, confirms paid, and returns one order after repeated requests", async () => {
    const f = makeFixture();
    expect(await runValidraCheckout(f.input, true, f.client)).toMatchObject({ kind: "payment", payment: { amount: "49.90", pixCopyPaste: "fake-ci-pix" } });
    expect(await count("orderStatusHistory")).toBe(0);
    expect(await count("financialSales")).toBe(0);
    await expect(runValidraCheckout(f.input, true, f.client)).rejects.toThrow("validra_wait_before_retry");
    expect(f.transport).toHaveBeenCalledTimes(1);
    f.paid();
    await releaseTestPoll(f.input.externalId);
    const paid = await runValidraCheckout(f.input, false, f.client);
    expect(paid).toMatchObject({ kind: "persisted", order: { initialStatus: "pedido_recebido" } });
    if (paid.kind !== "persisted") throw new Error("order missing");
    expect(await runValidraCheckout(f.input, false, f.client)).toEqual({ kind: "duplicate", registrationId: paid.order.registrationId });
    expect(await count("orderStatusHistory")).toBe(1);
    expect(await count("accessCodePhones")).toBe(1);
    expect(f.transport).toHaveBeenCalledTimes(2);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT pricePaid, registrationId FROM orderStatusHistory");
    expect(rows[0]).toMatchObject({ pricePaid: "R$ 49,90", registrationId: paid.order.registrationId });
    const [sales]=await pool.query<RowDataPacket[]>("SELECT registrationId,saleValue,status,paymentMethod,receivedDate FROM financialSales");
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({registrationId:paid.order.registrationId,saleValue:4990,status:"pago",paymentMethod:"pix",receivedDate:Date.parse("2026-11-28T16:10:00Z")});
  });

  it("serializes two simultaneous confirmations of the same charge", async () => {
    const f = makeFixture();
    await runValidraCheckout(f.input, true, f.client);
    const paid = f.paid();
    const results = await Promise.all([persistPaidValidraOrder(f.input, f.client, paid), persistPaidValidraOrder(f.input, f.client, paid)]);
    expect(results.filter(r => !r.duplicate)).toHaveLength(1);
    expect(results.filter(r => r.duplicate)).toHaveLength(1);
    expect(new Set(results.map(r => r.registrationId)).size).toBe(1);
    expect(await count("orderStatusHistory")).toBe(1);
    expect(await count("accessCodePhones")).toBe(1);
  });

  it("rolls back the paid order if the existing financial sale cannot be written",async()=>{
    const f=makeFixture("FAIL_FINANCE");
    await runValidraCheckout(f.input,true,f.client);
    await expect(persistPaidValidraOrder(f.input,f.client,f.paid())).rejects.toThrow();
    for(const table of ["orderStatusHistory","accessCodePhones","financialSales","orderCounter"] as const)expect(await count(table)).toBe(0);
    const [rows]=await pool.execute<RowDataPacket[]>("SELECT state,registration_id FROM validra_checkout_attempts WHERE external_id=?",[f.input.externalId]);
    expect(rows[0]).toMatchObject({state:"pending",registration_id:null});
  });

  it("rejects changed customer, purchase or price, and a disabled new attempt", async () => {
    const f = makeFixture();
    await expect(runValidraCheckout(f.input, false, f.client)).rejects.toThrow("validra_new_attempts_disabled");
    expect(f.transport).not.toHaveBeenCalled();
    await runValidraCheckout(f.input, true, f.client);
    for (const changed of [{ customerId: 22 }, { purchaseDigest: "b".repeat(64) }, { amountCents: 51 }]) {
      await expect(runValidraCheckout({ ...f.input, ...changed }, true, f.client)).rejects.toThrow("validra_attempt_conflict");
    }
    expect(await count("orderStatusHistory")).toBe(0);
    expect(f.transport).toHaveBeenCalledTimes(1);
  });

  it("does not create an order for the wrong amount or late/refunded payments", async () => {
    for (const changed of [{ amount_refunded: "1.00" }, { paid_after_expiration: true }, { paid_after_cancellation: true }, { payment: { end_to_end_id: "E-test", amount: "0.51", paid_at: "2026-11-28T16:10:00Z" } }]) {
      const f = makeFixture();
      await runValidraCheckout(f.input, true, f.client);
      f.paid(changed);
      await releaseTestPoll(f.input.externalId);
      await expect(runValidraCheckout(f.input, true, f.client)).rejects.toThrow("validra_payment_needs_review");
    }
    expect(await count("orderStatusHistory")).toBe(0);
  });

  it("rolls back registration and consumption when status insertion fails", async () => {
    const f = makeFixture("FAIL_TEST_ORDER");
    await runValidraCheckout(f.input, true, f.client);
    const paid = f.paid();
    await expect(persistPaidValidraOrder(f.input, f.client, paid)).rejects.toThrow();
    expect(await count("orderStatusHistory")).toBe(0);
    expect(await count("accessCodePhones")).toBe(0);
    expect(await count("orderCounter")).toBe(0);
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT registration_id, state FROM validra_checkout_attempts WHERE external_id = ?", [f.input.externalId]);
    expect(rows[0]).toMatchObject({ registration_id: null, state: "pending" });
  });

  it("accepts a signed HTTP webhook only once and rejects tampered bytes", async () => {
    const secret = "local-ci-webhook-test-only";
    vi.stubEnv("VALIDRA_WEBHOOK_SECRET", secret);
    vi.stubEnv("VALIDRA_WEBHOOK_PREVIOUS_SECRET", "");
    const app = express();
    registerValidraWebhook(app);
    app.use(express.json());
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const target = "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/webhooks/validrapay";
      const raw = JSON.stringify({ id: "evt_" + "A".repeat(26), type: "ping", api_version: "v1", environment: "production", created_at: "2026-11-28T16:00:00Z", data: {} });
      const t = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", secret).update(t + "." + raw).digest("hex");
      const send = (body: string) => fetch(target, { method: "POST", headers: { "Content-Type": "application/json", "Validra-Signature": "t=" + t + ",v1=" + sig }, body });
      expect((await send(raw + " ")).status).toBe(401);
      expect((await send(raw)).status).toBe(204);
      expect((await send(raw)).status).toBe(204);
      expect(await count("validra_webhook_events")).toBe(1);
      expect(await count("orderStatusHistory")).toBe(0);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    }
  });
});
