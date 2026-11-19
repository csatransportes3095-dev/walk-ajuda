import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { parseCpfVaultBatch, validCpfVaultValue, CPF_VAULT_BATCH_LIMIT } from "../shared/cpfVault";
import { ensureCpfVaultSchema } from "./cpfVaultSchema";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({ getDb: vi.fn(), locked: false }));
vi.mock("./db", () => ({ getDb: state.getDb }));
vi.mock("./backupRestoreService", () => ({ isSystemRestoreLocked: () => state.locked }));
vi.mock("./_core/customerEntryNotification", () => ({ notifyCustomerEntry: vi.fn() }));

import { cpfVaultRouter } from "./routers/cpfVault";
import { getCpfVaultOrderMetadata } from "./cpfVault";

const CPF_A = "52998224725";
const CPF_B = "11144477735";
const CPF_ZERO = "01234567890";
const TEST_JWT_SECRET = "cpf-vault-test-admin-secret-with-at-least-32-characters";

function context(role?: string): TrpcContext {
  const token = role ? jwt.sign({ sub: "cpf-vault-test", role }, TEST_JWT_SECRET) : "";
  return {
    user: null,
    req: { headers: { cookie: token ? `admin_token=${token}` : "" } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
  state.getDb.mockReset().mockResolvedValue(null);
  state.locked = false;
});
afterEach(() => vi.unstubAllEnvs());

describe("Cofre de CPF: normalização e consulta em lote", () => {
  it("compara apenas os 11 números, preservando o zero inicial", () => {
    expect(validCpfVaultValue("529.982.247-25")).toBe(CPF_A);
    expect(validCpfVaultValue(" 012.345.678-90 ")).toBe(CPF_ZERO);
    expect(validCpfVaultValue("529 982 247 25")).toBe(CPF_A);
  });

  it("não classifica CPFs incompletos, repetidos, com checksum errado ou texto como disponíveis", () => {
    for (const raw of ["", "5299822472", "529982247250", "00000000000", "11111111111", "52998224726", "CPF52998224725"]) {
      expect(validCpfVaultValue(raw)).toBeNull();
    }
  });

  it("remove repetições entre formatos e informa entradas inválidas", () => {
    expect(parseCpfVaultBatch(`529.982.247-25\n${CPF_B},${CPF_A};00000000000\n${CPF_ZERO}`)).toEqual({
      cpfs: [CPF_A, CPF_B, CPF_ZERO], invalid: ["00000000000"], duplicateCount: 1, total: 3,
    });
  });

  it("aceita separadores usuais sem concatenar CPFs separados", () => {
    expect(parseCpfVaultBatch(`${CPF_A} ${CPF_B}\t${CPF_ZERO}`).cpfs).toEqual([CPF_A, CPF_B, CPF_ZERO]);
    expect(parseCpfVaultBatch("529 982 247 25\n111.444.777-35").cpfs).toEqual([CPF_A, CPF_B]);
    expect(parseCpfVaultBatch(" \n\t,; ")).toEqual({ cpfs: [], invalid: [], duplicateCount: 0, total: 0 });
  });

  it("rejeita excesso antes de deduplicar e não trunca entradas", () => {
    expect(() => parseCpfVaultBatch(Array(CPF_VAULT_BATCH_LIMIT + 1).fill(CPF_A).join("\n"))).toThrow("2.000");
    expect(() => parseCpfVaultBatch(" ".repeat(64_001))).toThrow("64.000");
  });
});

describe("Cofre de CPF: autorização e falhas", () => {
  it.each([undefined, "user"])("bloqueia todas as operações sem JWT administrativo (%s)", async role => {
    const caller = cpfVaultRouter.createCaller(context(role));
    const actions = [
      () => caller.check({ cpf: CPF_A }),
      () => caller.save({ cpf: CPF_A }),
      () => caller.checkBatch({ text: CPF_A }),
      () => caller.saveBatch({ text: CPF_A }),
      () => caller.list({}),
    ];
    for (const action of actions) await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("não confia em user.role quando o cookie administrativo é ausente", async () => {
    const ctx = context();
    ctx.user = { role: "admin" } as TrpcContext["user"];
    await expect(cpfVaultRouter.createCaller(ctx).check({ cpf: CPF_A })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("rejeita CPF inválido antes de consultar o banco", async () => {
    await expect(cpfVaultRouter.createCaller(context("admin")).check({ cpf: "52998224726" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("rejeita cliente forjado e escopo de subpedido sem pedido", async () => {
    const caller = cpfVaultRouter.createCaller(context("admin"));
    await expect(caller.save({ cpf: CPF_A, customerId: 999 } as Parameters<typeof caller.save>[0]))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.save({ cpf: CPF_A, subOrderIndex: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.list({ expectedOrderNumber: 999 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.save({ cpf: CPF_A, expectedOrderRootId: 999 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.list({ expectedOrderRootId: 999 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("exige identidade imutável antes de registrar CPF vinculado a um pedido", async () => {
    const caller = cpfVaultRouter.createCaller(context("admin"));
    await expect(caller.save({ cpf: CPF_A, registrationId: 101, subOrderIndex: 0 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.save({ cpf: CPF_A, registrationId: 101, expectedOrderNumber: 8102 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it("falha fechada para consulta, cadastro e lote quando o banco está indisponível", async () => {
    const caller = cpfVaultRouter.createCaller(context("admin"));
    for (const action of [
      () => caller.check({ cpf: CPF_A }), () => caller.save({ cpf: CPF_A }),
      () => caller.checkBatch({ text: CPF_A }), () => caller.saveBatch({ text: CPF_A }), () => caller.list({}),
    ]) await expect(action()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("não devolve SQL nem CPF quando o driver falha", async () => {
    state.getDb.mockRejectedValue(new Error(`SELECT secret FROM records WHERE cpf='${CPF_A}'`));
    try {
      await cpfVaultRouter.createCaller(context("admin")).check({ cpf: CPF_A });
      expect.fail("A consulta deveria falhar");
    } catch (error) {
      expect(error).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect(String(error)).not.toContain(CPF_A);
      expect(String(error)).not.toContain("SELECT");
    }
  });

  it("respeita o bloqueio administrativo existente durante restauração", async () => {
    state.locked = true;
    await expect(cpfVaultRouter.createCaller(context("admin")).save({ cpf: CPF_A }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.getDb).not.toHaveBeenCalled();
  });
});

describe("Cofre de CPF: inicialização", () => {
  it("não fornece identidade para registro nem quebra os cards quando os metadados falham", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const db = { execute: vi.fn().mockRejectedValue(new Error("database unavailable")) };
      expect(await getCpfVaultOrderMetadata(db, [{ registrationId: 101, subOrderIndex: 0 }])).toEqual(new Map());
    } finally {
      warn.mockRestore();
    }
  });

  it("compartilha a migração entre chamadas simultâneas e permite nova tentativa após falha", async () => {
    const db = { execute: vi.fn().mockResolvedValue([[], []]) };
    await Promise.all([ensureCpfVaultSchema(db), ensureCpfVaultSchema(db)]);
    expect(db.execute).toHaveBeenCalledTimes(1);

    const retry = { execute: vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue([[], []]) };
    await expect(ensureCpfVaultSchema(retry)).rejects.toThrow("temporary");
    await ensureCpfVaultSchema(retry);
    expect(retry.execute).toHaveBeenCalledTimes(2);
  });
});
