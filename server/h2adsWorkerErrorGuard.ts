import type { Request, Response } from "express";

/**
 * Express 4 nao encaminha automaticamente rejeicoes de handlers async.
 * O worker H2ADS faz transacoes frequentes: uma falha de rollback nao pode
 * virar unhandledRejection e finalizar todo o site.
 *
 * A transacao que falhou NAO e repetida automaticamente; o Worker recebe 503
 * e pode retentar a chamada respeitando suas regras atuais.
 */
export function safeH2AdsWorkerRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response): void => {
    void Promise.resolve()
      .then(() => handler(req, res))
      .catch((error: unknown) => {
        const detail = error as { code?: unknown; cause?: { code?: unknown }; message?: unknown } | null;
        const rawCode = detail?.cause?.code ?? detail?.code;
        const code = typeof rawCode === "string" && /^[A-Z0-9_]{1,64}$/.test(rawCode)
          ? rawCode
          : typeof detail?.message === "string" && /^Failed query: rollback\b/i.test(detail.message)
            ? "ROLLBACK_FAILED"
            : "UNEXPECTED";
        // Nao registrar query SQL, params, tokens ou payload do Worker.
        console.error("[H2ADS-WORKER] falha assíncrona", { route: req.route?.path || "unknown", code });
        if (res.headersSent) {
          if (!res.writableEnded) res.end();
          return;
        }
        res.status(503).json({ error: "Serviço temporariamente indisponível. Tente novamente." });
      });
  };
}
