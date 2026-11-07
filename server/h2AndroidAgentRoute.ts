/**
 * Rotas exclusivas do H2 Android Agent.
 * Pairing usa codigo temporario obtido no ADM. Heartbeat usa token proprio.
 */
import type { Express, Request, Response } from "express";
import path from "node:path";
import { isAdminJwtValid } from "./_core/trpc";
import { claimAndroidAgent, recordAndroidAgentHeartbeat } from "./h2AndroidAgentStore";
import { getAndroidWindowsInstallerZip } from "./h2AndroidInstallerZip";

function noStore(res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function registerH2AndroidAgentRoutes(app: Express): void {
  app.get("/api/h2-android/agent/installer.zip", async (req: Request, res: Response) => {
    noStore(res);
    if (!isAdminJwtValid(req as any)) {
      res.status(403).json({ error: "Acesso exclusivo do ADM." });
      return;
    }
    try {
      const data = await getAndroidWindowsInstallerZip();
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="Instalador-H2-Android.zip"');
      res.setHeader("Content-Length", String(data.length));
      res.status(200).end(data);
    } catch (error) {
      console.error("[H2 Android] falha ao gerar ZIP:", error instanceof Error ? error.message : String(error));
      if (!res.headersSent) res.status(503).json({ error: "Instalador temporariamente indisponivel." });
    }
  });

  app.get("/api/h2-android/agent/windows-agent.ps1", (req: Request, res: Response) => {
    noStore(res);
    if (!isAdminJwtValid(req as any)) {
      res.status(403).json({ error: "Acesso exclusivo do ADM." });
      return;
    }
    res.download(
      path.resolve(process.cwd(), "workers", "windows", "H2AndroidAgent.ps1"),
      "H2AndroidAgent.ps1",
      error => {
        if (error && !res.headersSent) res.status(404).json({ error: "Instalador não disponível." });
      },
    );
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
