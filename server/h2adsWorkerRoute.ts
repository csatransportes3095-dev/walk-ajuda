import type { Express, Request, Response } from "express";
import path from "node:path";
import { claimH2AdsWorker, recordH2AdsWorkerHeartbeat } from "./h2ads";

const MAX_NAME_LENGTH = 128;

function workerString(value: unknown, maxLength = MAX_NAME_LENGTH): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength ? value.trim() : null;
}

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store, private");
}

export function registerH2AdsWorkerRoute(app: Express): void {
  app.get("/api/h2ads/worker/windows-agent.ps1", (_req: Request, res: Response) => {
    noStore(res);
    const scriptPath = path.resolve(process.cwd(), "workers", "windows", "H2AdsWorker.ps1");
    res.download(scriptPath, "H2AdsWorker.ps1", (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: "Agente Windows não disponível." });
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
}
