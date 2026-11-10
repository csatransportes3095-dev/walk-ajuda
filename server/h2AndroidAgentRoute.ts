/**
 * Rotas exclusivas do H2 Android Agent.
 * Pairing usa codigo temporario obtido no ADM. Heartbeat usa token proprio.
 */
import type { Express, Request, Response } from "express";
import { isAdminJwtValid } from "./_core/trpc";
import { claimAndroidAgent, recordAndroidAgentHeartbeat, pullAndroidCommand, finishAndroidCommand, requestAndroidScreen, storeAndroidFrame } from "./h2AndroidAgentStore";
import { getAndroidNativeOfflineZip } from "./h2AndroidInstallerZip";

function noStore(res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function registerH2AndroidAgentRoutes(app: Express): void {
  // Independent H2 Android agent token only; the browser cannot poll worker commands.
  app.post("/api/h2-android/agent/pull", async (req: Request, res: Response) => {
    noStore(res);
    try {
      const result = await pullAndroidCommand(req.header("authorization"));
      if (!result) { res.status(401).json({ error: "Agente nao autorizado." }); return; }
      res.json(result);
    } catch { res.status(503).json({ error: "Fila indisponivel." }); }
  });

  app.post("/api/h2-android/agent/finish", async (req: Request, res: Response) => {
    noStore(res);
    try {
      const ok = await finishAndroidCommand(req.header("authorization"), req.body);
      res.status(ok ? 200 : 401).json({ ok });
    } catch { res.status(503).json({ error: "Falha ao registrar comando." }); }
  });

  app.post("/api/h2-android/agent/frame", async (req: Request, res: Response) => {
    noStore(res);
    try {
      const ok = await storeAndroidFrame(req.header("authorization"), req.body);
      res.status(ok ? 200 : 401).json({ ok });
    } catch { res.status(503).json({ error: "Falha ao receber tela." }); }
  });

  app.get("/api/h2-android/screen/:agentId/:avdName", (req: Request, res: Response) => {
    noStore(res);
    res.setHeader("X-Frame-Options", "DENY");
    if (!isAdminJwtValid(req as any)) { res.sendStatus(403); return; }
    const agentId = String(req.params.agentId || "");
    if (!/^[0-9a-f-]{36}$/i.test(agentId)) { res.sendStatus(400); return; }
    const sessionId = String(req.query.session || "");
    const { png, error } = requestAndroidScreen(agentId, String(req.params.avdName || ""), sessionId);
    if (error) { res.status(503).json({ error }); return; }
    if (!png) { res.status(204).end(); return; }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", String(png.length));
    res.status(200).end(png);
  });

  // O novo ADM distribui somente o agente Hyper-V; os instaladores
  // Google SDK/AVD foram descontinuados, sem alterar seus arquivos de backup.
  app.get("/api/h2-android/agent/first-avd.zip", (req: Request, res: Response) => {
    noStore(res);
    if (!isAdminJwtValid(req as any)) { res.sendStatus(403); return; }
    res.status(410).json({ error: "Preparador antigo removido. Baixe o agente nativo em /adm/android." });
  });

  app.get("/api/h2-android/agent/windows-agent.ps1", (req: Request, res: Response) => {
    noStore(res);
    if (!isAdminJwtValid(req as any)) { res.sendStatus(403); return; }
    res.status(410).json({ error: "Agente legado substituido pelo pacote nativo do ADM." });
  });

  app.get("/api/h2-android/agent/installer.zip", async (req: Request, res: Response) => {
    noStore(res);
    if (!isAdminJwtValid(req as any)) { res.sendStatus(403); return; }
    try {
      const data = await getAndroidNativeOfflineZip();
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="H2-Android-Nativo.zip"');
      res.setHeader("Content-Length", String(data.length));
      res.status(200).end(data);
    } catch (error) {
      console.error("[H2 Android] falha ao gerar agente nativo:", error instanceof Error ? error.message : String(error));
      if (!res.headersSent) res.status(503).json({ error: "Agente nativo temporariamente indisponivel." });
    }
  });

  app.post("/api/h2-android/agent/claim", async (req: Request, res: Response) => {
    noStore(res);
    try {
      // Sem cookies de usuario/ADM: apenas codigo temporario de alta entropia.
      const result = await claimAndroidAgent(req.body?.pairingCode, req.body?.computerName);
      if (!result) {
        res.status(401).json({ error: "Código inválido, vencido ou já utilizado." });
        return;
      }
      res.status(200).json(result);
    } catch (error) {
      console.error("[H2 Android] falha ao parear agente:", error instanceof Error ? error.message : String(error));
      res.status(503).json({ error: "Pareamento temporariamente indisponível." });
    }
  });

  app.post("/api/h2-android/agent/heartbeat", async (req: Request, res: Response) => {
    noStore(res);
    try {
      const ok = await recordAndroidAgentHeartbeat(req.header("authorization"), req.body);
      if (!ok) {
        res.status(401).json({ error: "Agente não autorizado ou relatório inválido." });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[H2 Android] falha no heartbeat:", error instanceof Error ? error.message : String(error));
      res.status(503).json({ error: "Serviço temporariamente indisponível." });
    }
  });
}
