import { and, eq, inArray } from "drizzle-orm";
import {
  h2AdsBrowserWorkers,
  h2AdsInstanceBrowserRuns,
  h2AdsInstanceWorkerAssignments,
  h2AdsWorkerBrowserCommands,
  h2AdsWorkerCommands,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  getH2AdsNetworkProfile,
  getH2AdsProxyCredential,
  recordH2AdsNetworkValidation,
  requestH2AdsBrowserPreparation,
  saveH2AdsNetworkProfile,
  saveH2AdsProxyCredential,
} from "./h2ads";
import { assertH2AdsInstanceNotDeleting } from "./h2adsDeletionState";
import { assignH2AdsInstanceWorkerPortable } from "./h2adsProfilePortability";
import { decryptH2AdsProxy } from "./h2adsProxySecurity";
import { classifyH2AdsRouteFailure, getH2AdsRouteMismatches, validateH2AdsGoogleAccess, validateH2AdsProxyRoute } from "./h2adsProxyValidation";
import {
  markH2AdsProxyFailed,
  markH2AdsOtherAssignedProxiesUsed,
  reserveH2AdsProxyForInstance,
  reserveInitialH2AdsProxyForInstance,
} from "./h2adsProxyPool";

export type H2AdsAutoProvisionResult = {
  status: "preparing" | "reconnecting" | "awaiting_proxy" | "proxy_failed" | "worker_unavailable";
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
  // The current browser route and network metadata remain unchanged until
  // the replacement proxy passes independent network validation.
  const profile = await getH2AdsNetworkProfile(instanceId);
  let observed;
  try {
    const candidate = decryptH2AdsProxy(reserved.encryptedPayload);
    if (candidate.protocol !== "socks5") {
      await markH2AdsProxyFailed(reserved.id, "proxy_protocol_not_socks5");
      return { ok: false as const, error: "A rotação automática exige um proxy SOCKS5." };
    }
    observed = await validateH2AdsProxyRoute(candidate);
    const mismatches = getH2AdsRouteMismatches(observed, {
      expectedIsp: profile?.expectedIsp ?? null,
      expectedAsn: profile?.expectedAsn ?? null,
    });
    if (mismatches.length) {
      await markH2AdsProxyFailed(reserved.id, "route_mismatch");
      return { ok: false as const, error: "O novo proxy divergiu da rota esperada." };
    }
    await validateH2AdsGoogleAccess(candidate);
  } catch (error) {
    const failure = classifyH2AdsRouteFailure(error);
    console.warn("[H2ADS] provisionamento de rota bloqueado", { instanceId, poolId: reserved.id, category: failure.code });
    await markH2AdsProxyFailed(reserved.id, failure.code || "proxy_unavailable");
    return { ok: false as const, error: failure.message };
  }
  await saveH2AdsProxyCredential(instanceId, reserved.encryptedPayload);
  await saveH2AdsNetworkProfile(instanceId, {
    providerName: "Fila H2ADS",
    routeLabel: `POOL-${reserved.id}`,
    setupStatus: "metadata_ready",
  });
  await recordH2AdsNetworkValidation(instanceId, {
    healthStatus: "healthy",
    observedIp: observed.ip,
    observedCountryCode: observed.countryCode,
    observedCity: observed.city,
    observedIsp: observed.isp,
    observedAsn: observed.asn,
    latencyMs: observed.latencyMs,
    lastCheckMessage: "Novo proxy validado. Sincronizando com o Worker.",
  });
  return { ok: true as const };
}

// The same instance cannot run two provisioning or rotation operations in one
// server process. Initial reservation itself is also serialized in MySQL.
const activeProvisioning = new Set<number>();
async function withProvisioningGuard<T>(instanceId: number, run: () => Promise<T>): Promise<T> {
  if (activeProvisioning.has(instanceId)) throw new Error("A configuração desta instância já está em andamento.");
  activeProvisioning.add(instanceId);
  try { return await run(); }
  finally { activeProvisioning.delete(instanceId); }
}

async function resolveProvisionWorker(instanceId: number) {
  const db = await requireDb();
  const [assignment] = await db.select({ workerId: h2AdsInstanceWorkerAssignments.workerId })
    .from(h2AdsInstanceWorkerAssignments).where(eq(h2AdsInstanceWorkerAssignments.instanceId, instanceId)).limit(1);
  if (!assignment) return resolveWalk1Worker();
  // A partially configured instance may already have an assigned Worker.
  // Never migrate its local browser profile just to finish provisioning.
  const [worker] = await db.select().from(h2AdsBrowserWorkers)
    .where(and(eq(h2AdsBrowserWorkers.id, assignment.workerId), eq(h2AdsBrowserWorkers.status, "active"))).limit(1);
  if (!worker) return null;
  return { ...worker, online: Boolean(worker.lastSeenAt && Date.now() - worker.lastSeenAt.getTime() <= 70_000) };
}

async function assertInitialProvisionSafe(instanceId: number) {
  await assertH2AdsInstanceNotDeleting(instanceId);
  await assertProxySwapAllowed(instanceId);
  const db = await requireDb();
  const [run] = await db.select({ state: h2AdsInstanceBrowserRuns.state })
    .from(h2AdsInstanceBrowserRuns).where(eq(h2AdsInstanceBrowserRuns.instanceId, instanceId)).limit(1);
  if (run?.state === "browser_open") throw new Error("Encerre o navegador antes de concluir a configuração.");
}

async function verifyExistingProvisionRoute(instanceId: number, encryptedPayload: string) {
  const profile = await getH2AdsNetworkProfile(instanceId);
  try {
    const candidate = decryptH2AdsProxy(encryptedPayload);
    if (candidate.protocol !== "socks5") throw new Error("proxy_protocol_not_socks5");
    const observed = await validateH2AdsProxyRoute(candidate);
    if (getH2AdsRouteMismatches(observed, {
      expectedIsp: profile?.expectedIsp ?? null, expectedAsn: profile?.expectedAsn ?? null,
    }).length) throw new Error("route_mismatch");
    await validateH2AdsGoogleAccess(candidate);
    await assertInitialProvisionSafe(instanceId);
    if (await getH2AdsProxyCredential(instanceId) !== encryptedPayload) throw new Error("route_changed");
    await recordH2AdsNetworkValidation(instanceId, {
      healthStatus: "healthy", observedIp: observed.ip, observedCountryCode: observed.countryCode,
      observedCity: observed.city, observedIsp: observed.isp, observedAsn: observed.asn,
      latencyMs: observed.latencyMs, lastCheckMessage: "Rota existente validada para concluir a configuração.",
    });
    return { ok: true as const };
  } catch (error) {
    const failure = classifyH2AdsRouteFailure(error);
    console.warn("[H2ADS] validação da rota existente bloqueada", { instanceId, category: failure.code });
    // No alternative proxy is selected after failure, and no verification is skipped.
    if (await getH2AdsProxyCredential(instanceId) === encryptedPayload) {
      await assertInitialProvisionSafe(instanceId);
      await recordH2AdsNetworkValidation(instanceId, {
        healthStatus: "failed", observedIp: null, observedCountryCode: null, observedCity: null,
        observedIsp: null, observedAsn: null, latencyMs: null, lastCheckMessage: failure.message,
      });
    }
    return { ok: false as const, error: failure.message };
  }
}

export async function autoProvisionH2AdsInstance(instanceId: number): Promise<H2AdsAutoProvisionResult> {
  return withProvisioningGuard(instanceId, async () => {
    await assertInitialProvisionSafe(instanceId);
    const worker = await resolveProvisionWorker(instanceId);
    if (!worker?.online) return {
      status: "worker_unavailable", instanceId, workerId: worker?.id,
      message: worker ? "O Worker atribuído está offline." : "Worker automático WALK1 indisponível.",
    };

    let proxyPoolId: number | undefined;
    let existingCredential = await getH2AdsProxyCredential(instanceId);
    if (!existingCredential) {
      const reservation = await reserveInitialH2AdsProxyForInstance(instanceId);
      if (reservation.status === "unavailable") return {
        status: "awaiting_proxy", instanceId, message: "Nenhum proxy SOCKS5 disponível para a configuração inicial.",
      };
      if (reservation.status === "previous_failure") return {
        status: "proxy_failed", instanceId,
        message: "A rota anterior não foi aprovada. A instância foi preservada; nenhuma troca automática será realizada.",
      };
      if (reservation.status === "configured") {
        existingCredential = await getH2AdsProxyCredential(instanceId);
        if (!existingCredential) throw new Error("A configuração mudou. Nenhuma nova rota foi atribuída.");
      } else if (reservation.status === "reserved") {
        proxyPoolId = reservation.proxy.id;
        const checked = await attachAndValidateReservedProxy(instanceId, reservation.proxy);
        if (!checked.ok) return { status: "proxy_failed", instanceId, proxyPoolId, message: checked.error };
      }
    }
    if (existingCredential) {
      const checked = await verifyExistingProvisionRoute(instanceId, existingCredential);
      if (!checked.ok) return { status: "proxy_failed", instanceId, message: checked.error };
    }
    await assertInitialProvisionSafe(instanceId);
    const currentWorker = await resolveProvisionWorker(instanceId);
    if (!currentWorker?.online || currentWorker.id !== worker.id) return {
      status: "worker_unavailable", instanceId, proxyPoolId,
      message: "O Worker deixou de estar disponível. A rota existente foi preservada.",
    };
    await assignH2AdsInstanceWorkerPortable(instanceId, worker.id);
    await requestH2AdsBrowserPreparation(instanceId);
    return {
      status: "preparing", instanceId, proxyPoolId, workerId: worker.id,
      message: "Configuração concluída na mesma instância. Preparação enviada ao Worker.",
    };
  });
}

export async function rotateH2AdsInstanceProxy(instanceId: number): Promise<H2AdsAutoProvisionResult> {
  return withProvisioningGuard(instanceId, () => rotateH2AdsInstanceProxyInternal(instanceId));
}

async function rotateH2AdsInstanceProxyInternal(instanceId: number): Promise<H2AdsAutoProvisionResult> {
  await assertProxySwapAllowed(instanceId);
  const db = await requireDb();
  const runRows = await db
    .select({ state: h2AdsInstanceBrowserRuns.state, workerId: h2AdsInstanceBrowserRuns.workerId })
    .from(h2AdsInstanceBrowserRuns)
    .where(eq(h2AdsInstanceBrowserRuns.instanceId, instanceId))
    .limit(1);
  const browserAlreadyOpen = runRows[0]?.state === "browser_open";
  // For live swaps, don't consume a proxy or migrate the local profile
  // unless the very same running Worker is online.
  if (browserAlreadyOpen) {
    const activeWorker = await resolveWalk1Worker();
    if (!activeWorker?.online || activeWorker.id !== runRows[0]?.workerId) {
      return {
        status: "worker_unavailable",
        instanceId,
        message: "O Worker desta sessão não está disponível. A rota atual foi preservada.",
      };
    }
  }

  const reserved = await reserveH2AdsProxyForInstance(instanceId, true, "socks5");
  if (!reserved) {
    return {
      status: "awaiting_proxy",
      instanceId,
      message: "Nenhum proxy disponível. O proxy atual foi mantido.",
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

  await markH2AdsOtherAssignedProxiesUsed(instanceId, reserved.id);
  if (!browserAlreadyOpen) await resetPreparationState(instanceId);

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

  if (browserAlreadyOpen) {
    // Sessão aberta: não derrubar estado nem enviar preparação.
    // O browser-session consulta a credencial atual e aplica o hot swap no relay.
    await db
      .update(h2AdsInstanceBrowserRuns)
      .set({
        state: "browser_open",
        lastErrorCategory: null,
        lastChangedAt: new Date(),
      })
      .where(eq(h2AdsInstanceBrowserRuns.instanceId, instanceId));

    return {
      status: "reconnecting",
      instanceId,
      proxyPoolId: reserved.id,
      workerId: worker.id,
      message: "Proxy trocado e validado. A sessão aberta está sincronizando a nova rota sem fechar.",
    };
  }

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
