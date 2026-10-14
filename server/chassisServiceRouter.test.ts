import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { chassisServiceRouter } from "./routers/chassisService";

const fixture = vi.hoisted(() => {
  const user = { id: 17, phone: "11998765432", accountType: "paid", status: "active", balance: 10, totalUsed: 0, createdAt: new Date() };
  return { user, resolveSession: vi.fn(), generate: vi.fn(), createPurchase: vi.fn(), logout: vi.fn(), login: vi.fn(), listUsers: vi.fn() };
});
vi.mock("./chassisServiceStore", () => ({ getChassisServiceStore: () => fixture }));

const secret = "test-secret-which-is-longer-than-32-characters";
const ownToken = "s".repeat(43);
function caller(cookie = "", origin = "https://app.h2colombiano.com") {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  const ctx = { user: null, req: { headers: { cookie, origin, host: "app.h2colombiano.com", "x-forwarded-proto": "https" }, secure: true, ip: randomUUID(), socket: { remoteAddress: "127.0.0.1" } }, res };
  return { api: chassisServiceRouter.createCaller(ctx as any), res };
}
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", secret);
  vi.clearAllMocks();
  fixture.resolveSession.mockImplementation(async token => token === ownToken ? { user: fixture.user, tokenHash: "test-hash" } : null);
  fixture.login.mockResolvedValue({ token: ownToken, user: fixture.user });
  fixture.logout.mockResolvedValue({ success: true });
  fixture.generate.mockResolvedValue({ id: randomUUID(), vins: [], balance: 9 });
  fixture.createPurchase.mockResolvedValue({ id: randomUUID(), status: "pending" });
});

describe("autorização das APIs do serviço", () => {
  it("o login central ou ADM não é uma sessão de comprador", async () => {
    const admin = jwt.sign({ sub: "owner", role: "admin" }, secret);
    const { api } = caller(`admin_token=${admin}; customer_password_session=central-session`);
    expect(await api.me()).toBeNull();
    await expect(api.generate({ requestId: randomUUID(), marca: "Toyota", modelo: "Corolla", yearCode: "T", quantity: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("o comprador não administra usuários, pacotes ou saldos", async () => {
    const { api } = caller(`h2_chassis_session=${ownToken}`);
    await expect(api.adminUsers({ search: "", offset: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(api.adminAdjust({ userId: 17, delta: 100, note: "", requestId: randomUUID() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(api.adminConfirmPurchase({ id: randomUUID(), paymentConfirmed: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("o servidor usa o dono da sessão em vez do identificador informado pelo cliente", async () => {
    const { api } = caller(`h2_chassis_session=${ownToken}`);
    const requestId = randomUUID();
    await api.generate({ requestId, marca: "Toyota", modelo: "Corolla", yearCode: "T", quantity: 1, userId: 999 } as any);
    expect(fixture.generate).toHaveBeenCalledWith(17, "test-hash", { requestId, marca: "Toyota", modelo: "Corolla", yearCode: "T", quantity: 1 });
  });
  it("compra não aceita preço ou créditos fornecidos pelo navegador", async () => {
    const { api } = caller(`h2_chassis_session=${ownToken}`);
    const requestId = randomUUID();
    await api.buy({ packageId: 3, requestId, credits: 99999, priceCents: 1 } as any);
    expect(fixture.createPurchase).toHaveBeenCalledWith(17, "test-hash", 3, requestId);
  });
  it("bloqueia mutação de outra origem antes de gastar créditos", async () => {
    const { api } = caller(`h2_chassis_session=${ownToken}`, "https://evil.example");
    await expect(api.generate({ requestId: randomUUID(), marca: "Toyota", modelo: "Corolla", yearCode: "T", quantity: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fixture.generate).not.toHaveBeenCalled();
  });
  it("guarda sessão somente em cookie próprio HttpOnly e não devolve o token", async () => {
    const { api, res } = caller();
    const output = await api.login({ phone: fixture.user.phone, password: "chassis-test-123" });
    expect(output).not.toHaveProperty("token");
    expect(res.cookie).toHaveBeenCalledWith("h2_chassis_session", ownToken, expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", path: "/" }));
    const logoutCaller = caller(`h2_chassis_session=${ownToken}; admin_token=unchanged`);
    await logoutCaller.api.logout();
    expect(logoutCaller.res.clearCookie).toHaveBeenCalledTimes(1);
    expect(logoutCaller.res.clearCookie).toHaveBeenCalledWith("h2_chassis_session", expect.any(Object));
  });
});
