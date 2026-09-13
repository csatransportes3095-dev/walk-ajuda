import { beforeEach, describe, expect, it, vi } from "vitest";

const compareMock = vi.fn();
const sendMailDirectMock = vi.fn().mockResolvedValue(undefined);
const getSettingMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("bcryptjs", () => ({
  default: {
    compare: compareMock,
  },
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
  getSetting: getSettingMock,
}));

vi.mock("./_core/sendMailDirect", () => ({
  sendMailDirect: sendMailDirectMock,
}));

import { appRouter } from "./routers";

function createDbMock() {
  const selectResults = [
    [{ phone: "11999999999", name: "Cliente Teste", email: "cliente@example.com", cpf: "123.456.789-00", blocked: 0 }],
    [{ phone: "11999999999", password: "stored-hash", pendingApproval: 0, expiresAt: new Date(Date.now() + 60_000) }],
  ];

  const insertValues: unknown[] = [];

  return {
    db: {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => selectResults.shift() ?? [],
          }),
        }),
      })),
      insert: vi.fn(() => ({
        values: async (value: unknown) => {
          insertValues.push(value);
          return { success: true };
        },
      })),
    },
    insertValues,
  };
}

describe("customerPassword login notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "test-resend-key";
    delete process.env.SMTP_PASS;
    delete process.env.ZOHO_EMAIL_PASSWORD;
    getSettingMock.mockImplementation(async (key: string) => {
      if (key === "email_to") return "admin@example.com";
      if (key === "contact_email") return "fallback@example.com";
      if (key === "site_title") return "WALK AJUDA";
      if (key === "site_domain") return "walkajuda.com";
      if (key === "site_url") return "https://walkajuda.com";
      if (key === "site_base_url") return "https://walkajuda.com";
      return null;
    });
  });

  it("sends an admin email after a successful customer login", async () => {
    const { db, insertValues } = createDbMock();
    getDbMock.mockResolvedValue(db);
    compareMock.mockResolvedValue(true);
    const caller = appRouter.createCaller({ user: null, req: { headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res: { clearCookie: vi.fn(), cookie: vi.fn() } } as any);

    const result = await caller.customerPassword.login({ phone: "(11) 99999-9999", password: "1234" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toMatchObject({ success: true });
    expect(insertValues).toHaveLength(2);
    expect(sendMailDirectMock).toHaveBeenCalledTimes(1);
    expect(sendMailDirectMock).toHaveBeenCalledWith(expect.objectContaining({
      to: "admin@example.com",
      subject: "Cliente entrou no sistema - Cliente Teste",
    }));
    expect(String(sendMailDirectMock.mock.calls[0]?.[0]?.html || "")).toContain("CLIENTE ENTROU NO SISTEMA");
    expect(String(sendMailDirectMock.mock.calls[0]?.[0]?.html || "")).toContain("Cliente Teste");
  });

  it("does not send email when login fails", async () => {
    const { db } = createDbMock();
    getDbMock.mockResolvedValue(db);
    compareMock.mockResolvedValue(false);
    const caller = appRouter.createCaller({ user: null, req: { headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res: { clearCookie: vi.fn(), cookie: vi.fn() } } as any);

    const result = await caller.customerPassword.login({ phone: "(11) 99999-9999", password: "errada" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toEqual({ success: false, error: "wrong_password" });
    expect(sendMailDirectMock).not.toHaveBeenCalled();
  });
}
