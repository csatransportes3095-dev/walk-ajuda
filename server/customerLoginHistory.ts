import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { normalizeCustomerPhone } from "./customerAccess";
import { getCustomerLastActivity } from "./customerAccessEvidence";
import {
  type CustomerLoginHistoryExecutor,
  isDuplicateLoginSessionError,
  storedLoginPhoneSql,
} from "./customerLoginHistorySchema";

type VerifiedLogin = {
  customerId: number;
  phone: string;
  token: string;
  loggedInAtMs: number;
};

/** Called only after the customer's OTP/proof was validated, inside its transaction. */
export async function recordCustomerOtpLogin(tx: CustomerLoginHistoryExecutor, input: VerifiedLogin): Promise<void> {
  const phone = normalizeCustomerPhone(input.phone);
  if (!phone || !Number.isSafeInteger(input.customerId) || input.customerId <= 0 ||
      input.token.length !== 70 || !/^h2otp_[0-9a-f]{64}$/.test(input.token) ||
      !Number.isSafeInteger(input.loggedInAtMs) || input.loggedInAtMs <= 0) {
    throw new Error('Identidade ou horário inválido para registrar o acesso.');
  }
  const sessionKey = createHash('sha256').update(input.token).digest('hex');
  try {
    await tx.execute(sql`
      INSERT INTO customerLoginHistory (phone, loginAt, sessionKey)
      VALUES (${phone}, FROM_UNIXTIME(FLOOR(${input.loggedInAtMs} / 1000)), ${sessionKey})
    `);
  } catch (error) {
    if (!isDuplicateLoginSessionError(error)) throw error;
    // An exact retry may reuse this session's event, but another unique-key
    // conflict or a different identity/time must never be silently ignored.
    const result = await tx.execute(sql`
      SELECT phone, UNIX_TIMESTAMP(loginAt) * 1000 AS loginAtMs
      FROM customerLoginHistory WHERE sessionKey = ${sessionKey} LIMIT 1 FOR UPDATE
    `) as any;
    const existing = result?.[0]?.[0];
    if (!existing || normalizeCustomerPhone(existing.phone) !== phone ||
        Math.floor(Number(existing.loginAtMs) / 1000) !== Math.floor(input.loggedInAtMs / 1000)) {
      throw error;
    }
  }
  await tx.execute(sql`
    UPDATE customers
    SET lastAccessAt = CASE
      WHEN lastAccessAt IS NULL OR lastAccessAt < FROM_UNIXTIME(FLOOR(${input.loggedInAtMs} / 1000))
        THEN FROM_UNIXTIME(FLOOR(${input.loggedInAtMs} / 1000))
      ELSE lastAccessAt
    END
    WHERE id = ${input.customerId}
  `);
}

export async function getCustomerLoginHistory(
  db: CustomerLoginHistoryExecutor,
  phoneInput: string,
): Promise<{ total: number; recent: number[]; lastActivity: Awaited<ReturnType<typeof getCustomerLastActivity>> }> {
  const phone = normalizeCustomerPhone(phoneInput);
  if (!phone) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe um telefone válido.' });
  const storedPhone = storedLoginPhoneSql(sql`phone`);
  // One statement gives a consistent count and five events. UNIX_TIMESTAMP
  // returns the actual instant without depending on the Node/MySQL date parser.
  const result = await db.execute(sql`
    SELECT UNIX_TIMESTAMP(loginAt) * 1000 AS loginAtMs, COUNT(*) OVER () AS total
    FROM customerLoginHistory
    WHERE ${storedPhone} = ${phone}
    ORDER BY loginAt DESC, id DESC
    LIMIT 5
  `) as any;
  const records = result?.[0] || [];
  const recent = records.map((record: any) => Number(record.loginAtMs));
  return {
    total: Number(records[0]?.total || 0),
    recent,
    lastActivity: await getCustomerLastActivity(db, phone, recent[0] ?? null),
  };
}
