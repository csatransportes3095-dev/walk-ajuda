
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { getSimilarPlateVariants, normalizeBrazilPlate, validBrazilPlate } from "../../shared/plateSimilarity";

const PROVIDER = "puxarplaca.com";
const HOURLY_LIMIT = 60;
const MIN_SECONDS_BETWEEN_CALLS = 61;
const parsedRows = (r: any): any[] => Array.isArray(r?.[0]) ? r[0] : [];
const idSchema = z.object({ id: z.number().int().positive() }).strict();

let initialized: Promise<void> | null = null;
async function database() {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponivel." });
  if (!initialized) {
    initialized = (async () => {
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS plate_similarity_runs (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        basePlate VARCHAR(7) NOT NULL,
        nextIndex SMALLINT NOT NULL DEFAULT 0,
        total SMALLINT NOT NULL DEFAULT 0,
        status VARCHAR(24) NOT NULL DEFAULT 'paused',
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_plate_similarity_runs_date (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`));
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS plate_similarity_results (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        runId INT NOT NULL,
        plate VARCHAR(7) NOT NULL,
        changedPosition TINYINT NOT NULL,
        oldLetter CHAR(1) NOT NULL,
        newLetter CHAR(1) NOT NULL,
        outcome VARCHAR(24) NOT NULL,
        source VARCHAR(40) NOT NULL,
        model VARCHAR(130) NULL,
        color VARCHAR(40) NULL,
        modelYear VARCHAR(10) NULL,
        checkedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_plate_similarity_run_plate (runId, plate),
        KEY idx_plate_similarity_results_date (checkedAt),
        KEY idx_plate_similarity_results_plate (plate)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`));
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS plate_similarity_api_calls (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        runId INT NOT NULL,
        plate VARCHAR(7) NOT NULL,
        calledAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_plate_similarity_api_calls_time (calledAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`));
      // Um slot compartilhado por todas as sequencias evita corridas entre abas.
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS plate_similarity_rate_gate (
        id TINYINT NOT NULL PRIMARY KEY,
        nextAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`));
      await db.execute(sql`INSERT IGNORE INTO plate_similarity_rate_gate (id,nextAt) VALUES (1,NOW())`);
    })().catch(e => { initialized = null; throw e; });
  }
  await initialized;
  return db;
}

/**
 * O portal anuncia 60 chamadas/hora, mas NAO documenta publicamente o
 * endpoint de placa nem o contrato da resposta. Nunca adivinhar endpoint
 * nem interpretar ausencia de dados como placa inexistente.
 * Exige URL autorizada com placeholder {plate} e token SOMENTE no servidor.
 */
function providerConfig() {
  const template = (process.env.PUXARPLACA_PLATE_URL_TEMPLATE || "").trim();
  const token = (process.env.PUXARPLACA_API_TOKEN || "").trim();
  if (!template || !token || !template.includes("{plate}")) return null;
  try {
    const probe = new URL(template.replace("{plate}", "ABC1D23"));
    if (probe.protocol !== "https:" ||
        !["puxarplaca.com", "www.puxarplaca.com"].includes(probe.hostname) ||
        !probe.pathname.startsWith("/api/") ||
        probe.username || probe.password) return null;
    return { template, token };
  } catch { return null; }
}

function providerResult(payload: any, expectedPlate: string) {
  // Aceitar somente uma resposta com placa correspondente E sinal
  // inequívoco de encontro/não encontro. Estimativas não são prova.
  if (!payload || typeof payload !== "object") return { outcome: "inconclusive" as const };
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  if (data.estimated === true || data.estimado === true || payload.estimated === true ||
      payload.estimado === true) return { outcome: "inconclusive" as const };
  const returned = normalizeBrazilPlate(String(data.plate || data.placa || ""));
  if (returned && returned !== expectedPlate) return { outcome: "inconclusive" as const };
  const explicit = data.exists ?? data.found ?? data.encontrada ?? data.encontrado ??
    payload.exists ?? payload.found ?? payload.encontrada ?? payload.encontrado;
  const status = String(data.status ?? payload.status ?? "").toLowerCase();
  const absent = explicit === false || ["not_found", "nao_encontrada", "nao_localizada"].includes(status);
  if (absent) return { outcome: "not_found" as const };
  if (returned === expectedPlate && (explicit === true || ["found", "encontrada", "localizada"].includes(status))) {
    return {
      outcome: "found" as const,
      model: String(data.modelo || data.model || "").slice(0, 130),
      color: String(data.cor || data.color || "").slice(0, 40),
      modelYear: String(data.anoModelo || data.modelYear || data.ano || "").slice(0, 10),
    };
  }
  return { outcome: "inconclusive" as const };
}

async function getRun(db: any, id: number) {
  // Recupera verificacoes interrompidas por queda do servidor, sem pular placas.
  await db.execute(sql`UPDATE plate_similarity_runs SET status='paused_error'
    WHERE id=${id} AND status IN ('checking','stop_requested')
    AND updatedAt < DATE_SUB(NOW(), INTERVAL 2 MINUTE)`);
  const row = parsedRows(await db.execute(sql`SELECT id,basePlate,nextIndex,total,status,createdAt,updatedAt
    FROM plate_similarity_runs WHERE id=${id} LIMIT 1`))[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sequencia nao encontrada." });
  const variants = getSimilarPlateVariants(String(row.basePlate));
  const nextIndex = Number(row.nextIndex);
  return {
    id: Number(row.id), basePlate: String(row.basePlate), nextIndex,
    total: Number(row.total), status: String(row.status),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    next: variants[nextIndex] || null,
  };
}

async function quota(db: any) {
  const used = parsedRows(await db.execute(sql`SELECT COUNT(*) AS used
    FROM plate_similarity_api_calls WHERE calledAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`));
  const latest = parsedRows(await db.execute(sql`SELECT TIMESTAMPDIFF(SECOND,calledAt,NOW()) AS secondsAgo
    FROM plate_similarity_api_calls ORDER BY id DESC LIMIT 1`))[0];
  const secondsAgo = latest ? Math.max(0, Number(latest.secondsAgo || 0)) : 10_000;
  const oldest = parsedRows(await db.execute(sql`SELECT TIMESTAMPDIFF(SECOND,calledAt,NOW()) AS secondsAgo
    FROM plate_similarity_api_calls WHERE calledAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
    ORDER BY calledAt ASC LIMIT 1`))[0];
  const gate = parsedRows(await db.execute(sql`SELECT GREATEST(0,
    TIMESTAMPDIFF(SECOND,NOW(),nextAt)) AS waitSeconds FROM plate_similarity_rate_gate WHERE id=1`))[0];
  const waitFromGate = Math.max(0,Number(gate?.waitSeconds || 0));
  const count = Number(used[0]?.used || 0);
  const waitFromHourly = count >= HOURLY_LIMIT
    ? Math.max(1, 3600 - Number(oldest?.secondsAgo || 0)) : 0;
  return {
    used: count,
    limit: HOURLY_LIMIT,
    retryAfterSeconds: Math.max(waitFromHourly, MIN_SECONDS_BETWEEN_CALLS - secondsAgo, waitFromGate, 0),
  };
}

export const plateSimilarityRouter = router({
  provider: adminProcedure.query(async () => {
    const db = await database();
    return { name: PROVIDER, configured: Boolean(providerConfig()), ...(await quota(db)) };
  }),
  create: adminProcedure.input(z.object({ plate: z.string().min(1).max(16) }).strict())
    .mutation(async ({ input }) => {
      const plate = normalizeBrazilPlate(input.plate);
      if (!validBrazilPlate(plate)) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe uma placa brasileira valida." });
      const list = getSimilarPlateVariants(plate);
      if (!list.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma troca visual disponivel." });
      const db = await database();
      const result = await db.execute(sql`INSERT INTO plate_similarity_runs(basePlate,total,status)
        VALUES (${plate},${list.length},'paused')`);
      const id = Number((result[0] as any)?.insertId || 0);
      if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Nao foi possivel criar a sequencia." });
      return getRun(db, id);
    }),
  recent: adminProcedure.query(async () => {
    const db = await database();
    const data = parsedRows(await db.execute(sql`SELECT id,basePlate,nextIndex,total,status,createdAt
      FROM plate_similarity_runs ORDER BY id DESC LIMIT 20`));
    return data.map((x: any) => ({
      id: Number(x.id), basePlate: String(x.basePlate), nextIndex: Number(x.nextIndex),
      total: Number(x.total), status: String(x.status), createdAt: x.createdAt,
    }));
  }),
  details: adminProcedure.input(idSchema).query(async ({ input }) => {
    const db = await database();
    const run = await getRun(db, input.id);
    const data = parsedRows(await db.execute(sql`SELECT plate,changedPosition,oldLetter,newLetter,
      outcome,source,model,color,modelYear,checkedAt FROM plate_similarity_results
      WHERE runId=${input.id} ORDER BY id DESC LIMIT 200`));
    return {
      ...run,
      results: data.map((x: any) => ({
        plate: String(x.plate), position: Number(x.changedPosition),
        original: String(x.oldLetter), replacement: String(x.newLetter),
        outcome: String(x.outcome), source: String(x.source),
        model: x.model ? String(x.model) : null,
        color: x.color ? String(x.color) : null,
        modelYear: x.modelYear ? String(x.modelYear) : null,
        checkedAt: x.checkedAt,
      })),
    };
  }),
  pause: adminProcedure.input(idSchema).mutation(async ({ input }) => {
    const db = await database();
    await db.execute(sql`UPDATE plate_similarity_runs
      SET status=CASE WHEN status='checking' THEN 'stop_requested' ELSE 'paused' END
      WHERE id=${input.id} AND status IN ('running','waiting','paused','checking','stop_requested')`);
    return getRun(db, input.id);
  }),
  resume: adminProcedure.input(idSchema).mutation(async ({ input }) => {
    if (!providerConfig()) throw new TRPCError({ code: "PRECONDITION_FAILED",
      message: "API indisponivel: falta endpoint autorizado e/ou token no servidor." });
    const db = await database();
    const run = await getRun(db, input.id);
    if (run.nextIndex >= run.total) throw new TRPCError({ code: "BAD_REQUEST", message: "Sequencia concluida." });
    await db.execute(sql`UPDATE plate_similarity_runs SET status='running' WHERE id=${input.id}
      AND status IN ('paused','paused_not_found','paused_error','waiting')`);
    return getRun(db, input.id);
  }),
  recordManual: adminProcedure.input(z.object({
    id: z.number().int().positive(), plate: z.string().min(7).max(7),
    outcome: z.enum(["found","not_found","inconclusive"]),
  }).strict()).mutation(async ({ input }) => {
    const db = await database();
    const run = await getRun(db, input.id);
    if (!run.next || run.next.plate !== normalizeBrazilPlate(input.plate)) {
      throw new TRPCError({ code: "CONFLICT", message: "Atualize a sequencia: esta nao e a proxima placa." });
    }
    if (run.status === "running" || run.status === "checking" || run.status === "stop_requested") {
      throw new TRPCError({ code: "CONFLICT", message: "Pause a consulta automatica antes de confirmar manualmente." });
    }
    try {
      await db.execute(sql`INSERT INTO plate_similarity_results
        (runId,plate,changedPosition,oldLetter,newLetter,outcome,source)
        VALUES (${input.id},${run.next.plate},${run.next.position},
          ${run.next.original},${run.next.replacement},${input.outcome},'manual')`);
    } catch {
      throw new TRPCError({ code: "CONFLICT", message: "Esta variacao ja foi registrada." });
    }
    const after = run.nextIndex + 1;
    const status = input.outcome === "not_found" ? "paused_not_found" :
      after >= run.total ? "completed" : "paused";
    await db.execute(sql`UPDATE plate_similarity_runs SET nextIndex=${after},status=${status}
      WHERE id=${input.id} AND nextIndex=${run.nextIndex}`);
    return getRun(db, input.id);
  }),
  step: adminProcedure.input(idSchema).mutation(async ({ input }) => {
    const config = providerConfig();
    if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED",
      message: "Sem API conectada: confirme o endpoint e a chave do PuxarPlaca." });
    const db = await database();
    const run = await getRun(db, input.id);
    if (run.status !== "running") return { action: "paused" as const, run };
    if (!run.next) {
      await db.execute(sql`UPDATE plate_similarity_runs SET status='completed' WHERE id=${input.id}`);
      return { action: "completed" as const, run: await getRun(db, input.id) };
    }
    const q = await quota(db);
    if (q.retryAfterSeconds > 0) {
      await db.execute(sql`UPDATE plate_similarity_runs SET status='waiting' WHERE id=${input.id}`);
      return { action: "waiting" as const, retryAfterSeconds: q.retryAfterSeconds, run: await getRun(db, input.id) };
    }
    // LOCK: impede uma segunda aba de consumir a mesma variacao.
    const locked = await db.execute(sql`UPDATE plate_similarity_runs SET status='checking'
      WHERE id=${input.id} AND status='running' AND nextIndex=${run.nextIndex}`);
    if (Number((locked[0] as any)?.affectedRows || 0) !== 1) {
      return { action: "paused" as const, run: await getRun(db, input.id) };
    }
    // Reserva global atomica: nao ultrapassa a cota em consultas simultaneas.
    const gate = await db.execute(sql`UPDATE plate_similarity_rate_gate
      SET nextAt=DATE_ADD(NOW(), INTERVAL 61 SECOND)
      WHERE id=1 AND nextAt<=NOW()`);
    if (Number((gate[0] as any)?.affectedRows || 0) !== 1) {
      await db.execute(sql`UPDATE plate_similarity_runs SET status='waiting'
        WHERE id=${input.id} AND status='checking'`);
      const wait = await quota(db);
      return { action: "waiting" as const, retryAfterSeconds: Math.max(2,wait.retryAfterSeconds),
        run: await getRun(db,input.id) };
    }
    let outcome: "found" | "not_found" | "inconclusive" = "inconclusive";
    let model = "", color = "", modelYear = "";
    try {
      const url = new URL(config.template.replace("{plate}", encodeURIComponent(run.next.plate)));
      // Validar novamente a URL FINAL; nao permitir outro host via variavel de ambiente.
      if (url.protocol !== "https:" ||
          !["puxarplaca.com", "www.puxarplaca.com"].includes(url.hostname) ||
          !url.pathname.startsWith("/api/")) throw new Error("Endpoint nao autorizado.");
      await db.execute(sql`INSERT INTO plate_similarity_api_calls(runId,plate)
        VALUES (${input.id},${run.next.plate})`);
      const response = await fetch(url, {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(12_000),
        headers: { Authorization: "Bearer " + config.token, Accept: "application/json" },
      });
      if (!response.ok) throw new Error("API respondeu HTTP " + response.status);
      const raw = await response.text();
      if (raw.length > 80_000) throw new Error("Resposta da API excedeu o tamanho esperado.");
      const parsed = providerResult(JSON.parse(raw), run.next.plate);
      outcome = parsed.outcome;
      model = "model" in parsed ? String(parsed.model || "") : "";
      color = "color" in parsed ? String(parsed.color || "") : "";
      modelYear = "modelYear" in parsed ? String(parsed.modelYear || "") : "";
      if (outcome === "inconclusive") throw new Error("Retorno da API nao confirma a situacao da placa.");
    } catch (e) {
      await db.execute(sql`UPDATE plate_similarity_runs SET status='paused_error' WHERE id=${input.id} AND status IN ('checking','stop_requested')`);
      return { action: "error" as const, message: e instanceof Error ? e.message : "Falha na consulta", run: await getRun(db, input.id) };
    }
    await db.execute(sql`INSERT INTO plate_similarity_results
      (runId,plate,changedPosition,oldLetter,newLetter,outcome,source,model,color,modelYear)
      VALUES (${input.id},${run.next.plate},${run.next.position},${run.next.original},
        ${run.next.replacement},${outcome},${PROVIDER},
        ${model || null},${color || null},${modelYear || null})`);
    const nextIndex = run.nextIndex + 1;
    const status = outcome === "not_found" ? "paused_not_found" :
      nextIndex >= run.total ? "completed" : "running";
    await db.execute(sql`UPDATE plate_similarity_runs SET nextIndex=${nextIndex},
      status=CASE WHEN status='stop_requested' AND ${outcome} <> 'not_found'
        THEN 'paused' ELSE ${status} END
      WHERE id=${input.id} AND status IN ('checking','stop_requested')`);
    return { action: "checked" as const, outcome, plate: run.next.plate, run: await getRun(db, input.id) };
  }),
});
