import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeJwt, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const state = vi.hoisted(() => ({
  getDb: vi.fn(), isIpBlocked: vi.fn(), verified: vi.fn(), otpMode: vi.fn(),
  findCustomer: vi.fn(), profileState: vi.fn(), completeProfile: vi.fn(), provenance: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: state.getDb, isIpBlocked: state.isIpBlocked }));
vi.mock("./customerOtpAccess", () => ({
  getVerifiedCustomerOtpSession: state.verified, isCustomerOtpModeEnabled: state.otpMode,
}));
vi.mock("./customerAccess", () => ({
  findMainCustomerByIdentity: state.findCustomer,
  normalizeCustomerPhone: (value: unknown) => String(value || "").replace(/\D/g, ""),
  getCustomerRouteRestrictionReason: vi.fn(), getRouteAccess: vi.fn(), getRouteReleaseMode: vi.fn(),
}));
vi.mock("./customerIdentity", () => ({ requireCompleteMainCustomerProfile: state.completeProfile }));
vi.mock("./customerProfileUpdatePolicy", () => ({ getCustomerProfileUpdateState: state.profileState }));

import { registerUnifiedCustomerSessionRoutes } from "./unifiedCustomerSessionRoutes";

const phone = "11999990009";
const now = Date.UTC(2026, 10, 19, 12);
const hour = 60 * 60 * 1000;
const dialect = new MySqlDialect();
const secret = new TextEncoder().encode(process.env.CC_JWT_SECRET || process.env.JWT_SECRET || "cc-cartoes-secret-2024");
type Result = { status: number; body: any; cookie?: { token: string; options: any } };

async function prepareCardSession(): Promise<Result> {
  const handlers = new Map<string, Function>();
  registerUnifiedCustomerSessionRoutes({ post: (path: string, handler: Function) => handlers.set(path, handler) } as any);
  return new Promise(resolve => {
    const result: Result = { status: 200, body: undefined };
    const res: any = {
      headersSent: false,
      status(code: number) { result.status = code; return this; },
      setHeader() { return this; },
      cookie(_name: string, token: string, options: any) { result.cookie = { token, options }; return this; },
      json(body: unknown) { result.body = body; this.headersSent = true; resolve(result); return this; },
    };
    handlers.get("/api/customer-session/cartoes")!({
      headers: { host: "localhost", authorization: `Bearer h2otp_${"a".repeat(64)}` },
      socket: { remoteAddress: "127.0.0.1" },
    }, res);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  state.otpMode.mockReturnValue(true);
  state.provenance.mockResolvedValue([]);
  state.isIpBlocked.mockResolvedValue(false);
  state.findCustomer.mockResolvedValue({ id: 19, phone, name: "Cliente de teste", blocked: 0 });
  state.profileState.mockResolvedValue({ pending: false, effectiveFields: [] });
  state.completeProfile.mockResolvedValue(undefined);
  state.verified.mockResolvedValue({
    customerId: 19, phone, bindingExpires: now + 48 * hour, sessionExpiresAtMs: now + 48 * hour,
  });
  state.getDb.mockResolvedValue({ execute: vi.fn(async query => {
    const text = dialect.sqlToQuery(query).sql;
    if (text.includes("FROM customerPasskeySessions")) return [await state.provenance()];
    if (text.includes("FROM cc_app_users")) return [[{ id: 7, phone, name: "Cliente de teste" }]];
    if (text.includes("FROM customerPasswordSessions")) return [[{ phone, expiresAt: new Date(now + 90 * 24 * hour) }]];
    throw new Error("Unexpected SQL in isolated session bridge test");
  }) });
});
afterEach(() => vi.useRealTimers());

describe("Derived customer login expiry", () => {
  it.each([1, 48, 720, 2160])("limits the new cookie and signed JWT to the %i-hour OTP deadline", async hours => {
    const deadline = now + hours * hour;
    state.verified.mockResolvedValue({ customerId: 19, phone, bindingExpires: deadline, sessionExpiresAtMs: deadline });
    const result = await prepareCardSession();
    expect(result.status).toBe(200);
    expect(result.cookie!.options.maxAge).toBe(hours * hour);
    expect(result.cookie!.options.httpOnly).toBe(true);
    const token = result.cookie!.token;
    const verified = await jwtVerify(token, secret, { currentDate: new Date(deadline - 1) });
    expect(verified.payload.exp).toBe(deadline / 1000);
    await expect(jwtVerify(token, secret, { currentDate: new Date(deadline) })).rejects.toMatchObject({ code: "ERR_JWT_EXPIRED" });
  });

  it("binds only biometric cookies to the opaque central session fingerprint", async () => {
    const otp = await prepareCardSession();
    expect(decodeJwt(otp.cookie!.token).passkeyBinding).toBeUndefined();
    state.provenance.mockResolvedValue([{customerId:19}]);
    const biometric = await prepareCardSession();
    expect(biometric.status).toBe(200);
    const claims = decodeJwt(biometric.cookie!.token);
    expect(claims.passkeyBinding).toBe(createHash("sha256").update("h2otp_"+"a".repeat(64)).digest("hex"));
    expect(claims.passkeyPhone).toBe(phone);
    expect(JSON.stringify(claims)).not.toContain("h2otp_");
  });

  it("does not issue an unbound cookie if the central session is revoked during the provenance lookup", async () => {
    state.provenance.mockImplementationOnce(async () => {state.verified.mockResolvedValue(null);return [];});
    const result = await prepareCardSession();
    expect(result.status).toBe(401);
    expect(result.cookie).toBeUndefined();
  });

  it("uses the remaining lifetime, without restarting 48 hours at the bridge", async () => {
    const deadline = now + 2 * hour;
    state.verified.mockResolvedValue({ customerId: 19, phone, bindingExpires: deadline, sessionExpiresAtMs: deadline });
    const first = await prepareCardSession();
    vi.setSystemTime(now + hour);
    const second = await prepareCardSession();
    expect(first.cookie!.options.maxAge).toBe(2 * hour);
    expect(second.cookie!.options.maxAge).toBe(hour);
    expect(decodeJwt(first.cookie!.token).exp).toBe(decodeJwt(second.cookie!.token).exp);
  });

  it("honors the earlier of the two central session deadlines", async () => {
    state.verified.mockResolvedValue({ customerId: 19, phone, bindingExpires: now + 48 * hour, sessionExpiresAtMs: now + hour });
    const result = await prepareCardSession();
    expect(result.cookie!.options.maxAge).toBe(hour);
  });

  it.each([null, 0, Number.NaN])("does not issue a derived login for missing or invalid central proof (%s)", async value => {
    state.verified.mockResolvedValue(value === null ? null : {
      customerId: 19, phone, bindingExpires: value, sessionExpiresAtMs: now + hour,
    });
    const result = await prepareCardSession();
    expect(result.status).toBe(401);
    expect(result.cookie).toBeUndefined();
  });

  it("rechecks the deadline after the database work before issuing the cookie", async () => {
    state.completeProfile.mockImplementationOnce(async () => { vi.setSystemTime(now + 48 * hour); });
    const result = await prepareCardSession();
    expect(result.status).toBe(401);
    expect(result.cookie).toBeUndefined();
  });

  it("preserves the legacy 30-day cookie without consulting OTP proof", async () => {
    state.otpMode.mockReturnValue(false);
    const result = await prepareCardSession();
    expect(result.status).toBe(200);
    expect(result.cookie!.options.maxAge).toBe(30 * 24 * hour);
    expect(state.verified).not.toHaveBeenCalled();
  });
});
