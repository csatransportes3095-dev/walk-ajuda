import type { Express, Request, Response } from "express";
import path from "node:path";
import { and, eq, lt } from "drizzle-orm";
import { h2AdsWorkerBrowserCommands, h2AdsWorkerCommands } from "../drizzle/schema";
import { getDb } from "./db";
import { authenticateH2AdsWorker, claimH2AdsWorker, claimNextH2AdsWorkerCommand, completeH2AdsWorkerBrowserCommand, completeH2AdsWorkerPreparation, getH2AdsInstance, getH2AdsProxyCredential, recordH2AdsBrowserRuntimeState, recordH2AdsWorkerHeartbeat } from "./h2ads";
import { recordH2AdsRuntimeIp } from "./h2adsIpHistory";
import { decryptH2AdsProxy } from "./h2adsProxySecurity";
import { openH2AdsProfileSnapshot, recordH2AdsProfileRestoreResult, storeH2AdsProfileSnapshot } from "./h2adsProfileSnapshots";

const MAX_NAME_LENGTH = 128;
const STALE_BROWSER_COMMAND_MS = 30_000;
const STALE_PREPARATION_COMMAND_MS = 120_000;

function workerString(value: unknown, maxLength = MAX_NAME_LENGTH): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength ? value.trim() : null;
}

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store, private");
}

async function authenticateRequest(req: Request, res: Response) {
  const authorization = req.header("authorization");
  const workerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  const workerKey = workerString(req.header("x-h2ads-worker-key"), 64);
  if (!workerToken || !workerKey) {
    res.status(401).json({ error: "Worker não autorizado." });
    return null;
  }
  const worker = await authenticateH2AdsWorker(workerKey, workerToken);
  if (!worker) {
    res.status(401).json({ error: "Worker não autorizado." });
    return null;
  }
  return worker;
}

async function requeueStaleWorkerCommands(workerId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  const staleBrowserCutoff = new Date(now - STALE_BROWSER_COMMAND_MS);

  // Somente abertura pode ser reentregue. Um close antigo nunca deve atingir uma sessão nova.
  await db.update(h2AdsWorkerBrowserCommands)
    .set({ status: "queued", claimedAt: null })
    .where(and(
      eq(h2AdsWorkerBrowserCommands.workerId, workerId),
      eq(h2AdsWorkerBrowserCommands.command, "launch_browser"),
      eq(h2AdsWorkerBrowserCommands.status, "claimed"),
      lt(h2AdsWorkerBrowserCommands.claimedAt, staleBrowserCutoff),
    ));

  // Close é comando efêmero: se não for consumido rapidamente, cancela em vez de reaparecer depois.
  await db.update(h2AdsWorkerBrowserCommands)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(and(
      eq(h2AdsWorkerBrowserCommands.workerId, workerId),
      eq(h2AdsWorkerBrowserCommands.command, "close_browser"),
      eq(h2AdsWorkerBrowserCommands.status, "claimed"),
      lt(h2AdsWorkerBrowserCommands.claimedAt, staleBrowserCutoff),
    ));
  await db.update(h2AdsWorkerBrowserCommands)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(and(
      eq(h2AdsWorkerBrowserCommands.workerId, workerId),
      eq(h2AdsWorkerBrowserCommands.command, "close_browser"),
      eq(h2AdsWorkerBrowserCommands.status, "queued"),
      lt(h2AdsWorkerBrowserCommands.createdAt, staleBrowserCutoff),
    ));

  await db.update(h2AdsWorkerCommands)
    .set({ status: "queued", claimedAt: null })
    .where(and(
      eq(h2AdsWorkerCommands.workerId, workerId),
      eq(h2AdsWorkerCommands.status, "claimed"),
      lt(h2AdsWorkerCommands.claimedAt, new Date(now - STALE_PREPARATION_COMMAND_MS)),
    ));
}

export function registerH2AdsWorkerRoute(app: Express): void {
  app.get("/api/h2ads/worker/windows-agent.ps1", (_req: Request, res: Response) => {
    noStore(res);
    const scriptPath = path.resolve(process.cwd(), "workers", "windows", "H2AdsWorker.ps1");
    res.download(scriptPath, "H2AdsWorker.ps1", (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: "Agente Windows não disponível." });
    });
  });

  app.get("/api/h2ads/worker/windows-browser-runner.mjs", (_req: Request, res: Response) => {
    noStore(res);
    const runnerPath = path.resolve(process.cwd(), "workers", "windows", "browser-runner.mjs");
    res.download(runnerPath, "browser-runner.mjs", (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: "Componente de preparação não disponível." });
    });
  });

  app.get("/api/h2ads/worker/windows-browser-session.mjs", (_req: Request, res: Response) => {
    noStore(res);
    const sessionPath = path.resolve(process.cwd(), "workers", "windows", "browser-session.mjs");
    res.download(sessionPath, "browser-session.mjs", (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: "Componente de sessão não disponível." });
    });
  });

  app.post("/api/h2ads/worker/claim", async (req: Request, res: Response) => {
    noStore(res);
    const pairingCode = workerString(req.body?.pairingCode, 128);
    const computerName = workerString(req.body?.computerName);
    const agentVersion = workerString(req.body?.agentVersion, 32);
    if (!pairingCode || !computerName || !agentVersion) {
      res.status(400).json({ error: "Dados de pareamento inválidos." });
      return;
    }
    try {
      const claimed = await claimH2AdsWorker({ pairingCode, computerName, agentVersion });
      res.status(201).json(claimed);
    } catch (_error) {
      res.status(401).json({ error: "Código de pareamento inválido ou expirado." });
    }
  });

  app.post("/api/h2ads/worker/heartbeat", async (req: Request, res: Response) => {
    noStore(res);
    const authorization = req.header("authorization");
    const workerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
    const workerKey = workerString(req.header("x-h2ads-worker-key"), 64);
    const computerName = workerString(req.body?.computerName);
    const agentVersion = workerString(req.body?.agentVersion, 32);
    if (!workerToken || !workerKey || !computerName || !agentVersion) {
      res.status(401).json({ error: "Worker não autorizado." });
      return;
    }
    const accepted = await recordH2AdsWorkerHeartbeat({ workerKey, workerToken, computerName, agentVersion });
    if (!accepted) {
      res.status(401).json({ error: "Worker não autorizado." });
      return;
    }
    res.status(204).end();
  });

  app.post("/api/h2ads/worker/profiles/:instanceId/snapshot", async (req: Request, res: Response) => {
    noStore(res);
    const worker = await authenticateRequest(req, res);
    if (!worker) return;
    const instanceId = Number(req.params.instanceId);
    const plainBytes = Number(req.header("x-h2ads-snapshot-size"));
    const plainSha256 = workerString(req.header("x-h2ads-snapshot-sha256"), 64);
    if (!Number.isInteger(instanceId) || instanceId < 1 || !Number.isSafeInteger(plainBytes) || plainBytes < 1 || !plainSha256 || !/^[a-f0-9]{64}$/i.test(plainSha256)) {
      res.status(400).json({ error: "Metadados do snapshot H2ADS inválidos." });
      return;
    }
    try {
      const stored = await storeH2AdsProfileSnapshot({ workerId: worker.id, instanceId, body: req, plainBytes, plainSha256 });
      res.status(201).json({ stored: true, bytes: stored.bytes, sha256: stored.sha256 });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : "Não foi possível salvar o snapshot H2ADS." });
    }
  });

  app.get("/api/h2ads/worker/profiles/:instanceId/snapshot", async (req: Request, res: Response) => {
    noStore(res);
    const worker = await authenticateRequest(req, res);
    if (!worker) return;
    const instanceId = Number(req.params.instanceId);
    if (!Number.isInteger(instanceId) || instanceId < 1) {
      res.status(400).json({ error: "Instância inválida." });
      return;
    }
    try {
      const snapshot = await openH2AdsProfileSnapshot(worker.id, instanceId);
      if (!snapshot) {
        res.status(404).json({ error: "Snapshot H2ADS ainda não disponível." });
        return;
      }
      res.status(200);
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Length", String(snapshot.bytes));
      res.setHeader("X-H2ADS-Snapshot-SHA256", snapshot.sha256);
      res.setHeader("X-H2ADS-Profile-Version", String(snapshot.profileVersion));
      snapshot.body.on("error", () => {
        if (!res.headersSent) res.status(500).end(); else res.destroy();
      });
      snapshot.body.pipe(res);
    } catch (error) {
      if (!res.headersSent) res.status(409).json({ error: error instanceof Error ? error.message : "Não foi possível recuperar o snapshot H2ADS." });
    }
  });

  app.post("/api/h2ads/worker/profiles/:instanceId/restore-result", async (req: Request, res: Response) => {
    noStore(res);
    const worker = await authenticateRequest(req, res);
    if (!worker) return;
    const instanceId = Number(req.params.instanceId);
    const restored = req.body?.state === "restored" ? true : req.body?.state === "failed" ? false : null;
    if (!Number.isInteger(instanceId) || instanceId < 1 || restored === null) {
      res.status(400).json({ error: "Resultado de restauração H2ADS inválido." });
      return;
    }
    try {
      await recordH2AdsProfileRestoreResult({ workerId: worker.id, instanceId, restored });
      res.status(204).end();
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : "Não foi possível registrar a restauração H2ADS." });
    }
  });

  app.post("/api/h2ads/worker/commands/next", async (req: Request, res: Response) => {
    noStore(res);
    const worker = await authenticateRequest(req, res);
    if (!worker) return;
    const agentVersion = workerString(req.header("x-h2ads-agent-version"), 32);
    if (!agentVersion) {
      res.status(426).json({ error: "Atualize o agente H2 Ads para executar comandos de navegador." });
      return;
    }
    try {
      await requeueStaleWorkerCommands(worker.id);
    } catch (_error) {
      // A recuperação é auxiliar; a fila normal continua disponível.
    }
    const command = await claimNextH2AdsWorkerCommand(worker.id);
    if (!command) {
      res.status(204).end();
      return;
    }
    try {
      if (command.command === "close_browser") {
        res.status(200).json({ command: { id: command.id, instanceId: command.instanceId, command: command.command } });
        return;
      }
      const encryptedPayload = await getH2AdsProxyCredential(command.instanceId);
      if (!encryptedPayload) throw new Error("Rota protegida ausente.");
      const proxy = decryptH2AdsProxy(encryptedPayload);
      const instance = await getH2AdsInstance(command.instanceId);
      const instanceName = workerString(instance?.name) ?? `Instância ${command.instanceId}`;
      res.status(200).json({
        command: { id: command.id, instanceId: command.instanceId, command: command.command },
        proxy: { ...proxy, instanceName },
      });
    } catch (_error) {
      if (command.command === "prepare_browser") await completeH2AdsWorkerPreparation({ workerId: worker.id, commandId: command.id, state: "blocked", errorCategory: "route_unavailable" });
      else await completeH2AdsWorkerBrowserCommand({ workerId: worker.id, commandId: command.id, command: "launch_browser", state: "blocked", errorCategory: "route_unavailable" });
      res.status(409).json({ error: "A rota protegida da instância não está disponível." });
    }
  });

  app.post("/api/h2ads/worker/commands/:commandId/result", async (req: Request, res: Response) => {
    noStore(res);
    const worker = await authenticateRequest(req, res);
    if (!worker) return;
    const commandId = Number(req.params.commandId);
    const command = req.body?.command === "prepare_browser" || req.body?.command === "launch_browser" || req.body?.command === "close_browser" ? req.body.command : null;
    const state = req.body?.state === "proxy_verified" || req.body?.state === "browser_open" || req.body?.state === "closed" || req.body?.state === "blocked" ? req.body.state : null;
    const observedIp = workerString(req.body?.observedIp, 64);
    const errorCategory = workerString(req.body?.errorCategory, 64);
    if (!Number.isInteger(commandId) || commandId < 1 || !command || !state || (state === "proxy_verified" && !observedIp)) {
      res.status(400).json({ error: "Resultado de preparação inválido." });
      return;
    }
    const completed = command === "prepare_browser"
      ? (state === "proxy_verified" || state === "blocked") && await completeH2AdsWorkerPreparation({ workerId: worker.id, commandId, state, observedIp, errorCategory })
      : (state === "browser_open" || state === "closed" || state === "blocked") && await completeH2AdsWorkerBrowserCommand({ workerId: worker.id, commandId, command, state, errorCategory });
    if (!completed) {
      res.status(409).json({ error: "Comando não disponível para este Worker." });
      return;
    }
    res.status(204).end();
  });

  app.post("/api/h2ads/worker/runs/:instanceId/state", async (req: Request, res: Response) => {
    noStore(res);
    const worker = await authenticateRequest(req, res);
    if (!worker) return;
    const instanceId = Number(req.params.instanceId);
    const state = req.body?.state === "closed" || req.body?.state === "browser_open" ? req.body.state : null;
    const observedIp = workerString(req.body?.observedIp, 64);
    if (!Number.isInteger(instanceId) || instanceId < 1 || !state || (state === "browser_open" && !observedIp)) {
      res.status(400).json({ error: "Estado de execução inválido." });
      return;
    }
    const updated = state === "browser_open"
      ? await recordH2AdsRuntimeIp({ workerId: worker.id, instanceId, observedIp: observedIp! })
      : await recordH2AdsBrowserRuntimeState({ workerId: worker.id, instanceId, state: "closed" });
    if (!updated) {
      res.status(409).json({ error: "Execução não disponível para este Worker." });
      return;
    }
    res.status(204).end();
  });
}
