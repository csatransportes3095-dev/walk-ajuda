import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { request as httpRequest, type Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { siteAccessEntries, siteAccessChallenges, siteAccessRateLimits } from "./siteAccessSchema";

// No real database, provider, credentials, recipients or customer records are used.
const mocks = vi.hoisted(() => ({ db: null as any, smtp: vi.fn(), transport: vi.fn(), fetch: vi.fn(), legacy: vi.fn() }));
vi.mock("./db", () => ({ getDb: async () => mocks.db }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.transport }, createTransport: mocks.transport }));
vi.mock("./_core/mailer", () => ({ sendMail: mocks.legacy }));

const EMAIL = "client@example.test";
const SECRET = "isolated-site-access-test-secret-not-production-64-characters";
const CODE = "654321";
const dialect = new MySqlDialect();
let server: Server;
let port: number;
let state: {
  person: any;
  people: any[] | null;
  challenge: any;
  rateHits: number[];
  failSave: boolean;
  failConsume: boolean;
};

function makeDb() {
  return {
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: (condition: any) => ({
          limit: async () => {
            const email = dialect.sqlToQuery(condition).params[0];
            if (table === siteAccessRateLimits) return [{ hits: state.rateHits.shift() ?? 1 }];
            if (table === siteAccessEntries) {
              const person = state.people ? state.people.shift() : state.person;
              return person && person.email === email ? [{ ...person }] : [];
            }
            if (table === siteAccessChallenges) return state.challenge?.email === email ? [{ ...state.challenge }] : [];
            throw new Error("Unexpected table in isolated test");
          },
        }),
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: (values: any) => ({
        onDuplicateKeyUpdate: async () => {
          if (table !== siteAccessChallenges || state.failSave) throw new Error("Test-only database failure");
          state.challenge = { ...values };
        },
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: () => ({
        where: async () => {
          if (table !== siteAccessChallenges) throw new Error("Unexpected update");
          if (state.challenge) state.challenge.attempts++;
        },
      }),
    })),
    execute: vi.fn(async (statement: any) => {
      const query = dialect.sqlToQuery(statement);
      if (/^\s*INSERT INTO siteAccessRateLimits/.test(query.sql)) return [{ affectedRows: 1 }];
      if (/^\s*DELETE FROM siteAccessChallenges/.test(query.sql)) {
        expect(query.sql).toMatch(/codeHash = \?/);
        expect(query.sql).toContain("attempts < 5");
        expect(query.sql).toContain("expiresAt >");
        const record = state.challenge;
        const eligible = record && record.email === query.params[0] && record.codeHash === query.params[1]
          && record.attempts < 5 && record.expiresAt.getTime() > Date.now() && !state.failConsume;
        if (eligible) state.challenge = null;
        return [{ affectedRows: eligible ? 1 : 0 }];
      }
      throw new Error("Unexpected SQL in isolated test");
    }),
  };
}

function challenge(overrides: Record<string, unknown> = {}) {
  return {
    email: EMAIL,
    codeHash: createHmac("sha256", SECRET).update("otp:" + EMAIL + ":" + CODE).digest("hex"),
    attempts: 0,
    requestedAt: new Date(),
    expiresAt: new Date(Date.now() + 600_000),
    ...overrides,
  };
}

type HttpResult = { status: number; body: any; headers: import("node:http").IncomingHttpHeaders };
function call(path: string, body: unknown = {}, headers: Record<string, string> = {}, method = "POST"): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, path, method,
      headers: { host: "h2colombiano.com", origin: "https://h2colombiano.com", "content-type": "application/json", ...headers } }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()), headers: res.headers }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end(method === "GET" ? undefined : JSON.stringify(body));
  });
}
const send = (email: unknown = EMAIL, headers: Record<string, string> = {}) => call("/api/site-access/request", { email }, headers);
const verify = (code: unknown = CODE, headers: Record<string, string> = {}) => call("/api/site-access/verify", { email: EMAIL, code }, headers);

beforeAll(async () => {
  vi.stubEnv("RESEND_API_KEY", "unit-test-not-a-real-api-key");
  vi.stubEnv("SMTP_FROM", "test-sender@example.test");
  vi.stubEnv("SMTP_USER", "test-sender@example.test");
  vi.stubEnv("SMTP_PASS", "test-only-not-a-real-password");
  vi.stubEnv("SMTP_HOST", "smtp.example.test");
  vi.stubEnv("SMTP_PORT", "465");
  vi.stubEnv("SMTP_SECURE", "true");
  vi.stubEnv("H2_SITE_ACCESS_SECRET", SECRET);
  vi.stubEnv("NODE_ENV", "production");
  const { registerSiteIdentity } = await import("./siteAccessIdentity");
  const app = express();
  app.use(express.json());
  registerSiteIdentity(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  port = (server.address() as import("node:net").AddressInfo).port;
});

beforeEach(() => {
  state = {
    person: { id: 7, email: EMAIL, status: "active", expiresAt: null, sessionVersion: 1 },
    people: null, challenge: null, rateHits: [], failSave: false, failConsume: false,
  };
  mocks.db = makeDb();
  mocks.legacy.mockReset();
  mocks.smtp.mockReset().mockResolvedValue({ messageId: "isolated-test", accepted: [EMAIL] });
  mocks.transport.mockReset().mockReturnValue({ sendMail: mocks.smtp });
  mocks.fetch.mockReset().mockResolvedValue({ ok: false, status: 429,
    text: async () => JSON.stringify({ name: "monthly_quota_exceeded", message: "You have reached your monthly email sending quota." }) });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  vi.unstubAllEnvs();
});

describe("site access email delivery using the real request route and direct sender", () => {
  it("falls back from Resend monthly quota 429 to SMTP and returns 200 only after acceptance", async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.transport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.example.test", port: 465, secure: true }));
    expect(mocks.smtp).toHaveBeenCalledTimes(1);
    expect(mocks.legacy).not.toHaveBeenCalled();
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it("normalizes surrounding spaces and upper-case email before sending", async () => {
    expect((await send("  CLIENT@EXAMPLE.TEST  ")).status).toBe(200);
    expect(mocks.smtp).toHaveBeenCalledWith(expect.objectContaining({ to: EMAIL }));
    expect(state.challenge.email).toBe(EMAIL);
  });
  it("keeps OTP out of the HTTP response and stores only a keyed hash with the original 10 minute expiry", async () => {
    const response = await send();
    const message = mocks.smtp.mock.calls[0][0];
    const code = message.text.match(/\b\d{6}\b/)[0];
    expect(message.html).toContain(code);
    expect(message.subject).not.toContain(code);
    expect(JSON.stringify(response.body)).not.toContain(code);
    expect(state.challenge.codeHash).toBe(createHmac("sha256", SECRET).update("otp:" + EMAIL + ":" + code).digest("hex"));
    expect(state.challenge).not.toHaveProperty("code");
    expect(state.challenge.attempts).toBe(0);
    expect(state.challenge.expiresAt.getTime() - state.challenge.requestedAt.getTime()).toBe(600_000);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["cdn-cache-control"]).toBe("no-store");
  });
  it("uses Resend without duplicate SMTP when Resend accepts", async () => {
    mocks.fetch.mockResolvedValue({ ok: true });
    expect((await send()).status).toBe(200);
    expect(mocks.smtp).not.toHaveBeenCalled();
    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(payload.to).toEqual([EMAIL]);
    expect(payload.html).toContain("site H2 Colombiano");
    expect(payload.text).toContain("10 minutos");
  });
  it("falls back on a provider network error", async () => {
    mocks.fetch.mockRejectedValue(new Error("Isolated provider network failure"));
    expect((await send()).status).toBe(200);
    expect(mocks.smtp).toHaveBeenCalledTimes(1);
  });
  it("returns safe 503 and never authorizes when both delivery channels fail", async () => {
    mocks.smtp.mockRejectedValue(new Error("isolated failure containing sensitive-provider-details"));
    const response = await send();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Serviço temporariamente indisponível." });
    expect(JSON.stringify(response.body)).not.toContain("sensitive-provider-details");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it("does not send a code when the database cannot save its hash", async () => {
    state.failSave = true;
    expect((await send()).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.smtp).not.toHaveBeenCalled();
  });
  it("fails closed if the database is unavailable", async () => {
    mocks.db = null;
    expect((await send()).status).toBe(503);
    expect(mocks.smtp).not.toHaveBeenCalled();
  });
  it.each(["", "invalid", "a@", "client@example.test\nBCC:other@example.test", null, {}])("rejects malformed email without delivery: %j", async email => {
    const response = await send(email);
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(state.challenge).toBeNull();
  });
  it.each(["unknown", "suspended", "expired"])("does not send or enumerate an %s authorization", async scenario => {
    if (scenario === "unknown") state.person = null;
    if (scenario === "suspended") state.person.status = "suspended";
    if (scenario === "expired") state.person.expiresAt = new Date(Date.now() - 1000);
    const response = await send();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, message: "Se o e-mail estiver autorizado, você receberá um código." });
    expect(mocks.smtp).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([[16, 1], [1, 4]])("preserves request limits (IP/email hits %j/%j)", async (ipHits, emailHits) => {
    state.rateHits = [ipHits, emailHits];
    expect((await send()).status).toBe(200);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.smtp).not.toHaveBeenCalled();
  });
  it.each(["https://other.example.test", "http://h2colombiano.com", ""])("rejects invalid origin %s", async origin => {
    expect((await send(EMAIL, { origin })).status).toBe(403);
    expect(mocks.db.execute).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("unchanged OTP verification, one-use sessions and revocation", () => {
  it("verifies a code sent through SMTP, consumes it once and sets only the site cookie", async () => {
    await send();
    const code = mocks.smtp.mock.calls[0][0].text.match(/\b\d{6}\b/)[0];
    const response = await verify(code);
    expect(response.status).toBe(200);
    const cookie = response.headers["set-cookie"]![0];
    expect(cookie).toMatch(/^h2_site_auth=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=43200");
    const payload = jwt.verify(cookie.split(";")[0].split("=")[1], SECRET) as jwt.JwtPayload;
    expect(payload).toMatchObject({ sub: EMAIL, kind: "site", v: 1 });
    expect(payload).not.toHaveProperty("role");
    expect((await verify(code)).status).toBe(401);
    expect(state.challenge).toBeNull();
  });
  it("increments wrong attempts without granting a cookie", async () => {
    state.challenge = challenge();
    const response = await verify("000000");
    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(state.challenge.attempts).toBe(1);
  });
  it.each(["expired", "max-attempts", "missing", "concurrent-consume"])("blocks %s challenge", async scenario => {
    state.challenge = challenge();
    if (scenario === "expired") state.challenge.expiresAt = new Date(Date.now() - 1000);
    if (scenario === "max-attempts") state.challenge.attempts = 5;
    if (scenario === "missing") state.challenge = null;
    if (scenario === "concurrent-consume") state.failConsume = true;
    const response = await verify();
    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it.each(["suspended", "expired", "removed"])("blocks a correct code for a %s person", async scenario => {
    state.challenge = challenge();
    if (scenario === "suspended") state.person.status = "suspended";
    if (scenario === "expired") state.person.expiresAt = new Date(Date.now() - 1000);
    if (scenario === "removed") state.person = null;
    expect((await verify()).status).toBe(401);
  });
  it("rechecks authorization after code consumption", async () => {
    state.challenge = challenge();
    state.people = [{ ...state.person }, { ...state.person, status: "suspended" }];
    const response = await verify();
    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it("rejects a sessionVersion change during verification", async () => {
    state.challenge = challenge();
    state.people = [{ ...state.person }, { ...state.person, sessionVersion: 2 }];
    expect((await verify()).status).toBe(401);
  });
  it.each([[26, 1], [1, 11]])("preserves verification limits (IP/email hits %j/%j)", async (ipHits, emailHits) => {
    state.challenge = challenge();
    state.rateHits = [ipHits, emailHits];
    expect((await verify()).status).toBe(429);
    expect(state.challenge).not.toBeNull();
  });
  it("rejects verification from a different origin", async () => {
    state.challenge = challenge();
    expect((await verify(CODE, { origin: "https://other.example.test" })).status).toBe(403);
    expect(state.challenge).not.toBeNull();
  });
  it("keeps the visitor session unavailable after suspension", async () => {
    const token = jwt.sign({ sub: EMAIL, kind: "site", v: 1 }, SECRET, { algorithm: "HS256", expiresIn: "12h" });
    const headers = { cookie: "h2_site_auth=" + token };
    expect((await call("/api/site-access/session", {}, headers, "GET")).body.authorized).toBe(true);
    state.person.status = "suspended";
    expect((await call("/api/site-access/session", {}, headers, "GET")).body.authorized).toBe(false);
  });
});
