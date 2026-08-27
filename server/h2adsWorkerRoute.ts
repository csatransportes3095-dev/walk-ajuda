import type { Express, Request, Response } from "express";
import path from "node:path";
import { authenticateH2AdsWorker, claimH2AdsWorker, claimNextH2AdsWorkerCommand, completeH2AdsWorkerBrowserCommand, completeH2AdsWorkerPreparation, getH2AdsProxyCredential, recordH2AdsBrowserRuntimeState, recordH2AdsWorkerHeartbeat } from "./h2ads";
import { decryptH2AdsProxy } from "./h2adsProxySecurity";

const MAX_NAME_LENGTH = 128;

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

  app.post("/api/h2ads/worker/commands/next", async (req: Request, res: Response) => {
    noStore(res);
    const worker = await authenticateRequest(req, res);
    if (!worker) return;
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
      res.status(200).json({ command: { id: command.id, instanceId: command.instanceId, command: command.command }, proxy });
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
    if (!Number.isInteger(instanceId) || instanceId < 1 || req.body?.state !== "closed") {
      res.status(400).json({ error: "Estado de execução inválido." });
      return;
    }
    const updated = await recordH2AdsBrowserRuntimeState({ workerId: worker.id, instanceId, state: "closed" });
    if (!updated) {
      res.status(409).json({ error: "Execução não disponível para este Worker." });
      return;
    }
    res.status(204).end();
  });
}
