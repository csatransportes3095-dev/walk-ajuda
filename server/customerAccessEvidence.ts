import { sql } from "drizzle-orm";
import { normalizeCustomerPhone } from "./customerAccess";
import { storedLoginPhoneSql, type CustomerLoginHistoryExecutor } from "./customerLoginHistorySchema";

export type CustomerLastActivity = {
  at: number;
  source: "login" | "session" | "loan_request";
};

function isMissingTable(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: any = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (Number(current.errno) === 1146 || current.code === "ER_NO_SUCH_TABLE") return true;
    current = current.cause;
  }
  return false;
}

/** Read activity evidence without manufacturing additional authentication events. */
export async function getCustomerLastActivity(
  db: CustomerLoginHistoryExecutor,
  phoneInput: string,
  latestLoginAt: number | null,
): Promise<CustomerLastActivity | null> {
  const phone = normalizeCustomerPhone(phoneInput);
  if (!phone) return null;
  const now = Date.now();
  let latest: CustomerLastActivity | null = null;
  const consider = (at: number, source: CustomerLastActivity["source"]) => {
    if (Number.isFinite(at) && at > 0 && at <= now && (!latest || at > latest.at)) {
      latest = { at, source };
    }
  };
  if (latestLoginAt !== null) consider(latestLoginAt, "login");

  const sessionPhone = storedLoginPhoneSql(sql`phone`);
  const sessionResult = await db.execute(sql`
    SELECT MAX(UNIX_TIMESTAMP(lastAccessAt)) * 1000 AS lastActivityAt
    FROM customerPasswordSessions
    WHERE ${sessionPhone} = ${phone} AND lastAccessAt <= CURRENT_TIMESTAMP
  `) as any;
  consider(Number(sessionResult?.[0]?.[0]?.lastActivityAt), "session");

  // Only the authenticated customer request handlers create request:<loanId>
  // notices. An administrator can also create a loan, so loans.createdAt alone
  // is deliberately not treated as proof that the customer entered the site.
  // Invalid legacy payloads must not turn JSON extraction into a query failure.
  const validPayload = sql`IF(JSON_VALID(payload), payload, '{}')`;
  const payloadPhone = storedLoginPhoneSql(sql`JSON_UNQUOTE(JSON_EXTRACT(${validPayload}, '$.clientPhone'))`);
  let requestRows: any[];
  try {
    const requestResult = await db.execute(sql`
      SELECT eventKey, payload
      FROM loanAdminEmailOutbox
      WHERE eventKey LIKE 'request:%'
        AND JSON_UNQUOTE(JSON_EXTRACT(${validPayload}, '$.kind')) = 'request'
        AND ${payloadPhone} = ${phone}
      ORDER BY JSON_UNQUOTE(JSON_EXTRACT(${validPayload}, '$.submittedAt')) DESC, id DESC
      LIMIT 25
    `) as any;
    requestRows = requestResult?.[0] || [];
  } catch (error) {
    // Older installations can have no loan notification table yet. All other
    // failures are surfaced, rather than presenting an incomplete result as fresh.
    if (!isMissingTable(error)) throw error;
    return latest;
  }
  for (const row of requestRows) {
    let event: any;
    try { event = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload; }
    catch { continue; }
    if (!event || event.kind !== "request" ||
        !Number.isSafeInteger(event.loanId) || event.loanId <= 0 ||
        row.eventKey !== `request:${event.loanId}` ||
        normalizeCustomerPhone(event.clientPhone) !== phone ||
        typeof event.submittedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(event.submittedAt)) continue;
    const submittedAt = Date.parse(event.submittedAt);
    const canonicalIso = event.submittedAt.includes(".")
      ? event.submittedAt.replace(/\.(\d{1,3})Z$/, (_: string, fraction: string) => `.${fraction.padEnd(3, "0")}Z`)
      : event.submittedAt.replace(/Z$/, ".000Z");
    // Date.parse rolls impossible dates (for example February 30) forward.
    if (!Number.isFinite(submittedAt) || new Date(submittedAt).toISOString() !== canonicalIso) continue;
    consider(submittedAt, "loan_request");
  }
  return latest;
}
