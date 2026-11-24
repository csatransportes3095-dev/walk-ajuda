import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { getAdminJwtSecret } from "./adminJwt";
import { normalizeCustomerPhone } from "./customerAccess";
import { digest } from "./customerOtpAccess";
import { ensureCustomerPasskeyLoginTables } from "./customerPasskeyLogin";

async function rows(db: any, statement: any): Promise<any[]> {
  return (await db.execute(statement))?.[0] || [];
}
function administrator(req: Request): string {
  try {
    const secret = getAdminJwtSecret();
    const token = parseCookieHeader(req.headers.cookie || "").admin_token;
    if (secret && token) {
      const payload = jwt.verify(token, secret);
      if (typeof payload !== "string" && payload.role === "admin" &&
          typeof payload.sub === "string" && payload.sub.trim()) return payload.sub.trim().slice(0,120);
    }
  } catch { /* Fail closed. */ }
  throw new TRPCError({code:"FORBIDDEN",message:"Sessão administrativa inválida."});
}
async function ready(db: any) {
  if (!db) throw new TRPCError({code:"SERVICE_UNAVAILABLE",message:"Banco indisponível."});
  await ensureCustomerPasskeyLoginTables(db);
}
export async function getCustomerPasskeyRevocationTarget(db: any, customerId: number, req: Request) {
  administrator(req);
  await ready(db);
  const [customer] = await rows(db,sql`SELECT id,name,phone FROM customers WHERE id=${customerId} AND deletedAt IS NULL`);
  if (!customer) throw new TRPCError({code:"NOT_FOUND",message:"Cliente não encontrado."});
  const [keys] = await rows(db,sql`SELECT COUNT(*) AS total FROM customerPasskeyCredentials WHERE customerId=${customerId}`);
  const [sessions] = await rows(db,sql`SELECT COUNT(*) AS total FROM customerPasskeySessions p
    INNER JOIN customerOtpSessions o ON o.tokenHash=p.tokenHash AND o.customerId=p.customerId
    INNER JOIN customerPasswordSessions s ON s.id=p.sessionId AND SHA2(s.token,256)=p.tokenFingerprint
    WHERE p.customerId=${customerId} AND o.expiresAt>${Date.now()} AND s.expiresAt>NOW()`);
  return {customerId:Number(customer.id),name:String(customer.name || ""),phone:normalizeCustomerPhone(customer.phone),
    credentialCount:Number(keys?.total || 0),activeSessionCount:Number(sessions?.total || 0)};
}
export async function revokeCustomerPasskeys(db: any, customerId: number, expectedPhone: string, req: Request) {
  const actor = administrator(req);
  await ready(db);
  return db.transaction(async (tx: any) => {
    const [customer] = await rows(tx,sql`SELECT id,phone FROM customers WHERE id=${customerId} AND deletedAt IS NULL FOR UPDATE`);
    const phone = normalizeCustomerPhone(customer?.phone);
    if (!customer || !phone || phone !== expectedPhone) throw new TRPCError({code:"CONFLICT",message:"O cadastro mudou. Consulte o cliente novamente."});
    // Same lock order as enrollment and successful biometric authentication.
    // Invalidate only credentials and enrollment challenges for this account.
    const deleted = await tx.execute(sql`DELETE FROM customerPasskeyCredentials WHERE customerId=${customerId}`);
    await tx.execute(sql`DELETE FROM customerPasskeyEnrollments WHERE customerId=${customerId}`);
    await tx.execute(sql`DELETE FROM customerPasskeyLoginChallenges WHERE phoneKey=${digest("phone",phone)}`);
    // Explicit provenance protects sessions created by email OTP. Fingerprint,
    // session id and customer id prevent deleting a recycled session row.
    const active = await rows(tx,sql`SELECT p.sessionId,p.tokenHash,p.tokenFingerprint
      FROM customerPasskeySessions p INNER JOIN customerOtpSessions o
      ON o.tokenHash=p.tokenHash AND o.customerId=p.customerId
      INNER JOIN customerPasswordSessions s ON s.id=p.sessionId AND SHA2(s.token,256)=p.tokenFingerprint
      WHERE p.customerId=${customerId} AND o.expiresAt>${Date.now()} AND s.expiresAt>NOW() FOR UPDATE`);
    for (const session of active) {
      await tx.execute(sql`DELETE FROM customerOtpSessions WHERE tokenHash=${session.tokenHash} AND customerId=${customerId}`);
      await tx.execute(sql`DELETE FROM customerPasswordSessions WHERE id=${Number(session.sessionId)} AND SHA2(token,256)=${session.tokenFingerprint}`);
    }
    await tx.execute(sql`DELETE FROM customerPasskeySessions WHERE customerId=${customerId}`);
    const credentialsRevoked = Number(deleted?.[0]?.affectedRows || 0), sessionsRevoked = active.length;
    const revokedAt = Date.now();
    await tx.execute(sql`INSERT INTO customerPasskeyRevocations
      (customerId,administrator,revokedAt,credentialsRevoked,sessionsRevoked)
      VALUES (${customerId},${actor},${revokedAt},${credentialsRevoked},${sessionsRevoked})`);
    return {customerId,credentialsRevoked,sessionsRevoked,revokedAt};
  });
}
