import type { Express } from "express";
import { registerUnifiedCustomerSessionRoutes } from "../unifiedCustomerSessionRoutes";

/**
 * Rota mínima usada exclusivamente por monitoramento externo.
 * Não consulta banco, sessão, arquivos ou qualquer módulo de negócio.
 */
export function registerPingRoute(app: Express): void {
  app.get("/api/ping", (_req, res) => {
    // Garante que cada monitoramento alcance a instância, em vez de receber uma resposta em cache.
    res.set({
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      Pragma: "no-cache",
    });
    res.status(200).json({ ok: true, ts: Date.now() });
  });

  // Compatibilidade de módulos legados com a sessão única do cliente.
  registerUnifiedCustomerSessionRoutes(app);
}
