import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("./db", () => ({
  getDb: getDbMock,
}));

import { getAdminJwtSecret } from "./adminJwt";
import { requireCustomerSession } from "./customerSession";

type SessionRow = { phone: string; expiresAt: Date } | null;
type CustomerRow = { phone: string; blocked: number } | null;

function databaseFor(session: SessionRow, customer: CustomerRow) {
  let queryCount = 0;
  return {
    select: vi.fn(() => {
      queryCount += 1;
      return {
        from: () => ({
          where: () => ({
            limit: async () => {
              const row = queryCount === 1 ? session : customer;
              return row ? [row] : [];
            },
          }),
        }),
      };
    }),
  };
}

describe("customer session authorization", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("rejects a missing token before querying the database", async () => {
    await expect(requireCustomerSession("", "11999999999")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("authorizes only the phone bound to a valid active session", async () => {
    getDbMock.mockResolvedValue(databaseFor(
      { phone: "11999999999", expiresAt: new Date(Date.now() + 60_000) },
      { phone: "11999999999", blocked: 0 },
    ));

    await expect(requireCustomerSession("a".repeat(64), "11999999999")).resolves.toEqual({ phone: "11999999999" });
  });

  it("rejects a valid token when the requested phone belongs to another customer", async () => {
    getDbMock.mockResolvedValue(databaseFor(
      { phone: "11999999999", expiresAt: new Date(Date.now() + 60_000) },
      { phone: "11999999999", blocked: 0 },
    ));

    await expect(requireCustomerSession("a".repeat(64), "11888888888")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects expired sessions", async () => {
    getDbMock.mockResolvedValue(databaseFor(
      { phone: "11999999999", expiresAt: new Date(Date.now() - 60_000) },
      { phone: "11999999999", blocked: 0 },
    ));

    await expect(requireCustomerSession("a".repeat(64), "11999999999")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects blocked customers even with an otherwise valid token", async () => {
    getDbMock.mockResolvedValue(databaseFor(
      { phone: "11999999999", expiresAt: new Date(Date.now() + 60_000) },
      { phone: "11999999999", blocked: 1 },
    ));

    await expect(requireCustomerSession("a".repeat(64), "11999999999")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("authenticated order upload wiring", () => {
  it("requires the customer session on the new order upload route", () => {
    const source = readFileSync(resolve(process.cwd(), "server/uploadRoute.ts"), "utf8");
    expect(source).toContain('app.post("/api/upload/order-file-base64"');
    expect(source).toContain("requireCustomerSession(getCustomerSessionTokenFromRequest(req))");
    expect(source).not.toContain("requireCustomerSession(getCustomerSessionTokenFromRequest(req), phone)");
  });

  it("makes both the vitrine and Bot use the same authenticated upload core", () => {
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const bot = readFileSync(resolve(process.cwd(), "client/src/components/ColombiaBot.tsx"), "utf8");
    const shared = readFileSync(resolve(process.cwd(), "client/src/lib/reliableOrderUpload.ts"), "utf8");
    expect(home).toContain('uploadOrderFileReliably');
    expect(bot).toContain('uploadOrderFileReliably');
    expect(shared).toContain("/api/upload/order-file-base64");
    expect(shared).toContain("x-customer-session");
  });

  it("does not mark failed Bot uploads as sent", () => {
    const bot = readFileSync(resolve(process.cwd(), "client/src/components/ColombiaBot.tsx"), "utf8");
    expect(bot).toContain("if (!uploaded.ok)");
    expect(bot).toContain("text: uploaded.message");
    expect(bot).not.toContain("flowState.current.docFiles[doc.id] = { file };");
  });

  it("closes the one-time administrator setup after bootstrap", () => {
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(router).toContain("setupSecret: z.string().min(1)");
    expect(router).toContain("const existingAdmins = await db.select");
    expect(router).toContain("A criação inicial de administrador já foi concluída.");
    expect(router).toContain("configuredSetupSecret");
  });
});

describe("admin JWT secret", () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it("never returns a fallback secret when configuration is absent or weak", () => {
    expect(getAdminJwtSecret()).toBeNull();
    process.env.JWT_SECRET = "short-secret";
    expect(getAdminJwtSecret()).toBeNull();
  });

  it("accepts a configured secret with adequate length", () => {
    process.env.JWT_SECRET = "a".repeat(32);
    expect(getAdminJwtSecret()).toBe("a".repeat(32));
  });
});
