import jwt from "jsonwebtoken";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const getDbMock = vi.hoisted(() => vi.fn());
const adminTestSecret = "test-admin-secret-that-is-at-least-32-bytes";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getDb: getDbMock };
});

import { appRouter } from "./routers";

function createAdminCaller() {
  const adminToken = jwt.sign({ sub: "1", role: "admin" }, adminTestSecret);
  return appRouter.createCaller({
    user: { id: 1, role: "admin" } as any,
    req: { headers: { cookie: `admin_token=${adminToken}` }, socket: { remoteAddress: "127.0.0.1" } } as any,
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as any,
  });
}

describe("orderStatus.listOrders visibility contract", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = adminTestSecret;
    let call = 0;
    const rowsByCall = [
      [[{
        id: 202,
        codeId: 101,
        phone: "11999990000",
        accessedAt: 1700000000000,
        consumed: 1,
        orderSource: "auto",
        refCode: null,
        refOwnerName: null,
        cartGroupId: null,
        cartTotal: null,
        cartCouponCode: null,
        cartCouponDiscount: null,
        cartItemIndex: 0,
        thirdPartyName: null,
        resellerDiscountApplied: null,
        codeClientName: "Cliente Teste",
        codeType: "vip",
        customerId: null,
        customerEmail: null,
        customerName: null,
        customerCity: null,
        customerUf: null,
        customerReferredBy: null,
        customerReferredByPhone: null,
        customerProfilePhotoUrl: null,
        customerNumber: null,
        isBlocked: 0,
      }]],
      [[]],
      [[{
        id: 303,
        registrationId: 202,
        status: "pedido_recebido",
        serviceName: "UBER APP",
        serviceOption: "UBER NOME",
        pricePaid: "R$ 700,00",
        answers: null,
        orderNumber: 404,
        deliveryEstimate: null,
        isUrgent: 0,
        commissionPaid: 0,
        createdAtMs: 1700000000000,
        note: null,
        deliveredNotifiedAtMs: null,
      }]],
      [[]],
      [[{ key: "pedido_recebido" }]],
      [[]],
      [[]],
      [[]],
      [[]],
      [[]],
    ];
    getDbMock.mockResolvedValue({
      execute: vi.fn().mockImplementation(async () => rowsByCall[call++] ?? [[]]),
    });
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  it("retorna um pedido que possui accessCodePhones e histórico de status", async () => {
    const result = await createAdminCaller().orderStatus.listOrders();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 202,
      latestStatus: "pedido_recebido",
      serviceName: "UBER APP",
      orderNumber: 404,
    });
  });
});
