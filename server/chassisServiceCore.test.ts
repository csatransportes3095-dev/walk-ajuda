import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { assertChassisCredits, assertChassisSameOrigin, chassisGenerationHash, chassisTokenHash, ChassisRateLimiter, hashChassisPassword, normalizeChassisPhone, verifyChassisPassword } from "./chassisServiceCore";
import { isChassisCustomerLocation } from "../shared/chassisService";
import { gerarIdentificadorLaboratorio, isIdentificadorLaboratorio } from "../client/src/lib/chassisTestIdentifier";
import { isVINValido } from "../client/src/lib/vinGenerator";
import { generateChassisCandidates } from "./chassisServiceStore";

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

describe("H2CHASSIS: mesmo motor de teste para ADM e cliente", () => {
  const referencia = "9BHCP51AANP304551";
  const input = { requestId: randomUUID(), marca: "Hyundai", modelo: "HB20 Limited Plus", yearCode: "N" as const, quantity: 10, originalVin: referencia, syntheticLab: true };

  it("cria lote de dez identificadores de teste, todos distintos do original e com digito verificador", () => {
    const lote = generateChassisCandidates(input, 10);
    expect(lote).toHaveLength(10);
    expect(new Set(lote).size).toBe(10);
    for (const codigo of lote) {
      expect(codigo).not.toBe(referencia);
      expect(codigo).toHaveLength(17);
      expect(codigo.startsWith("0H2T")).toBe(true);
      expect(codigo[9]).toBe("N");
      expect(codigo[10]).toBe("X");
      expect(isVINValido(codigo)).toBe(true);
      expect(isIdentificadorLaboratorio(codigo)).toBe(true);
    }
  });

  it("usa a mesma funcao nos dois caminhos e rejeita ano divergente", () => {
    const adm = gerarIdentificadorLaboratorio(referencia, new Set());
    const cliente = generateChassisCandidates({ ...input, quantity: 1 }, 1)[0];
    expect(isIdentificadorLaboratorio(adm)).toBe(true);
    expect(isIdentificadorLaboratorio(cliente)).toBe(true);
    expect(cliente).not.toBe(adm);
    expect(() => gerarIdentificadorLaboratorio(referencia, new Set([adm]))).not.toThrow();
    expect(() => generateChassisCandidates({ ...input, yearCode: "T" }, 1)).toThrow("mesmo ano");
    expect(() => generateChassisCandidates({ ...input, originalVin: undefined }, 1)).toThrow("original");
  });

  it("preserva o gerador legado quando o novo modo nao foi escolhido", () => {
    const legado = generateChassisCandidates({ ...input, syntheticLab: false }, 1)[0];
    expect(legado.startsWith("9BHCP51A")).toBe(true);
    expect(legado[9]).toBe("N");
    expect(isVINValido(legado)).toBe(true);
    expect(isIdentificadorLaboratorio(legado)).toBe(false);
  });
});
