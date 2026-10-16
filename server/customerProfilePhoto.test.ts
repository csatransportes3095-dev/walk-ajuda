import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { readFileSync } from "node:fs";
import { normalizeProfilePhotoPhone, profilePhotoKeyTimestamp, profilePhotoPrefixes } from "../shared/profilePhotoIdentity";

const m = vi.hoisted(() => ({ getDb: vi.fn(), execute: vi.fn(), transaction: vi.fn(), put: vi.fn(), head: vi.fn(), get: vi.fn(), list: vi.fn(), metadata: vi.fn(), stats: vi.fn() }));
vi.mock("./db", () => ({ getDb: m.getDb }));
vi.mock("./storage", () => ({ storagePut: m.put }));
vi.mock("./r2Storage", () => ({ r2HeadObject: m.head, r2GetObjectBuffer: m.get, r2ListObjectsPage: m.list, buildR2PublicUrl: (key: string) => `https://assets.example.test/${key}` }));
vi.mock("sharp", () => ({ default: () => ({ metadata: m.metadata, stats: m.stats }) }));
import { resolveProfilePhotoCustomer, persistCustomerProfilePhoto, listRecoverableProfilePhotos, restoreCustomerProfilePhoto } from "./customerProfilePhoto";

const customer = { id: 101, phone: "11999990000", profilePhotoUrl: "https://legacy.example.test/old.jpg", deletedAt: null };
const key = "profile-photos/11999990000-1792100000000.jpg";
const newUrl = "https://assets.example.test/new.jpg";
const sqlQuery = (index: number) => new MySqlDialect().sqlToQuery(m.execute.mock.calls[index][0]);
const db = { execute: m.execute, transaction: m.transaction };
function target() { m.execute.mockResolvedValueOnce([[customer]]).mockResolvedValueOnce([[customer]]); }
beforeEach(() => {
  vi.resetAllMocks();
  m.getDb.mockResolvedValue(db);
  m.transaction.mockImplementation(callback => callback(db));
  m.put.mockResolvedValue({ url: newUrl });
  m.head.mockResolvedValue({ contentLength: 4 });
  m.get.mockResolvedValue(Buffer.from([255, 216, 255, 1]));
  m.metadata.mockResolvedValue({ width: 10, height: 10, format: "jpeg" });
  m.stats.mockResolvedValue({});
  m.list.mockResolvedValue({ objects: [], nextContinuationToken: null });
});

describe("profile photo identity", () => {
  it("normalizes formatting and country code, not suffixes", () => {
    expect(normalizeProfilePhotoPhone("+55 (11) 99999-0000")).toBe(customer.phone);
    expect(normalizeProfilePhotoPhone("999990000")).toBe("");
    expect(normalizeProfilePhotoPhone("1234511999990000")).toBe("");
  });
  it("rejects other customers, nested paths and arbitrary URL keys", () => {
    expect(profilePhotoKeyTimestamp(key, customer.phone)).toBe(1792100000000);
    for (const other of [key.replace("11999990000", "21999990000"), "other/" + key, "https://example.test/" + key, key.replace("11999990000", "../11999990000")]) {
      expect(profilePhotoKeyTimestamp(other, customer.phone)).toBeNull();
    }
  });
  it("supports old country-code keys and new unique upload keys", () => {
    expect(profilePhotoKeyTimestamp(key.replace("11999990000", "5511999990000"), customer.phone)).not.toBeNull();
    expect(profilePhotoKeyTimestamp(key.replace(".jpg", "-12345678-1234-1234-1234-123456789abc.webp"), customer.phone)).not.toBeNull();
    expect(profilePhotoPrefixes(customer.phone)).toEqual(["profile-photos/11999990000-", "profile-photos/5511999990000-"]);
  });
  it("selects active customers using complete normalized aliases", async () => {
    m.execute.mockResolvedValue([[customer]]);
    const resolved = await resolveProfilePhotoCustomer("+55 (11) 99999-0000", true);
    expect(resolved.customer?.id).toBe(101);
    expect(sqlQuery(0).sql).toContain("deletedAt IS NULL");
    expect(sqlQuery(0).sql).toContain("LIMIT 2");
    expect(sqlQuery(0).params).toEqual([customer.phone, "5511999990000"]);
    expect(sqlQuery(0).sql).not.toContain("RIGHT(");
  });
  it("rejects active duplicates instead of choosing the first", async () => {
    m.execute.mockResolvedValue([[customer, { ...customer, id: 102 }]]);
    await expect(resolveProfilePhotoCustomer(customer.phone, true)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("preserves pre-registration upload but not false admin success", async () => {
    m.execute.mockResolvedValue([[]]);
    await expect(resolveProfilePhotoCustomer(customer.phone)).resolves.toMatchObject({ customer: null });
    await expect(resolveProfilePhotoCustomer(customer.phone, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("does not silently succeed when the database is unavailable", async () => {
    m.getDb.mockResolvedValue(null);
    await expect(resolveProfilePhotoCustomer(customer.phone)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});

describe("verified photo persistence", () => {
  it("updates only photo/timestamp and checks exact URL before success", async () => {
    m.execute.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ id: 101, profilePhotoUrl: newUrl }]]);
    await expect(persistCustomerProfilePhoto(customer, newUrl)).resolves.toEqual({ saved: true, customerId: 101 });
    const q = sqlQuery(0);
    expect(q.sql).toContain("deletedAt IS NULL");
    expect(q.sql).toContain("profilePhotoUrl <=>");
    expect(q.params).toContain(customer.profilePhotoUrl);
    expect(q.sql.split("WHERE")[0]).not.toMatch(/name=|phone=|cpf=/);
    expect(m.transaction).toHaveBeenCalledOnce();
  });
  it("rejects a stale upload, deleted customer or concurrent phone change", async () => {
    m.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(persistCustomerProfilePhoto(customer, newUrl)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(m.execute).toHaveBeenCalledTimes(1);
  });
  it("does not acknowledge an unconfirmed readback", async () => {
    m.execute.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[customer]]);
    await expect(persistCustomerProfilePhoto(customer, newUrl)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("explicit stored-photo recovery", () => {
  it("listing is read-only, filters ownership and follows pagination", async () => {
    target();
    m.list.mockResolvedValueOnce({ objects: [{ key, size: 400 }], nextContinuationToken: "page2" })
      .mockResolvedValueOnce({ objects: [{ key: key.replace("11999990000", "21999990000"), size: 400 }], nextContinuationToken: null });
    const result = await listRecoverableProfilePhotos(101);
    expect(result.candidates.map(p => p.key)).toEqual([key]);
    expect(m.list.mock.calls[1][1]).toBe("page2");
    expect(m.execute).toHaveBeenCalledTimes(2);
    expect(m.put).not.toHaveBeenCalled();
  });
  it("reports pagination limits instead of claiming a complete scan", async () => {
    target();
    m.list.mockImplementation(async (_prefix, token) => ({ objects: [], nextContinuationToken: token ? `${token}a` : "a" }));
    expect((await listRecoverableProfilePhotos(101)).truncated).toBe(true);
    expect(m.list).toHaveBeenCalledTimes(8);
  });
  it("never substitutes a URL when no stored photo exists", async () => {
    target();
    expect((await listRecoverableProfilePhotos(101)).candidates).toEqual([]);
    expect(m.put).not.toHaveBeenCalled();
  });
  it("rejects a changed current photo before reading storage", async () => {
    target();
    await expect(restoreCustomerProfilePhoto({ customerId: 101, key, expectedPhotoUrl: "other" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(m.head).not.toHaveBeenCalled();
  });
  it("rejects another phone's image", async () => {
    target();
    await expect(restoreCustomerProfilePhoto({ customerId: 101, key: key.replace("11999990000", "21999990000"), expectedPhotoUrl: customer.profilePhotoUrl })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.head).not.toHaveBeenCalled();
  });
  it("rejects missing/corrupt media and leaves current photo untouched", async () => {
    target(); m.stats.mockRejectedValue(new Error("corrupt"));
    await expect(restoreCustomerProfilePhoto({ customerId: 101, key, expectedPhotoUrl: customer.profilePhotoUrl })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.put).not.toHaveBeenCalled(); expect(m.execute).toHaveBeenCalledTimes(2);
  });
  it("bounds image size before download", async () => {
    target(); m.head.mockResolvedValue({ contentLength: 6 * 1024 * 1024 });
    await expect(restoreCustomerProfilePhoto({ customerId: 101, key, expectedPhotoUrl: customer.profilePhotoUrl })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.get).not.toHaveBeenCalled();
  });
  it("restores an explicitly selected photo under a fresh owned key", async () => {
    target();
    m.execute.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ id: 101, profilePhotoUrl: newUrl }]]);
    await expect(restoreCustomerProfilePhoto({ customerId: 101, key, expectedPhotoUrl: customer.profilePhotoUrl })).resolves.toEqual({ success: true, saved: true, customerId: 101, url: newUrl });
    expect(m.stats).toHaveBeenCalledOnce();
    expect(profilePhotoKeyTimestamp(m.put.mock.calls[0][0], customer.phone)).not.toBeNull();
    expect(m.put.mock.calls[0][2]).toBe("image/jpeg");
  });
});

it("wires both admin upload paths, retries only failed URLs and keeps recovery admin-only", () => {
  const customers = readFileSync('client/src/pages/AdminCustomers.tsx', 'utf8');
  const orders = readFileSync('client/src/pages/AdminOrders.tsx', 'utf8');
  const routes = readFileSync('server/routers.ts', 'utf8');
  expect(customers).toContain('failedProfilePhotoIds.get(c.id) !== c.profilePhotoUrl');
  expect(customers).toContain('setEditProfilePhotoUrl(url)');
  for (const file of [customers, orders]) { expect(file).toContain('requireExisting: true'); expect(file).toContain('if (!data.saved || !data.customerId)'); }
  expect(routes).toContain('getProfilePhotoRecoveryCandidates: adminProcedure');
  expect(routes).toContain('restoreProfilePhoto: adminProcedure');
  expect(routes).toContain('return { success: true, url, ...photoPersistence }');
  const recovery = readFileSync('client/src/components/ProfilePhotoRecovery.tsx', 'utf8');
  expect(recovery).toContain('Confirmar: usar esta foto');
  expect(recovery).toContain('!loaded.has(selected)');
});
