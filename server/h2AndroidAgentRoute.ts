/**
 * Private Windows agent transport. No screen/video is ever returned to the site.
 */
import type { Express, Request, Response } from "express";
import path from "node:path";
import {
  authenticateAndroidAgent,
  claimAndroidAgent,
  finishAndroidJob,
  heartbeatAndroidAgent,
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
      // Never log raw SQL/parameters: token hashes and machine data can appear in ORM errors.
      const info = (error && typeof error === "object") ? error as {
        name?: string; code?: string; errno?: number;
        cause?: { code?: string; errno?: number; sqlState?: string };
      } : {};
      const dbError = info.cause ?? {};
      console.error("[H2Android] agent error", {
        endpoint: req.path,
        name: info.name || "UnknownError",
        code: dbError.code || info.code || "UNKNOWN",
        errno: dbError.errno ?? info.errno ?? null,
        sqlState: dbError.sqlState || null,
      });
      if (!res.headersSent) res.status(500).json({ error: "Falha interna no serviço H2 Android." });
    });
  };
}

export function registerH2AndroidAgentRoutes(app: Express) {
  app.get("/api/h2-android/install-windows.cmd", (_req, res) => {
    noStore(res);
    res.download(path.resolve(process.cwd(), "workers", "windows", "Install-H2Android.cmd"), "Instalar-H2Android.cmd", error => {
      if (error && !res.headersSent) res.status(404).json({ error: "Instalador Windows indisponivel." });
    });
  });
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
  app.get("/api/h2-android/windows-socks-relay.mjs", (_req, res) => {
    noStore(res);
    res.download(path.resolve(process.cwd(), "workers", "windows", "H2AndroidSocksRelay.mjs"), "H2AndroidSocksRelay.mjs", error => {
      if (error && !res.headersSent) res.status(404).json({ error: "Relay SOCKS5 não disponível." });
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
  app.post("/api/h2-android/agent/heartbeat", safe(async (req, res) => {
    const agentId = await authorized(req, res);
    if (!agentId) return;
    const computerName = stringField(req.body?.computerName, 120);
    const version = stringField(req.body?.version, 32);
    if (!computerName || !version) { res.status(400).json({ error: "Identificação inválida." }); return; }
    const jobId = req.body?.jobId == null ? undefined : Number(req.body.jobId);
    if (jobId !== undefined && (!Number.isSafeInteger(jobId) || jobId < 1)) {
      res.status(400).json({ error: "Identificador de trabalho inválido." }); return;
    }
    const result = await heartbeatAndroidAgent(agentId, computerName, version, jobId);
    res.status(result.accepted ? 200 : 401).json(result);
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
