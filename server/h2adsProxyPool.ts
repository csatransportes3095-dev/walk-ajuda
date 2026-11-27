import { createHash } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { h2AdsInstanceProxyCredentials, h2AdsProxyPool, type H2AdsProxyPool } from "../drizzle/schema";
import { getDb } from "./db";
import { decryptH2AdsProxy, encryptH2AdsProxy, parseH2AdsProxyInput } from "./h2adsProxySecurity";
import type { H2AdsProxyProtocol } from "../shared/h2adsProxyInput";

export type H2AdsProxyPoolSafeRow = Pick<
  H2AdsProxyPool,
  "id" | "protocol" | "status" | "assignedInstanceId" | "lastErrorCategory" | "assignedAt" | "consumedAt" | "createdAt" | "updatedAt"
>;

export type H2AdsReservedProxy = {
  id: number;
  encryptedPayload: string;
  protocol: string;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para a fila de proxies H2ADS.");
  return db;
}

function proxyFingerprint(parsed: { protocol: string; host: string; port: number; username: string; password: string }) {
  return createHash("sha256")
    .update([parsed.protocol, parsed.host, String(parsed.port), parsed.username, parsed.password].join("\u001f"), "utf8")
    .digest("hex");
}

export async function importH2AdsProxyPool(input: {
  proxies: string;
  proxyProtocol: H2AdsProxyProtocol;
}) {
  const db = await requireDb();
  const lines = input.proxies
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) throw new Error("Cole pelo menos um proxy para adicionar à fila.");
  if (lines.length > 1000) throw new Error("Adicione no máximo 1000 proxies por vez.");

  let added = 0;
  let duplicates = 0;
  let invalid = 0;

  for (const line of lines) {
    let parsed;
    try {
      parsed = parseH2AdsProxyInput(line, input.proxyProtocol);
    } catch {
      invalid += 1;
      continue;
    }

    const fingerprint = proxyFingerprint(parsed);
    const existing = await db
      .select({ id: h2AdsProxyPool.id })
      .from(h2AdsProxyPool)
      .where(eq(h2AdsProxyPool.fingerprint, fingerprint))
      .limit(1);

    if (existing[0]) {
      duplicates += 1;
      continue;
    }

    const encryptedPayload = encryptH2AdsProxy(parsed, null);
    try {
      await db.insert(h2AdsProxyPool).values({
        fingerprint,
        cipherVersion: "v1",
        encryptedPayload,
        protocol: parsed.protocol,
        status: "available",
      });
      added += 1;
    } catch (error: any) {
      if (String(error?.code || "").includes("DUP") || Number(error?.errno) === 1062) {
        duplicates += 1;
        continue;
      }
      throw error;
    }
  }

  return { added, duplicates, invalid, total: lines.length };
}

export async function listH2AdsProxyPool() {
  const db = await requireDb();
  const rows = await db
    .select({
      id: h2AdsProxyPool.id,
      protocol: h2AdsProxyPool.protocol,
      status: h2AdsProxyPool.status,
      assignedInstanceId: h2AdsProxyPool.assignedInstanceId,
      lastErrorCategory: h2AdsProxyPool.lastErrorCategory,
      assignedAt: h2AdsProxyPool.assignedAt,
      consumedAt: h2AdsProxyPool.consumedAt,
      createdAt: h2AdsProxyPool.createdAt,
      updatedAt: h2AdsProxyPool.updatedAt,
    })
    .from(h2AdsProxyPool)
    .orderBy(asc(h2AdsProxyPool.id));

  const counts = { available: 0, assigned: 0, used: 0, failed: 0, disabled: 0 };
  for (const row of rows) counts[row.status] += 1;

  return {
    counts,
    total: rows.length,
    rows: rows.slice(-100).reverse(),
  };
}

/**
 * Delete inactive pool history so the admin can upload new proxies.
 * Protect every currently configured route by comparing the encrypted
 * credentials' decrypted fingerprints INSIDE the server, without exposing
 * any addresses or passwords to the UI or logs.
 *
 * The transaction locks pool candidates BEFORE checking current credentials.
 * A concurrent reservation cannot turn an available proxy into an active
 * assignment between this check and the deletion.
 */
const H2ADS_POOL_CLEANUP_STATUSES = ["available", "used", "failed", "disabled"] as const;
type H2AdsPoolCleanupStatus = typeof H2ADS_POOL_CLEANUP_STATUSES[number];

export function isH2AdsProxyUnusedForDeletion(
  row: { status: string; fingerprint: string },
  currentCredentials: ReadonlySet<string>,
): boolean {
  return H2ADS_POOL_CLEANUP_STATUSES.some(status => status === row.status)
    && !currentCredentials.has(row.fingerprint);
}

export async function deleteUnusedH2AdsProxyPool(): Promise<{
  deleted: number;
  protected: number;
  examined: number;
}> {
  const db = await requireDb();
  return db.transaction(async tx => {
    // FOR UPDATE serializes cleanup with reservations, including failed
    // / used historical rows. Never touch a row still marked "assigned".
    const result = await tx.execute(sql`
      SELECT id, fingerprint, status FROM h2ads_proxy_pool
      WHERE status IN ('available', 'used', 'failed', 'disabled')
      FOR UPDATE
    `);
    const candidates = (result[0] ?? []) as unknown as Array<{
      id: number;
      fingerprint: string;
      status: H2AdsPoolCleanupStatus;
    }>;
    if (!candidates.length) return { deleted: 0, protected: 0, examined: 0 };

    // Fail closed on any missing encryption key / corrupt credential.
    // A "used" pool row can still be an active browser route after an
    // interrupted rotation, so pool.status ALONE is not a safe signal.
    const credentials = await tx.select({
      encryptedPayload: h2AdsInstanceProxyCredentials.encryptedPayload,
    }).from(h2AdsInstanceProxyCredentials);
    const currentFingerprints = new Set<string>();
    for (const credential of credentials) {
      currentFingerprints.add(proxyFingerprint(decryptH2AdsProxy(credential.encryptedPayload)));
    }

    const eligibleIds: number[] = [];
    for (const candidate of candidates) {
      if (isH2AdsProxyUnusedForDeletion(candidate, currentFingerprints)) {
        eligibleIds.push(Number(candidate.id));
      }
    }

    // Recheck status at the moment of DELETE; never delete an assigned row.
    let deleted = 0;
    for (let i = 0; i < eligibleIds.length; i += 200) {
      const batch = eligibleIds.slice(i, i + 200);
      const removed = await tx.delete(h2AdsProxyPool).where(and(
        inArray(h2AdsProxyPool.id, batch),
        inArray(h2AdsProxyPool.status, [...H2ADS_POOL_CLEANUP_STATUSES]),
      ));
      deleted += Number(removed[0].affectedRows || 0);
    }
    return {
      deleted,
      protected: candidates.length - eligibleIds.length,
      examined: candidates.length,
    };
  });
}

export async function reserveH2AdsProxyForInstance(
  instanceId: number,
  retainPrevious = false,
  requiredProtocol: H2AdsProxyProtocol = "socks5",
): Promise<H2AdsReservedProxy | null> {
  const db = await requireDb();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidates = await db
      .select({
        id: h2AdsProxyPool.id,
        encryptedPayload: h2AdsProxyPool.encryptedPayload,
        protocol: h2AdsProxyPool.protocol,
      })
      .from(h2AdsProxyPool)
      .where(and(
        eq(h2AdsProxyPool.status, "available"),
        eq(h2AdsProxyPool.protocol, requiredProtocol),
      ))
      .orderBy(asc(h2AdsProxyPool.id))
      .limit(1);

    const candidate = candidates[0];
    if (!candidate) return null;

    const now = new Date();
    const updated = await db
      .update(h2AdsProxyPool)
      .set({
        status: "assigned",
        assignedInstanceId: instanceId,
        assignedAt: now,
        consumedAt: null,
        lastErrorCategory: null,
      })
      .where(and(eq(h2AdsProxyPool.id, candidate.id), eq(h2AdsProxyPool.status, "available")));

    if (Number(updated[0].affectedRows) !== 1) continue;

    // During live route swaps keep the previously assigned proxy available
    // until the candidate has passed validation and been committed.
    if (!retainPrevious) {
      await markH2AdsOtherAssignedProxiesUsed(instanceId, candidate.id);
    }

    return candidate;
  }

  throw new Error("A fila de proxies recebeu outra reserva ao mesmo tempo. Tente novamente.");
}

export async function markH2AdsOtherAssignedProxiesUsed(instanceId: number, keepId: number) {
  const db = await requireDb();
  await db.update(h2AdsProxyPool)
    .set({ status: "used", consumedAt: new Date() })
    .where(and(
      eq(h2AdsProxyPool.assignedInstanceId, instanceId),
      eq(h2AdsProxyPool.status, "assigned"),
      ne(h2AdsProxyPool.id, keepId),
    ));
}

export async function markH2AdsProxyFailed(poolId: number, errorCategory: string) {
  const db = await requireDb();
  await db
    .update(h2AdsProxyPool)
    .set({
      status: "failed",
      consumedAt: new Date(),
      lastErrorCategory: errorCategory.slice(0, 64),
    })
    .where(eq(h2AdsProxyPool.id, poolId));
}

export async function markH2AdsProxyUsedByInstance(instanceId: number) {
  const db = await requireDb();
  await db
    .update(h2AdsProxyPool)
    .set({ status: "used", consumedAt: new Date() })
    .where(and(
      eq(h2AdsProxyPool.assignedInstanceId, instanceId),
      eq(h2AdsProxyPool.status, "assigned"),
    ));
}
