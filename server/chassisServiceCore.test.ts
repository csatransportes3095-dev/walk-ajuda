import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { assertChassisCredits, assertChassisSameOrigin, chassisGenerationHash, chassisTokenHash, ChassisRateLimiter, hashChassisPassword, normalizeChassisPhone, verifyChassisPassword } from "./chassisServiceCore";
import { isChassisCustomerLocation } from "../shared/chassisService";

describe("acesso independente do serviço", () => {
  it("normaliza o mesmo telefone com ou sem código do Brasil", () => {
    expect(normalizeChassisPhone("+55 (11) 99876-5432")).toBe("11998765432");
    expect(normalizeChassisPhone("11 99876 5432")).toBe("11998765432");
    expect(() => normalizeChassisPhone("123")).toThrow("DDD");
  });
  it("aceita somente saldos inteiros no limite", () => {
    for (const value of [-1, NaN, Infinity, 1.1, 1_000_001]) expect(() => assertChassisCredits(value)).toThrow();
    expect(() => assertChassisCredits(0)).not.toThrow();
    expect(() => assertChassisCredits(0, false)).toThrow();
  });
  it("gera hashes diferentes para a mesma senha e rejeita a senha incorreta", async () => {
    const first = await hashChassisPassword("chassis-test-123");
    const second = await hashChassisPassword("chassis-test-123");
    expect(first).not.toBe(second);
    expect(first).not.toContain("chassis-test-123");
    expect(await verifyChassisPassword("chassis-test-123", first)).toBe(true);
    expect(await verifyChassisPassword("wrong-password", first)).toBe(false);
    expect(await verifyChassisPassword("chassis-test-123", null)).toBe(false);
    await expect(hashChassisPassword("123")).rejects.toThrow();
  });
  it("limita tentativas e libera novamente após o prazo", () => {
    const limiter = new ChassisRateLimiter();
    limiter.check("phone", 2, 1000, 0); limiter.check("phone", 2, 1000, 1);
    expect(() => limiter.check("phone", 2, 1000, 2)).toThrow();
    expect(() => limiter.check("phone", 2, 1000, 1001)).not.toThrow();
  });
  it("rejeita requisições de outra origem", () => {
    expect(() => assertChassisSameOrigin("https://app.h2colombiano.com", "app.h2colombiano.com")).not.toThrow();
    expect(() => assertChassisSameOrigin("https://evil.example", "app.h2colombiano.com")).toThrow();
    expect(() => assertChassisSameOrigin(undefined, "app.h2colombiano.com")).toThrow();
  });
  it("não usa token em texto aberto e vincula a repetição aos mesmos campos", () => {
    const input = { requestId: randomUUID(), marca: "Toyota", modelo: "Corolla", yearCode: "T" as const, quantity: 1 };
    expect(chassisTokenHash("example-token")).toHaveLength(64);
    expect(chassisGenerationHash({ ...input, requestId: randomUUID() })).toBe(chassisGenerationHash(input));
    expect(chassisGenerationHash({ ...input, quantity: 2 })).not.toBe(chassisGenerationHash(input));
  });
  it("isola somente a rota oficial do usuário e o suporte legado previsto", () => {
    expect(isChassisCustomerLocation("/H2CHASSIS/?x=1")).toBe(true);
    expect(isChassisCustomerLocation("/", "app.h2colombiano.com")).toBe(true);
    for (const path of ["/app", "/app-pro", "/app/chassis", "/h2chassis-outro", "/h2chassis/cliente", "/admin/login", "/login"]) expect(isChassisCustomerLocation(path)).toBe(false);
    expect(isChassisCustomerLocation("/", "app.h2colombiano.com.evil.example")).toBe(false);
    expect(isChassisCustomerLocation("/", "h2colombiano.com")).toBe(false);
  });
});
