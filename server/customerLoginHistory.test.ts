import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: state.getDb }));
import { customerPasswordRouter } from "./routers/customerPassword";

const secret = "isolated-customer-login-history-test-secret-20261119";
function context(role?: string): TrpcContext {
  const token = role ? jwt.sign({ sub: "history-test", role }, secret) : "";
  return {
    user: null,
    req: { headers: { cookie: token ? `admin_token=${token}` : "" } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", secret);
  state.getDb.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("Histórico de acessos: autorização e indisponibilidade", () => {
  it.each([undefined, "user"])("recusa consulta sem cookie administrativo (%s)", async role => {
    await expect(customerPasswordRouter.createCaller(context(role))
      .adminGetLoginHistory({ phone: "11999990001" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("não usa a propriedade user.role para dispensar o cookie administrativo", async () => {
    const ctx = context();
    ctx.user = { role: "admin" } as TrpcContext["user"];
    await expect(customerPasswordRouter.createCaller(ctx)
      .adminGetLoginHistory({ phone: "11999990001" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("não apresenta zero acessos quando o banco está indisponível", async () => {
    await expect(customerPasswordRouter.createCaller(context("admin"))
      .adminGetLoginHistory({ phone: "11999990001" }))
      .rejects.toBeDefined();
  });

  it("não apresenta um histórico vazio quando a consulta falha", async () => {
    state.getDb.mockResolvedValue({ execute: vi.fn().mockRejectedValue(new Error("isolated read failure")) });
    await expect(customerPasswordRouter.createCaller(context("admin"))
      .adminGetLoginHistory({ phone: "11999990001" }))
      .rejects.toBeDefined();
  });
});
