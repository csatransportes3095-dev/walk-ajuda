import { beforeEach, describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret, generateTotp, normalizeTotpSecret } from "./adminAuthenticatorVault";
import fs from "node:fs";
import path from "node:path";

beforeEach(() => {
  process.env.AUTHENTICATOR_ENCRYPTION_KEY = "test-master-key-only-for-vitest-1234567890";
});

describe("cofre privado do autenticador", () => {
  it("normaliza chaves Base32 sem guardar espaços ou hífens", () => {
    expect(normalizeTotpSecret("gez dgnbv-gy3tqojq gezdgnbv gy3tqojq")).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("gera o código TOTP padrão de seis dígitos", () => {
    const result = generateTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000);
    expect(result.code).toBe("287082");
    expect(result.expiresAt).toBe(60_000);
  });

  it("cifra a chave e recupera somente no servidor", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted.ciphertext).not.toContain(secret);
    expect(encrypted.iv).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
  });

  it("rejeita conteúdo adulterado", () => {
    const encrypted = encryptTotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(() => decryptTotpSecret({ ...encrypted, tag: "AAAAAAAAAAAAAAAAAAAAAA==" })).toThrow();
  });

  it("não devolve segredo pela interface administrativa", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/adminAuthenticator.ts"), "utf8");
    expect(source).toContain("function publicEntry");
    expect(source).not.toContain("secretCiphertext: row.secretCiphertext");
    expect(source).toContain("adminProcedure");
  });
});
