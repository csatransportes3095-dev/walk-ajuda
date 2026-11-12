/**
 * Private Windows agent transport. No screen/video is ever returned to the site.
 */
import type { Express, Request, Response } from "express";
import path from "node:path";
import {
  authenticateAndroidAgent,
  claimAndroidAgent,
  finishAndroidJob,
  nextAndroidJob,
} from "./routers/h2Android";

function stringField(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;
}
function noStore(res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
}
async function authorized(req: Request, res: Response) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.substring(7).trim() : "";
  const id = await authenticateAndroidAgent(token);
  if (!id) res.status(401).json({ error: "Agente não autorizado ou revogado." });
  return id;
}
function safe(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    noStore(res);
    void handler(req, res).catch(error => {
      console.error("[H2Android] worker:", error instanceof Error ? error.message : String(error));
      if (!res.headersSent) res.status(500).json({ error: "Falha interna no serviço H2 Android." });
    });
  };
}

export function registerH2AndroidAgentRoutes(app: Express) {
  app.get("/api/h2-android/install-windows.ps1", (_req, res) => {
    noStore(res);
    res.download(path.resolve(process.cwd(), "workers", "windows", "Install-H2Android.ps1"), "Install-H2Android.ps1", error => {
      if (error && !res.headersSent) res.status(404).json({ error: "Instalador não disponível." });
    });
  });
  app.get("/api/h2-android/windows-agent.ps1", (_req, res) => {
    noStore(res);
    res.download(path.resolve(process.cwd(), "workers", "windows", "H2AndroidAgent.ps1"), "H2AndroidAgent.ps1", error => {
      if (error && !res.headersSent) res.status(404).json({ error: "Agente não disponível." });
    });
  });
  app.post("/api/h2-android/agent/claim", safe(async (req, res) => {
    const code = stringField(req.body?.code, 24);
    const computerName = stringField(req.body?.computerName, 120);
    const version = stringField(req.body?.version, 32);
    if (!code || !computerName || !version) { res.status(400).json({ error: "Pareamento inválido." }); return; }
    const result = await claimAndroidAgent(code, computerName, version);
    if (!result) { res.status(401).json({ error: "Código inválido, usado ou expirado." }); return; }
    res.status(201).json(result);
  }));
  app.post("/api/h2-android/agent/next", safe(async (req, res) => {
    const agentId = await authorized(req, res);
    if (!agentId) return;
    const computerName = stringField(req.body?.computerName, 120);
    const version = stringField(req.body?.version, 32);
    if (!computerName || !version) { res.status(400).json({ error: "Identificação inválida." }); return; }
    const result = await nextAndroidJob(agentId, computerName, version);
    res.status(200).json(result);
  }));
  app.post("/api/h2-android/agent/complete", safe(async (req, res) => {
    const agentId = await authorized(req, res);
    if (!agentId) return;
    const jobId = Number(req.body?.jobId);
    const success = req.body?.success;
    const error = req.body?.error == null ? undefined : stringField(req.body.error, 500);
    const observedIp = req.body?.observedIp == null ? undefined : stringField(req.body.observedIp, 64);
    if (!Number.isSafeInteger(jobId) || jobId < 1 || typeof success !== "boolean" ||
        (req.body?.error != null && !error) || (req.body?.observedIp != null && !observedIp)) {
      res.status(400).json({ error: "Conclusão inválida." }); return;
    }
    const result = await finishAndroidJob(agentId, { jobId, success, error: error ?? undefined, observedIp: observedIp ?? undefined });
    res.status(result.accepted ? 200 : 409).json(result);
  }));
}
