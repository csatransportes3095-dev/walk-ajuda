import { and, eq, inArray } from "drizzle-orm";
import {
  h2AdsBrowserWorkers,
  h2AdsInstanceBrowserRuns,
  h2AdsWorkerBrowserCommands,
  h2AdsWorkerCommands,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  getH2AdsNetworkProfile,
  recordH2AdsNetworkValidation,
  requestH2AdsBrowserPreparation,
  saveH2AdsNetworkProfile,
  saveH2AdsProxyCredential,
} from "./h2ads";
import { assignH2AdsInstanceWorkerPortable } from "./h2adsProfilePortability";
import { decryptH2AdsProxy } from "./h2adsProxySecurity";
import { classifyH2AdsRouteFailure, getH2AdsRouteMismatches, validateH2AdsProxyRoute } from "./h2adsProxyValidation";
import {
  markH2AdsProxyFailed,
  reserveH2AdsProxyForInstance,
} from "./h2adsProxyPool";

export type H2AdsAutoProvisionResult = {
  status: "preparing" | "awaiting_proxy" | "proxy_failed" | "worker_unavailable";
  instanceId: number;
  proxyPoolId?: number;
  workerId?: number;
  message: string;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para o provisionamento automático H2ADS.");
  return db;
}

async function resolveWalk1Worker() {
  const db = await requireDb();
  const workers = await db
    .select()
    .from(h2AdsBrowserWorkers)
    .where(eq(h2AdsBrowserWorkers.status, "active"));

  const worker = workers.find((item) => item.name.trim().toLocaleLowerCase("pt-BR") === "walk1");
  if (!worker) return null;

  const online = Boolean(worker.lastSeenAt && Date.now() - worker.lastSeenAt.getTime() <= 70_000);
  return { ...worker, online };
}

async function assertProxySwapAllowed(instanceId: number) {
  const db = await requireDb();
  const runs = await db
    .select({ state: h2AdsInstanceBrowserRuns.state })
    .from(h2AdsInstanceBrowserRuns)
    .where(eq(h2AdsInstanceBrowserRuns.instanceId, instanceId))
    .limit(1);

  const state = runs[0]?.state;
  if (state === "browser_open") throw new Error("Feche o browser antes de trocar o proxy.");
  if (state === "queued" || state === "preparing") throw new Error("A preparação desta instância ainda está em andamento.");

  const [prep, browser] = await Promise.all([
    db.select({ id: h2AdsWorkerCommands.id })
      .from(h2AdsWorkerCommands)
      .where(and(
        eq(h2AdsWorkerCommands.instanceId, instanceId),
        inArray(h2AdsWorkerCommands.status, ["queued", "claimed"]),
      ))
      .limit(1),
    db.select({ id: h2AdsWorkerBrowserCommands.id })
      .from(h2AdsWorkerBrowserCommands)
      .where(and(
        eq(h2AdsWorkerBrowserCommands.instanceId, instanceId),
        inArray(h2AdsWorkerBrowserCommands.status, ["queued", "claimed"]),
      ))
      .limit(1),
  ]);

  if (prep[0] || browser[0]) throw new Error("Existe um comando H2ADS em andamento. Aguarde antes de trocar o proxy.");
}

async function resetPreparationState(instanceId: number) {
  const db = await requireDb();
  await db
    .update(h2AdsInstanceBrowserRuns)
    .set({
      state: "not_prepared",
      observedIp: null,
      lastErrorCategory: null,
      preparedAt: null,
      lastChangedAt: new Date(),
    })
    .where(eq(h2AdsInstanceBrowserRuns.instanceId, instanceId));
}

async function attachAndValidateReservedProxy(instanceId: number, reserved: { id: number; encryptedPayload: string }) {
  await saveH2AdsProxyCredential(instanceId, reserved.encryptedPayload);
  await saveH2AdsNetworkProfile(instanceId, {
    providerName: "Fila H2ADS",
    routeLabel: `POOL-${reserved.id}`,
    setupStatus: "metadata_ready",
    healthStatus: "not_checked",
    observedIp: null,
    observedCountryCode: null,
    observedCity: null,
    observedIsp: null,
    observedAsn: null,
    latencyMs: null,
    lastCheckedAt: null,
    lastCheckMessage: "Proxy reservado da fila; aguardando validação.",
  });

  const profile = await getH2AdsNetworkProfile(instanceId);

  try {
    const observed = await validateH2AdsProxyRoute(decryptH2AdsProxy(reserved.encryptedPayload));
    const mismatches = getH2AdsRouteMismatches(observed, {
      expectedIsp: profile?.expectedIsp ?? null,
      expectedAsn: profile?.expectedAsn ?? null,
    });
    if (mismatches.length) {
      await recordH2AdsNetworkValidation(instanceId, {
        healthStatus: "blocked",
        observedIp: observed.ip,
        observedCountryCode: observed.countryCode,
        observedCity: observed.city,
        observedIsp: observed.isp,
        observedAsn: observed.asn,
        latencyMs: observed.latencyMs,
        lastCheckMessage: `Divergência em ${mismatches.join(", ")}.`,
      });
      await markH2AdsProxyFailed(reserved.id, "route_mismatch");
      return { ok: false as const, error: "O novo proxy divergiu da rota esperada." };
    }

    await recordH2AdsNetworkValidation(instanceId, {
      healthStatus: "healthy",
      observedIp: observed.ip,
      observedCountryCode: observed.countryCode,
      observedCity: observed.city,
      observedIsp: observed.isp,
      observedAsn: observed.asn,
      latencyMs: observed.latencyMs,
      lastCheckMessage: "Validação automática concluída.",
    });
    return { ok: true as const };
  } catch (error) {
    const failure = classifyH2AdsRouteFailure(error);
    await recordH2AdsNetworkValidation(instanceId, {
      healthStatus: "failed",
      observedIp: null,
      observedCountryCode: null,
      observedCity: null,
      observedIsp: null,
      observedAsn: null,
      latencyMs: null,
      lastCheckMessage: failure.message,
    });
    await markH2AdsProxyFailed(reserved.id, failure.code || "proxy_unavailable");
    return { ok: false as const, error: failure.message };
  }
}

export async function autoProvisionH2AdsInstance(instanceId: number): Promise<H2AdsAutoProvisionResult> {
  const reserved = await reserveH2AdsProxyForInstance(instanceId);
  if (!reserved) {
    return {
      status: "awaiting_proxy",
      instanceId,
      message: "Instância criada. A fila de proxies está vazia.",
    };
  }

  const checked = await attachAndValidateReservedProxy(instanceId, reserved);
  if (!checked.ok) {
    return {
      status: "proxy_failed",
      instanceId,
      proxyPoolId: reserved.id,
      message: checked.error,
    };
  }

  const worker = await resolveWalk1Worker();
  if (!worker || !worker.online) {
    return {
      status: "worker_unavailable",
      instanceId,
      proxyPoolId: reserved.id,
      workerId: worker?.id,
      message: worker ? "WALK1 está offline." : "Worker WALK1 não foi encontrado.",
    };
  }

  await assignH2AdsInstanceWorkerPortable(instanceId, worker.id);
  await requestH2AdsBrowserPreparation(instanceId);

  return {
    status: "preparing",
    instanceId,
    proxyPoolId: reserved.id,
    workerId: worker.id,
    message: "Proxy validado, WALK1 atribuído e preparação enviada.",
  };
}

export async function rotateH2AdsInstanceProxy(instanceId: number): Promise<H2AdsAutoProvisionResult> {
  await assertProxySwapAllowed(instanceId);

  const reserved = await reserveH2AdsProxyForInstance(instanceId);
  if (!reserved) {
    return {
      status: "awaiting_proxy",
      instanceId,
      message: "Nenhum proxy disponível. O proxy atual foi mantido.",
    };
  }

  await resetPreparationState(instanceId);

  const checked = await attachAndValidateReservedProxy(instanceId, reserved);
  if (!checked.ok) {
    return {
      status: "proxy_failed",
      instanceId,
      proxyPoolId: reserved.id,
      message: checked.error,
    };
  }

  const worker = await resolveWalk1Worker();
  if (!worker || !worker.online) {
    return {
      status: "worker_unavailable",
      instanceId,
      proxyPoolId: reserved.id,
      workerId: worker?.id,
      message: worker ? "Novo proxy validado, mas WALK1 está offline." : "Novo proxy validado, mas WALK1 não foi encontrado.",
    };
  }

  await assignH2AdsInstanceWorkerPortable(instanceId, worker.id);
  await requestH2AdsBrowserPreparation(instanceId);

  return {
    status: "preparing",
    instanceId,
    proxyPoolId: reserved.id,
    workerId: worker.id,
    message: "Proxy trocado, validado e enviado para preparação no WALK1.",
  };
}

export async function getH2AdsAutoWorkerStatus() {
  const worker = await resolveWalk1Worker();
  if (!worker) return { found: false as const, online: false as const, id: null, name: "WALK1" };
  return { found: true as const, online: worker.online, id: worker.id, name: worker.name };
}
