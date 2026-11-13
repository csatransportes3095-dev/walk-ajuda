/**
 * H2 Android: independent native-AVD queue and disposable proxy vault.
 * Does not touch H2ADS data, devices or worker processes.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import {
  encryptH2AdsProxy,
  decryptH2AdsProxy,
  isH2AdsProxyEncryptionReady,
  parseH2AdsProxyInput,
} from "../h2adsProxySecurity";

export const H2_ANDROID_MAX_RUNNING = 5;
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
let ready: Promise<void> | undefined;

export async function androidDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  if (!ready) ready = (async () => {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS h2_android_proxy_fingerprints (
      fingerprint CHAR(64) NOT NULL PRIMARY KEY,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS h2_android_proxies (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      fingerprint CHAR(64) NOT NULL UNIQUE,
      encryptedPayload TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'available',
      profileId VARCHAR(36) NULL UNIQUE,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_android_proxy_available (status, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS h2_android_native_agents_v2 (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      label VARCHAR(80) NOT NULL,
      tokenHash CHAR(64) NOT NULL UNIQUE,
      revoked TINYINT NOT NULL DEFAULT 0,
      computerName VARCHAR(120) NULL,
      version VARCHAR(32) NULL,
      lastSeenAt DATETIME NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS h2_android_pairings (
      codeHash CHAR(64) NOT NULL PRIMARY KEY,
      label VARCHAR(80) NOT NULL,
      expiresAt DATETIME NOT NULL,
      usedAt DATETIME NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS h2_android_native_profiles (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      label VARCHAR(80) NOT NULL,
      agentId VARCHAR(36) NOT NULL,
      proxyId BIGINT UNSIGNED NOT NULL UNIQUE,
      state VARCHAR(24) NOT NULL DEFAULT 'queued',
      observedIp VARCHAR(64) NULL,
      lastError VARCHAR(500) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_android_profiles_agent (agentId, state)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS h2_android_jobs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      profileId VARCHAR(36) NOT NULL,
      agentId VARCHAR(36) NOT NULL,
      action VARCHAR(16) NOT NULL,
      state VARCHAR(16) NOT NULL DEFAULT 'queued',
      claimedAt DATETIME NULL,
      completedAt DATETIME NULL,
      lastError VARCHAR(500) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_android_jobs_queue (agentId, state, id),
      INDEX idx_android_jobs_profile (profileId, state)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
  })().catch(error => { ready = undefined; throw error; });
  await ready;
  return db;
}

type DBRow = Record<string, any>;
const rows = (result: any): DBRow[] => (result?.[0] || []) as DBRow[];
const affected = (result: any): number => Number(result?.[0]?.affectedRows || 0);
const idSchema = z.object({ id: z.string().uuid() }).strict();

// Do not allocate legacy HTTP entries when the Windows agent requires SOCKS5.
// Keep row locks inside the caller's transaction to avoid duplicate reservations.
async function findAvailableSocks5Proxy(tx: any): Promise<number | null> {
  let afterId = 0;
  for (let page = 0; page < 100; page++) {
    const pool = rows(await tx.execute(sql`
      SELECT id, encryptedPayload FROM h2_android_proxies
      WHERE status='available' AND id > ${afterId}
      ORDER BY id LIMIT 100 FOR UPDATE
    `));
    if (!pool.length) return null;
    for (const row of pool) {
      afterId = Number(row.id);
      try {
        const proxy = decryptH2AdsProxy(String(row.encryptedPayload));
        if (String(proxy.protocol).toLowerCase() === 'socks5') return afterId;
      } catch { /* Invalid legacy record: never allocate it. */ }
    }
    if (pool.length < 100) return null;
  }
  throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Cofre muito grande para selecionar proxy SOCKS5 automaticamente.' });
}
async function onlineAgent(db: Awaited<ReturnType<typeof androidDb>>) {
  const list = rows(await db.execute(sql`
    SELECT id FROM h2_android_native_agents_v2
    WHERE revoked = 0 AND lastSeenAt >= DATE_SUB(NOW(), INTERVAL 75 SECOND)
    ORDER BY lastSeenAt DESC LIMIT 1
  `));
  return list[0]?.id as string | undefined;
}

export const h2AndroidRouter = router({
  overview: adminProcedure.query(async () => {
    const db = await androidDb();
    // Recover an abandoned boot after a bounded duration. Never delete an
    // AVD or release its reserved proxy while marking the command failed.
    await db.execute(sql`
      UPDATE h2_android_jobs j
      JOIN h2_android_native_profiles p ON p.id=j.profileId
      SET j.state='failed', j.completedAt=NOW(),
          j.lastError='Inicializacao excedeu 30 minutos.',
          p.state='error',
          p.lastError='Inicializacao excedeu 30 minutos. Android e proxy preservados.'
      WHERE j.state='claimed' AND j.action IN ('create','rebuild','start')
        AND j.createdAt < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        AND p.state IN ('provisioning','starting','queued')
    `);
    const [profilesResult, agentsResult, proxiesResult] = await Promise.all([
      db.execute(sql`SELECT p.id, p.label, p.state, p.observedIp, p.lastError,
        p.createdAt, a.label AS agentLabel, x.id AS proxyId, x.encryptedPayload AS proxyPayload
        FROM h2_android_native_profiles p
        JOIN h2_android_native_agents_v2 a ON a.id = p.agentId
        JOIN h2_android_proxies x ON x.id = p.proxyId
        ORDER BY p.createdAt DESC`),
      db.execute(sql`SELECT id, label, computerName, version, lastSeenAt, revoked,
        CASE WHEN revoked = 0 AND lastSeenAt IS NOT NULL
          AND lastSeenAt >= DATE_SUB(NOW(), INTERVAL 75 SECOND)
          THEN 1 ELSE 0 END AS onlineFromDb
        FROM h2_android_native_agents_v2 ORDER BY createdAt DESC LIMIT 10`),
      db.execute(sql`SELECT status, COUNT(*) AS total FROM h2_android_proxies GROUP BY status`),
    ]);
    const counts = { available: 0, assigned: 0 };
    for (const p of rows(proxiesResult)) if (p.status in counts) counts[p.status as keyof typeof counts] = Number(p.total);
    return {
      profiles: rows(profilesResult).map(p => ({
        id: String(p.id), label: String(p.label), state: String(p.state),
        observedIp: p.observedIp ? String(p.observedIp) : null,
        lastError: p.lastError ? String(p.lastError) : null,
        agentLabel: String(p.agentLabel),
        proxyId: Number(p.proxyId),
        // Admin sees destination and protocol only; never return usernames or passwords.
        proxyEndpoint: (() => {
          try {
            const cfg = decryptH2AdsProxy(String(p.proxyPayload));
            return { protocol: String(cfg.protocol).toUpperCase(), host: String(cfg.host), port: Number(cfg.port) };
          } catch { return null; }
        })(),
      })),
      agents: rows(agentsResult).map(a => ({
        id: String(a.id), label: String(a.label), computerName: a.computerName ? String(a.computerName) : null,
        version: a.version ? String(a.version) : null, revoked: Number(a.revoked) === 1,
        // Match server-side agent selection: avoid DATETIME timezone parsing and "0" string truthiness.
        online: Number(a.onlineFromDb) === 1,
      })),
      counts, maxSimultaneous: H2_ANDROID_MAX_RUNNING,
      encryptionReady: isH2AdsProxyEncryptionReady(),
    };
  }),

  importProxies: adminProcedure.input(z.object({
    proxies: z.string().trim().min(5).max(100_000),
  }).strict()).mutation(async ({ input }) => {
    if (!isH2AdsProxyEncryptionReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cofre criptografado indisponível no servidor." });
    const db = await androidDb();
    const lines = input.proxies.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length > 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Máximo de 1.000 proxies por importação." });
    let added = 0, duplicates = 0, invalid = 0;
    for (const line of lines) {
      try {
        // The Emulator receives a local HTTP relay; the upstream credentials are SOCKS5.
        // Never silently downgrade the user's SOCKS5 route to HTTP.
        const proxy = parseH2AdsProxyInput(line, "socks5");
        const fingerprint = hash([proxy.protocol, proxy.host, proxy.port, proxy.username, proxy.password].join("\u001f"));
        try {
          const inserted = await db.transaction(async tx => {
            // Permanent fingerprint ledger: a deleted proxy can never be reimported.
            const locked = await tx.execute(sql`INSERT IGNORE INTO h2_android_proxy_fingerprints (fingerprint)
              VALUES (${fingerprint})`);
            if (affected(locked) !== 1) return false;
            await tx.execute(sql`INSERT INTO h2_android_proxies
              (fingerprint, encryptedPayload, status)
              VALUES (${fingerprint}, ${encryptH2AdsProxy(proxy, null)}, 'available')`);
            return true;
          });
          if (inserted) added++; else duplicates++;
        } catch (error: any) {
          if (Number(error?.errno) === 1062 || /duplicate/i.test(String(error?.message))) duplicates++;
          else throw error;
        }
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        if (/duplicate/i.test(String(error?.message))) duplicates++;
        else if (/formato|configuração|valid|proxy/i.test(String(error?.message))) invalid++;
        else throw error;
      }
    }
    return { added, duplicates, invalid, total: lines.length };
  }),

  // Read-only vault browsing for ADM. Never return usernames/passwords to the browser.
  listProxies: adminProcedure.input(z.object({
    status: z.enum(["available", "assigned", "retired", "all"]),
    cursor: z.number().int().nonnegative().default(0),
  }).strict()).query(async ({ input }) => {
    const db = await androidDb();
    const result = rows(await db.execute(sql`
      SELECT x.id, x.status, x.encryptedPayload, p.label AS instanceLabel
      FROM h2_android_proxies x
      LEFT JOIN h2_android_native_profiles p ON p.proxyId = x.id
      WHERE x.id > ${input.cursor}
        AND (${input.status}='all' OR x.status=${input.status})
      ORDER BY x.id LIMIT 81
    `));
    const hasMore = result.length > 80;
    const page = result.slice(0, 80);
    return {
      proxies: page.map(p => {
        let endpoint: { protocol: string; host: string; port: number } | null = null;
        try {
          const proxy = decryptH2AdsProxy(String(p.encryptedPayload));
          endpoint = { protocol: String(proxy.protocol).toUpperCase(), host: String(proxy.host), port: Number(proxy.port) };
        } catch { /* Keep encrypted credentials on the server. */ }
        return {
          id: Number(p.id), status: String(p.status),
          instanceLabel: p.instanceLabel ? String(p.instanceLabel) : null,
          endpoint,
        };
      }),
      nextCursor: hasMore ? Number(page[page.length - 1]?.id) : null,
      hasMore,
    };
  }),

  // Deletion is explicitly requested by ADM. A proxy attached to ANY AVD is
  // protected, even if its status/assignment field is inconsistent.
  deleteProxies: adminProcedure.input(z.object({
    mode: z.enum(["selected", "allAvailable"]),
    ids: z.array(z.number().int().positive()).max(80).default([]),
    confirmed: z.literal(true),
  }).strict()).mutation(async ({ input }) => {
    const ids = Array.from(new Set(input.ids));
    if (input.mode === "selected" && (ids.length === 0 || ids.length !== input.ids.length)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione proxies únicos para excluir." });
    }
    if (input.mode === "allAvailable" && ids.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Limpar disponíveis não aceita seleção de IDs." });
    }
    const db = await androidDb();
    return db.transaction(async tx => {
      if (input.mode === "allAvailable") {
        const result = await tx.execute(sql`
          DELETE FROM h2_android_proxies
          WHERE status='available' AND profileId IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM h2_android_native_profiles p
            WHERE p.proxyId = h2_android_proxies.id
          )
        `);
        return { deleted: affected(result) };
      }
      let deleted = 0;
      // Each row is checked and deleted in the same transaction. Any conflict
      // rolls back the entire selection; no partial deletion is committed.
      for (const id of ids) {
        const result = await tx.execute(sql`
          DELETE FROM h2_android_proxies
          WHERE id=${id} AND status='available' AND profileId IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM h2_android_native_profiles p
            WHERE p.proxyId = h2_android_proxies.id
          )
        `);
        if (affected(result) !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Existe proxy ocupado, protegido ou já excluído. Nenhum item da seleção foi removido.",
          });
        }
        deleted++;
      }
      return { deleted };
    });
  }),
  createPairing: adminProcedure.input(z.object({
    label: z.string().trim().min(2).max(80),
  }).strict()).mutation(async ({ input }) => {
    const db = await androidDb();
    const code = randomBytes(12).toString("hex").toUpperCase();
    const codeHash = hash(code);
    await db.execute(sql`INSERT INTO h2_android_pairings (codeHash, label, expiresAt)
      VALUES (${codeHash}, ${input.label}, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`);
    return { code, expiresInMinutes: 10 };
  }),

  revokeAgent: adminProcedure.input(idSchema).mutation(async ({ input }) => {
    const db = await androidDb();
    await db.execute(sql`UPDATE h2_android_native_agents_v2 SET revoked=1 WHERE id=${input.id}`);
    return { success: true };
  }),

  createProfile: adminProcedure.input(z.object({
    label: z.string().trim().min(2).max(80),
  }).strict()).mutation(async ({ input }) => {
    if (!isH2AdsProxyEncryptionReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cofre de proxies indisponível." });
    const db = await androidDb();
    const agentId = await onlineAgent(db);
    if (!agentId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte o agente H2 Android no computador antes de criar." });
    const id = randomUUID();
    await db.transaction(async tx => {
      // Serialize commands per agent; enforce concurrency with no silent overbooking.
      const agentLock = rows(await tx.execute(sql`SELECT id FROM h2_android_native_agents_v2
        WHERE id=${agentId} AND revoked=0 FOR UPDATE`));
      if (!agentLock.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Agente desconectado ou revogado." });
      const active = rows(await tx.execute(sql`SELECT COUNT(*) AS total FROM h2_android_native_profiles
        WHERE agentId=${agentId} AND state IN ('queued','provisioning','starting','running')`));
      if (Number(active[0]?.total || 0) >= H2_ANDROID_MAX_RUNNING) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Limite de cinco Androids em execução ou preparação." });
      }
      const proxyId = await findAvailableSocks5Proxy(tx);
      if (!proxyId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não existem proxies SOCKS5 livres no cofre H2 Android." });
      const update = await tx.execute(sql`
        UPDATE h2_android_proxies SET status='assigned', profileId=${id}
        WHERE id=${proxyId} AND status='available'
      `);
      if (affected(update) !== 1) throw new TRPCError({ code: "CONFLICT", message: "Proxy reservado por outra operação." });
      await tx.execute(sql`INSERT INTO h2_android_native_profiles (id,label,agentId,proxyId,state)
        VALUES (${id}, ${input.label}, ${agentId}, ${proxyId}, 'queued')`);
      await tx.execute(sql`INSERT INTO h2_android_jobs (profileId,agentId,action,state)
        VALUES (${id}, ${agentId}, 'create', 'queued')`);
    });
    return { id, queued: true };
  }),

  // Rotate a stopped or failed device to the next unused proxy without changing its AVD.
  // Do not change a live proxy in the middle of Android traffic.
  rotateProxy: adminProcedure.input(idSchema).mutation(async ({ input }) => {
    const db = await androidDb();
    return db.transaction(async tx => {
      const profile = rows(await tx.execute(sql`
        SELECT id, agentId, proxyId, state FROM h2_android_native_profiles
        WHERE id=${input.id} FOR UPDATE
      `))[0];
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada." });
      const profileState = String(profile.state);
      if (!['stopped', 'error'].includes(profileState)) {
        throw new TRPCError({ code: "CONFLICT", message: "A troca automática só é permitida com o Android parado ou em erro." });
      }
      const pending = rows(await tx.execute(sql`
        SELECT id FROM h2_android_jobs WHERE profileId=${input.id}
          AND state IN ('queued','claimed') LIMIT 1 FOR UPDATE
      `));
      if (pending.length) throw new TRPCError({ code: "CONFLICT", message: "Aguarde o comando pendente terminar." });
      const oldId = Number(profile.proxyId);
      const oldProxy = rows(await tx.execute(sql`
        SELECT id, status, profileId FROM h2_android_proxies WHERE id=${oldId} FOR UPDATE
      `))[0];
      if (!oldProxy || String(oldProxy.profileId) !== input.id || String(oldProxy.status) !== "assigned") {
        throw new TRPCError({ code: "CONFLICT", message: "Reserva atual do proxy inconsistente. Nenhuma troca realizada." });
      }
      const nextId = await findAvailableSocks5Proxy(tx);
      if (!nextId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não há outro proxy SOCKS5 livre no cofre H2 Android." });
      // Enforce one proxy per profile; all changes roll back together on failure.
      const retired = await tx.execute(sql`
        UPDATE h2_android_proxies SET status='retired', profileId=NULL
        WHERE id=${oldId} AND status='assigned' AND profileId=${input.id}
      `);
      if (affected(retired) !== 1) throw new TRPCError({ code: "CONFLICT", message: "Proxy anterior não foi liberado da instância." });
      const reserved = await tx.execute(sql`
        UPDATE h2_android_proxies SET status='assigned', profileId=${input.id}
        WHERE id=${nextId} AND status='available'
      `);
      if (affected(reserved) !== 1) throw new TRPCError({ code: "CONFLICT", message: "Novo proxy ocupado; tente novamente." });
      const updated = await tx.execute(sql`
        UPDATE h2_android_native_profiles
        SET proxyId=${nextId}, observedIp=NULL, lastError=NULL
        WHERE id=${input.id} AND state=${profileState} AND proxyId=${oldId}
      `);
      if (affected(updated) !== 1) throw new TRPCError({ code: "CONFLICT", message: "Instância mudou de estado. Nenhuma troca realizada." });
      return { proxyId: nextId, previousProxyId: oldId };
    });
  }),

  renameProfile: adminProcedure.input(idSchema.extend({
    label: z.string().trim().min(2).max(80),
  })).mutation(async ({ input }) => {
    const db = await androidDb();
    await db.execute(sql`UPDATE h2_android_native_profiles SET label=${input.label} WHERE id=${input.id}`);
    return { success: true };
  }),

  command: adminProcedure.input(idSchema.extend({
    action: z.enum(["start", "stop", "delete", "retry", "configure"]),
  })).mutation(async ({ input }) => {
    const db = await androidDb();
    return db.transaction(async tx => {
      const existing = rows(await tx.execute(sql`
        SELECT id, agentId, state FROM h2_android_native_profiles WHERE id=${input.id} FOR UPDATE
      `))[0];
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Android não encontrado." });
      const pending = rows(await tx.execute(sql`
        SELECT id FROM h2_android_jobs WHERE profileId=${input.id}
        AND state IN ('queued','claimed') LIMIT 1
      `));
      if (pending.length) throw new TRPCError({ code: "CONFLICT", message: "Já existe um comando pendente para este aparelho." });
      const action = input.action === "retry" ? "rebuild" : input.action;
      if (existing.state === "deleting" && action !== "delete") {
        throw new TRPCError({ code: "CONFLICT", message: "Instância em exclusão." });
      }
      if (input.action === "retry" && existing.state !== "error") {
        throw new TRPCError({ code: "CONFLICT", message: "Use repetir somente quando houver erro de criação." });
      }
      if (action === "start" && !["ready","stopped","error"].includes(existing.state)) {
        throw new TRPCError({ code: "CONFLICT", message: "O Android ainda não está pronto para iniciar." });
      }
      if (action === "stop" && existing.state !== "running") {
        throw new TRPCError({ code: "CONFLICT", message: "O Android não consta como ligado." });
      }
      if (action === "configure" && existing.state !== "running") {
        throw new TRPCError({ code: "CONFLICT", message: "Ligue o Android antes de ajustar idioma e visual." });
      }
      if (action === "start" || action === "create") {
        const locked = rows(await tx.execute(sql`SELECT id FROM h2_android_native_agents_v2
          WHERE id=${existing.agentId} AND revoked=0 FOR UPDATE`));
        if (!locked.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Agente revogado." });
        const running = rows(await tx.execute(sql`
          SELECT COUNT(*) AS total FROM h2_android_native_profiles WHERE agentId=${existing.agentId}
          AND state IN ('queued','running','starting','provisioning')
        `));
        if (Number(running[0]?.total || 0) >= H2_ANDROID_MAX_RUNNING) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Limite de Androids simultâneos atingido." });
        }
      }
      const state = action === "configure" ? existing.state :
        action === "delete" ? "deleting" : action === "stop" ? "stopping" : action === "start" ? "starting" : "queued";
      await tx.execute(sql`UPDATE h2_android_native_profiles SET state=${state}, lastError=NULL WHERE id=${input.id}`);
      await tx.execute(sql`INSERT INTO h2_android_jobs (profileId,agentId,action,state)
        VALUES (${input.id}, ${existing.agentId}, ${action}, 'queued')`);
      return { queued: true };
    });
  }),
});

// Separate Windows agent credentials, kept out of the Admin cookie session.
export async function claimAndroidAgent(code: string, computerName: string, version: string) {
  const db = await androidDb();
  const token = randomBytes(32).toString("hex");
  const id = randomUUID();
  return db.transaction(async tx => {
    const pairing = rows(await tx.execute(sql`SELECT label FROM h2_android_pairings
      WHERE codeHash=${hash(code)} AND usedAt IS NULL AND expiresAt > NOW() FOR UPDATE`))[0];
    if (!pairing) return null;
    const used = await tx.execute(sql`UPDATE h2_android_pairings SET usedAt=NOW()
      WHERE codeHash=${hash(code)} AND usedAt IS NULL`);
    if (affected(used) !== 1) return null;
    await tx.execute(sql`INSERT INTO h2_android_native_agents_v2
      (id, label, tokenHash, computerName, version, lastSeenAt)
      VALUES (${id},${pairing.label},${hash(token)},
              ${computerName},${version},NOW())`);
    return { agentId: id, token };
  });
}

export async function authenticateAndroidAgent(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = await androidDb();
  const agents = rows(await db.execute(sql`
    SELECT id FROM h2_android_native_agents_v2 WHERE tokenHash=${hash(token)} AND revoked=0 LIMIT 1
  `));
  return agents[0] ? String(agents[0].id) : null;
}

export async function heartbeatAndroidAgent(
  agentId: string, computerName: string, version: string, jobId?: number,
) {
  const db = await androidDb();
  const result = await db.execute(sql`
    UPDATE h2_android_native_agents_v2
    SET lastSeenAt=NOW(), computerName=${computerName}, version=${version}
    WHERE id=${agentId} AND revoked=0
  `);
  const accepted = affected(result) === 1;
  if (accepted && jobId !== undefined) {
    // Keep the claimed task leased while the Windows agent is still processing it.
    await db.execute(sql`
      UPDATE h2_android_jobs SET claimedAt=NOW()
      WHERE id=${jobId} AND agentId=${agentId} AND state='claimed'
    `);
  }
  return { accepted };
}

export async function nextAndroidJob(agentId: string, computerName: string, version: string) {
  const db = await androidDb();
  return db.transaction(async tx => {
    await tx.execute(sql`UPDATE h2_android_native_agents_v2 SET lastSeenAt=NOW(),
      computerName=${computerName}, version=${version}
      WHERE id=${agentId} AND revoked=0`);
    // At-least-once delivery. All agent operations must be idempotent.
    await tx.execute(sql`UPDATE h2_android_jobs SET state='queued', claimedAt=NULL
      WHERE agentId=${agentId} AND state='claimed'
      AND claimedAt < DATE_SUB(NOW(), INTERVAL 4 MINUTE)`);
    const job = rows(await tx.execute(sql`
      SELECT id, profileId, action FROM h2_android_jobs
      WHERE agentId=${agentId} AND state='queued'
      ORDER BY id LIMIT 1 FOR UPDATE
    `))[0];
    if (!job) return { job: null };
    const claimed = await tx.execute(sql`UPDATE h2_android_jobs SET state='claimed', claimedAt=NOW()
      WHERE id=${job.id} AND state='queued'`);
    if (affected(claimed) !== 1) return { job: null };
    if (["create", "rebuild"].includes(String(job.action))) {
      await tx.execute(sql`UPDATE h2_android_native_profiles SET state='provisioning'
        WHERE id=${job.profileId} AND state<>'deleting'`);
    }
    const proxyRow = rows(await tx.execute(sql`SELECT x.id AS proxyId, x.encryptedPayload FROM h2_android_proxies x
      JOIN h2_android_native_profiles p ON p.proxyId=x.id
      WHERE p.id=${job.profileId} AND p.agentId=${agentId}
      LIMIT 1`))[0];
    if (!proxyRow) throw new Error("Proxy exclusivo da instância ausente.");
    const proxy = ["create","rebuild","start"].includes(String(job.action))
      ? decryptH2AdsProxy(String(proxyRow.encryptedPayload)) : null;
    return { job: { id: Number(job.id), profileId: String(job.profileId), proxyId: String(proxyRow.proxyId), action: String(job.action), proxy } };
  });
}

export async function finishAndroidJob(
  agentId: string,
  input: { jobId: number; success: boolean; error?: string; observedIp?: string },
) {
  const db = await androidDb();
  return db.transaction(async tx => {
    const job = rows(await tx.execute(sql`SELECT id, profileId, action, state
      FROM h2_android_jobs WHERE id=${input.jobId}
      AND agentId=${agentId} FOR UPDATE`))[0];
    if (!job) return { accepted: true }; // Deletion has already cleaned up the row.
    if (job.state === "done" || job.state === "failed") return { accepted: true };
    if (job.state !== "claimed") return { accepted: false };
    const error = input.success ? null : String(input.error || "Operação não concluída.").slice(0,500);
    await tx.execute(sql`UPDATE h2_android_jobs
      SET state=${input.success ? "done" : "failed"},
          lastError=${error},completedAt=NOW() WHERE id=${input.jobId}`);
    if (input.success && job.action === "delete") {
      // Remove the proxy permanently ONLY after local AVD/data deletion succeeded.
      await tx.execute(sql`DELETE FROM h2_android_proxies WHERE profileId=${job.profileId}`);
      await tx.execute(sql`DELETE FROM h2_android_jobs WHERE profileId=${job.profileId}`);
      await tx.execute(sql`DELETE FROM h2_android_native_profiles WHERE id=${job.profileId}`);
      return { accepted: true };
    }
    if (job.action === "configure") {
      // Cosmetic/language adjustment must not change a running Android to error,
      // clear its verified proxy IP, or alter its reserved proxy.
      await tx.execute(sql`UPDATE h2_android_native_profiles SET lastError=${error}
        WHERE id=${job.profileId} AND agentId=${agentId}`);
      return { accepted: true };
    }
    const state = !input.success ? (job.action === "delete" ? "deleting" : "error") :
      job.action === "stop" ? "stopped" : "running";
    await tx.execute(sql`UPDATE h2_android_native_profiles
      SET state=${state}, lastError=${error},
          observedIp=${input.observedIp?.slice(0,64) || null}
      WHERE id=${job.profileId} AND agentId=${agentId}`);
    return { accepted: true };
  });
}
