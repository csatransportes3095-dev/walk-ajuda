import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { TrpcContext } from "./_core/context";
import {
  DEFAULT_CUSTOMER_SESSION_HOURS, MIN_CUSTOMER_SESSION_HOURS, MAX_CUSTOMER_SESSION_HOURS,
  CUSTOMER_SESSION_HOUR_MS, parseCustomerSessionHours,
} from "../shared/customerSessionPolicy";

const state = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: state.getDb }));
import { readCustomerSessionPolicy, saveCustomerSessionPolicy } from "./customerSessionPolicy";
import { customerPasswordRouter } from "./routers/customerPassword";

const secret = "isolated-customer-session-policy-secret-never-production-20261119";
const policy = (hours: number) => ({ hours, minHours: 1, maxHours: 2160, appliesTo: "new_logins" });
function context(cookie = ""): TrpcContext {
  return { user: null, req: { headers: { cookie } } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}
const adminCookie = () => "admin_token=" + jwt.sign({ sub: "session-policy-test", role: "admin" }, secret);

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", secret);
  state.getDb.mockReset().mockResolvedValue({ execute: vi.fn().mockResolvedValue([[]]) });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Customer session duration policy", () => {
  it("keeps 30 days as the default with a bounded integer-hour range", () => {
    expect(DEFAULT_CUSTOMER_SESSION_HOURS).toBe(720);
    expect(MIN_CUSTOMER_SESSION_HOURS).toBe(1);
    expect(MAX_CUSTOMER_SESSION_HOURS).toBe(2160);
    expect(CUSTOMER_SESSION_HOUR_MS).toBe(3_600_000);
  });

  it.each([1, 48, 720, 721, 2160, "1", "48", " 48 ", "720", "2160"])("reads an accepted persisted duration: %j", value => {
    expect(parseCustomerSessionHours(value)).toBe(Number(value));
  });

  it.each([undefined, null])("uses the 30-day initial duration for missing configuration: %j", value => {
    expect(parseCustomerSessionHours(value)).toBe(720);
  });

  it.each(["", " ", 0, -1, 1.5, 2161, NaN, Infinity, "1e2", "48.0", "0720", {}, "invalid"])
    ("uses the conservative 24-hour fallback for invalid historical data: %j", value => {
      expect(parseCustomerSessionHours(value)).toBe(24);
    });

  it("reads the injected database on every call without caching an old duration", async () => {
    const execute = vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ value: "48" }]])
      .mockResolvedValueOnce([[{ value: "bad legacy value" }]]);
    const db = { execute };
    expect(await readCustomerSessionPolicy(db)).toEqual(policy(720));
    expect(await readCustomerSessionPolicy(db)).toEqual(policy(48));
    expect(await readCustomerSessionPolicy(db)).toEqual(policy(24));
    expect(execute).toHaveBeenCalledTimes(3);
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("does not turn an unavailable database or failed read into the default policy", async () => {
    await expect(readCustomerSessionPolicy(null)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(readCustomerSessionPolicy({ execute: vi.fn().mockRejectedValue(new Error("synthetic read failure")) }))
      .rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("does not report a save when database persistence fails", async () => {
    await expect(saveCustomerSessionPolicy(null, 48)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(saveCustomerSessionPolicy({ execute: vi.fn().mockRejectedValue(new Error("synthetic write failure")) }, 48))
      .rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});

describe("Administrative session-policy API", () => {
  it.each(["missing", "malformed", "regular-user", "expired"])("rejects reading and saving with a %s administrative cookie", async kind => {
    const cookie = kind === "missing" ? "" : kind === "malformed" ? "admin_token=not-a-jwt"
      : "admin_token=" + jwt.sign({ sub: "session-policy-test", role: kind === "regular-user" ? "user" : "admin" }, secret,
        kind === "expired" ? { expiresIn: -1 } : {});
    const caller = customerPasswordRouter.createCaller(context(cookie));
    await expect(caller.getSessionPolicy()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.updateSessionPolicy({ hours: 48 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("does not trust ctx.user.role as a substitute for the signed admin cookie", async () => {
    const ctx = context(); ctx.user = { role: "admin" } as TrpcContext["user"];
    const caller = customerPasswordRouter.createCaller(ctx);
    await expect(caller.getSessionPolicy()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.updateSessionPolicy({ hours: 48 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("allows a signed administrator to read and save the explicit new-logins policy", async () => {
    const caller = customerPasswordRouter.createCaller(context(adminCookie()));
    expect(await caller.getSessionPolicy()).toEqual(policy(720));
    expect(await caller.updateSessionPolicy({ hours: 48 })).toEqual(policy(48));
    expect(await caller.updateSessionPolicy({ hours: 2160 })).toEqual(policy(2160));
  });

  it.each([0, -1, 1.5, 2161, NaN, Infinity, "48", null])("rejects invalid admin input before accessing the database: %j", async hours => {
    const caller = customerPasswordRouter.createCaller(context(adminCookie()));
    await expect(caller.updateSessionPolicy({ hours } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("propagates unavailable storage through both administrative endpoints", async () => {
    state.getDb.mockResolvedValue(null);
    const caller = customerPasswordRouter.createCaller(context(adminCookie()));
    await expect(caller.getSessionPolicy()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(caller.updateSessionPolicy({ hours: 48 })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
