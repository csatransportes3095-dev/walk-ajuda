import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { getAdminJwtSecret } from "./adminJwt";

const PROOF_TTL_MS = 20 * 60 * 1000;
const PROOF_PREFIX = "h2-email-v1";
type ProofPayload = { phone: string; email: string; expiresAt: number; nonce: string };

/**
 * E-mail verification evidence for the customer login/password flow.
 *
 * The previous in-memory Map was lost whenever Render restarted/deployed
 * between e-mail verification and password creation, causing 401 on valid
 * attempts. A signed and time-limited proof survives restarts across workers.
 * It never authorizes a customer by phone alone: a valid e-mail OTP is required
 * before issuing it, and each protected route still checks the owner's e-mail.
 */
function secret(): string {
  const value = getAdminJwtSecret();
  if (!value) throw new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message: "A confirmação por e-mail está indisponível. Solicite atendimento.",
  });
  return value;
}

function signature(encoded: string, key: string): Buffer {
  return createHmac("sha256", key)
    .update("h2-customer-login-email-proof-v1|")
    .update(encoded)
    .digest();
}

export function issueLoginEmailProof(phone: string, email: string): string {
  const normalizedPhone = phone.replace(/\D/g, "");
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^\d{11}$/.test(normalizedPhone) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cadastro inválido para confirmar o e-mail." });
  }
  const key = secret();
  const payload: ProofPayload = {
    phone: normalizedPhone,
    email: normalizedEmail,
    expiresAt: Date.now() + PROOF_TTL_MS,
    nonce: randomBytes(16).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${PROOF_PREFIX}.${encoded}.${signature(encoded, key).toString("hex")}`;
}

export function assertLoginEmailProof(phone: string, token: string): ProofPayload {
  const key = secret();
  const failure = () => {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "A confirmação do e-mail expirou ou não está válida. Confirme o código novamente.",
    });
  };
  if (typeof token !== "string" || token.length > 1500 || token.length < 75) return failure();
  const pieces = token.split(".");
  if (pieces.length !== 3 || pieces[0] !== PROOF_PREFIX ||
      !/^[A-Za-z0-9_-]+$/.test(pieces[1]) || !/^[0-9a-f]{64}$/.test(pieces[2])) return failure();
  const expected = signature(pieces[1], key);
  const actual = Buffer.from(pieces[2], "hex");
  if (!timingSafeEqual(actual, expected)) return failure();
  try {
    const value = JSON.parse(Buffer.from(pieces[1], "base64url").toString("utf8")) as ProofPayload;
    if (!value || value.phone !== phone.replace(/\D/g, "") ||
        !/^\d{11}$/.test(value.phone) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) ||
        !Number.isSafeInteger(value.expiresAt) ||
        value.expiresAt < Date.now() ||
        value.expiresAt > Date.now() + PROOF_TTL_MS ||
        !/^[0-9a-f]{32}$/.test(value.nonce)) return failure();
    return value;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return failure();
  }
}
