import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { ChassisGenerationInput } from "../shared/chassisService";

export class ChassisServiceError extends Error {
  constructor(public readonly code: "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" | "TOO_MANY_REQUESTS", message: string) {
    super(message);
  }
}

export function normalizeChassisPhone(value: string): string {
  let phone = value.replace(/\D/g, "");
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith("55")) phone = phone.slice(2);
  if (!/^\d{10,11}$/.test(phone)) throw new ChassisServiceError("BAD_REQUEST", "Informe o telefone com DDD.");
  return phone;
}

export function assertChassisCredits(value: number, allowZero = true): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 1_000_000) {
    throw new ChassisServiceError("BAD_REQUEST", "Informe uma quantidade inteira de créditos entre 0 e 1.000.000.");
  }
}

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashChassisPassword(password: string): Promise<string> {
  if (password.length < 8 || password.length > 128) throw new ChassisServiceError("BAD_REQUEST", "A senha deve ter entre 8 e 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derivePassword(password, salt)).toString("hex")}`;
}

export async function verifyChassisPassword(password: string, encoded: string | null): Promise<boolean> {
  const pieces = (encoded || "").split("$");
  const valid = pieces[0] === "scrypt" && /^[a-f0-9]{32}$/.test(pieces[1] || "") && /^[a-f0-9]{128}$/.test(pieces[2] || "");
  const computed = await derivePassword(password, valid ? pieces[1] : "0".repeat(32));
  const expected = valid ? Buffer.from(pieces[2], "hex") : Buffer.alloc(64);
  return timingSafeEqual(computed, expected) && valid;
}

export function chassisTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function chassisGenerationHash(input: ChassisGenerationInput): string {
  return createHash("sha256").update(JSON.stringify({ marca: input.marca, modelo: input.modelo, yearCode: input.yearCode, quantity: input.quantity, originalVin: input.originalVin || "", syntheticLab: input.syntheticLab === true })).digest("hex");
}

export function assertChassisSameOrigin(origin: string | undefined, host: string | undefined): void {
  try {
    if (origin && host && new URL(origin).host === host && /^https?:$/.test(new URL(origin).protocol)) return;
  } catch { /* origem inválida */ }
  throw new ChassisServiceError("FORBIDDEN", "Solicitação fora da origem do serviço.");
}

export class ChassisRateLimiter {
  private readonly entries = new Map<string, { used: number; expiresAt: number }>();
  check(key: string, limit: number, durationMs: number, now = Date.now()): void {
    if (this.entries.size > 10_000) {
      for (const [entryKey, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(entryKey);
      if (this.entries.size > 10_000) throw new ChassisServiceError("TOO_MANY_REQUESTS", "Aguarde para tentar novamente.");
    }
    const previous = this.entries.get(key);
    const entry = !previous || previous.expiresAt <= now ? { used: 0, expiresAt: now + durationMs } : previous;
    if (entry.used >= limit) throw new ChassisServiceError("TOO_MANY_REQUESTS", "Muitas tentativas. Aguarde para tentar novamente.");
    entry.used += 1;
    this.entries.set(key, entry);
  }
}
