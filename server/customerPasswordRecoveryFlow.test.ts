import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const { getDbMock, deliveryMock } = vi.hoisted(() => ({ getDbMock: vi.fn(), deliveryMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./siteAccessCodeDelivery", () => ({ deliverOwnSiteCode: deliveryMock }));
vi.mock("./siteAccessOwnCodes", () => ({ generateOwnSiteCode: () => "123456" }));
// Eligibility itself is covered by customerPasswordRecoveryPolicy.test.ts.
vi.mock("./customerProfileRequirements", () => ({ getMissingCustomerProfileFields: () => [] }));
vi.mock("./_core/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.create();
  return { router: t.router, publicProcedure: t.procedure, adminProcedure: t.procedure };
});

import { customerPasswordRouter } from "./routers/customerPassword";

/** Isolated handler tests with an in-memory transactional fake. These verify
 * control flow/rollback, not the locking behavior of a production SQL engine. */
function fixture(phone: string) {
  const customer = { id: 1, phone, email: "client@example.test", blocked: 0, deletedAt: null };
  const password = { id: 1, phone, password: "old-hash", isActive: 1, pendingApproval: 0, expiresAt: new Date(Date.now() + 3_600_000) };
  const events: string[] = [];
  let recovery: any[] = [];
  let sessions = [{ phone: `(11) ${phone.slice(2, 7)}-${phone.slice(7)}`, token: "old" }];
  let legacySessions = [{ clientId: 1 }, { clientId: 2 }];
  let gate = Promise.resolve();
  const dialect = new MySqlDialect();
  const select = () => ({
    from: (table: any) => ({
      where: () => ({
        limit: () => {
          const name = getTableName(table);
          const result = name === "customers" ? [customer] : name === "customerPasswords" ? [password] : name === "appSettings" ? [{ value: "false" }] : [];
          return {
            then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
            for: async (mode: string) => { events.push(`lock:${name}:${mode}`); return result; },
          };
        },
      }),
    }),
  });
  const execute = async (query: any) => {
    const { sql, params } = dialect.sqlToQuery(query);
    if (sql.includes("CREATE TABLE")) return [[]];
    if (sql.includes("SELECT createdAt")) return [recovery.slice(-1)];
    if (sql.includes("INSERT INTO customerPasswordRecovery")) {
      events.push("insert:recovery");
      recovery.push({ id: recovery.length + 1, phone: params[0], codeHash: params[1], expiresAt: params[2], createdAt: new Date(), attempts: 0, usedAt: null });
      return [{ insertId: recovery.length }];
    }
    if (sql.includes("SELECT id,codeHash")) return [recovery.slice(-1)];
    if (sql.includes("attempts=attempts+1")) { recovery[recovery.length - 1].attempts += 1; return [{}]; }
    if (sql.includes("SET usedAt")) { recovery[recovery.length - 1].usedAt = new Date(); return [{}]; }
    if (sql.includes("DELETE FROM customerPasswordSessions")) {
      expect(sql).toContain("REGEXP_REPLACE");
      sessions = sessions.filter(s => s.phone.replace(/\D/g, "") !== params[0]);
      events.push("delete:central");
      return [{}];
    }
    if (sql.includes("DELETE FROM spreadsheetSessions")) {
      expect(sql).toMatch(/clientId IN\s*\(/);
      expect(sql).toContain("REGEXP_REPLACE");
      expect(sql).not.toContain("LIMIT 1");
      legacySessions = [];
      events.push("delete:legacy");
      return [{}];
    }
    throw new Error(`Unexpected SQL in isolated test: ${sql}`);
  };
  const tx = {
    select,
    execute,
    update: (table: any) => ({ set: (value: any) => ({ where: async () => {
      expect(getTableName(table)).toBe("customerPasswords");
      Object.assign(password, value);
      events.push("update:password");
    } }) }),
    insert: (table: any) => ({ values: async (value: any) => {
      events.push(`insert:${getTableName(table)}`);
      if (getTableName(table) === "customerPasswordSessions") sessions.push(value);
    } }),
  };
  const db = {
    select,
    execute,
    transaction: async (callback: (tx: any) => Promise<any>) => {
      const previous = gate;
      let release!: () => void;
      gate = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const oldRecovery = recovery.map(value => ({ ...value }));
      const oldPassword = { ...password };
      const oldSessions = sessions.map(value => ({ ...value }));
      const oldLegacy = legacySessions.map(value => ({ ...value }));
      events.push("transaction:start");
      try {
        const result = await callback(tx);
        events.push("transaction:commit");
        return result;
      } catch (error) {
        recovery = oldRecovery;
        Object.assign(password, oldPassword);
        sessions = oldSessions;
        legacySessions = oldLegacy;
        events.push("transaction:rollback");
        throw error;
      } finally { release(); }
    },
  };
  getDbMock.mockResolvedValue(db);
  const caller = customerPasswordRouter.createCaller({} as any);
  return { caller, phone, events, password, recovery: () => recovery, sessions: () => sessions, legacySessions: () => legacySessions };
}

describe("password recovery handlers — isolated transactional fake", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("JWT_SECRET", "test-only-password-recovery-secret-0123456789");
    deliveryMock.mockResolvedValue(undefined);
  });

  it("rolls back a failed delivery and permits immediate retry", async () => {
    const f = fixture("11999999901");
    deliveryMock.mockRejectedValueOnce(new Error("simulated SMTP failure"));
    await expect(f.caller.requestPasswordRecovery({ phone: f.phone })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(f.events).toContain("transaction:rollback");
    expect(f.recovery()).toHaveLength(0);
    await expect(f.caller.requestPasswordRecovery({ phone: f.phone })).resolves.toMatchObject({ success: true });
    expect(deliveryMock).toHaveBeenCalledTimes(2);
    expect(f.recovery()).toHaveLength(1);
  });

  it("checks cooldown after the customer lock and sends once for simultaneous requests", async () => {
    const f = fixture("11999999902");
    await Promise.all([
      f.caller.requestPasswordRecovery({ phone: f.phone }),
      f.caller.requestPasswordRecovery({ phone: f.phone }),
    ]);
    expect(deliveryMock).toHaveBeenCalledTimes(1);
    expect(f.recovery()).toHaveLength(1);
    expect(f.events.indexOf("lock:customers:update")).toBeLessThan(f.events.indexOf("insert:recovery"));
  });

  it("commits failed attempts without changing a password", async () => {
    const f = fixture("11999999903");
    await f.caller.requestPasswordRecovery({ phone: f.phone });
    const result = await f.caller.finishPasswordRecovery({ phone: f.phone, code: "000000", newPassword: "NewPassword123" });
    expect(result).toMatchObject({ success: false });
    expect(f.recovery()[0].attempts).toBe(1);
    expect(f.password.password).toBe("old-hash");
    expect(f.events).not.toContain("delete:central");
  });

  it("changes credentials once and revokes formatted/legacy sessions without granting access", async () => {
    const f = fixture("11999999904");
    await f.caller.requestPasswordRecovery({ phone: f.phone });
    const originalExpiry = f.password.expiresAt;
    await expect(f.caller.finishPasswordRecovery({ phone: f.phone, code: "123456", newPassword: "NewPassword123" })).resolves.toMatchObject({ success: true });
    expect(f.password.password).not.toBe("old-hash");
    expect(f.password.expiresAt).toBe(originalExpiry);
    expect(f.password.isActive).toBe(1);
    expect(f.sessions()).toHaveLength(0);
    expect(f.legacySessions()).toHaveLength(0);
    expect(f.recovery()[0].usedAt).toBeTruthy();
    await expect(f.caller.finishPasswordRecovery({ phone: f.phone, code: "123456", newPassword: "OtherPassword123" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
