import { afterEach, beforeEach, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "pix-admin-test",
    email: "pix-admin-test@example.com",
    name: "PIX Admin Test",
    loginMethod: "test",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const secret = process.env.JWT_SECRET!;
  const token = jwt.sign({ sub: user.openId, role: "admin" }, secret);
  return {
    user,
    req: { protocol: "https", headers: { cookie: `admin_token=${token}` } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const pixAccount = {
  label: "Conta de teste",
  pixKey: "pix-test@example.com",
  pixType: "EMAIL",
  pixName: "Titular de teste",
  pixBank: "Banco de teste",
};

const loanPixConfig = {
  pixKey: "pix-loan-test@example.com",
  pixKeyType: "email" as const,
  pixName: "Titular de teste",
  bankName: "Banco de teste",
  isActive: 1,
};

describe("proteção das mutações PIX do ADM", () => {
  beforeEach(() => {
    process.env.ADMIN_LOAN_EDIT_PASSWORD = "senha-ficticia-apenas-no-teste";
    process.env.JWT_SECRET = "jwt-segredo-ficticio-apenas-no-teste-32";
  });

  afterEach(() => {
    delete process.env.ADMIN_LOAN_EDIT_PASSWORD;
    delete process.env.JWT_SECRET;
  });

  it("aceita a mesma senha no autorizador PIX", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(caller.pix.authorize({ password: "senha-ficticia-apenas-no-teste" })).resolves.toEqual({ ok: true });
  });

  it("bloqueia as quatro mutações da rota pix sem consultar o banco", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const wrongPassword = "senha-incorreta";

    await expect(caller.pix.create({ ...pixAccount, editPassword: wrongPassword })).rejects.toThrow("Senha interna inválida ou não configurada.");
    await expect(caller.pix.update({ id: 1, ...pixAccount, editPassword: wrongPassword })).rejects.toThrow("Senha interna inválida ou não configurada.");
    await expect(caller.pix.setActive({ id: 1, editPassword: wrongPassword })).rejects.toThrow("Senha interna inválida ou não configurada.");
    await expect(caller.pix.delete({ id: 1, editPassword: wrongPassword })).rejects.toThrow("Senha interna inválida ou não configurada.");
  });

  it("bloqueia criar/editar e excluir PIX da rota de empréstimos sem consultar o banco", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const wrongPassword = "senha-incorreta";

    await expect(caller.loans.savePixConfig({ ...loanPixConfig, editPassword: wrongPassword })).rejects.toThrow("Senha interna inválida ou não configurada.");
    await expect(caller.loans.deletePixConfig({ id: 1, editPassword: wrongPassword })).rejects.toThrow("Senha interna inválida ou não configurada.");
  });
});
