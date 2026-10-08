import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { safeH2AdsWorkerRoute } from "./h2adsWorkerErrorGuard";

function makeResponse() {
  const res = {
    headersSent: false,
    writableEnded: false,
    status: vi.fn(function (this: any, _status: number) { return this; }),
    json: vi.fn(function (this: any, _payload: unknown) {
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    }),
    end: vi.fn(function (this: any) { this.writableEnded = true; return this; }),
  };
  return res;
}

const request = { route: { path: "/api/h2ads/worker/commands/next" } } as unknown as Request;

describe("proteção das rotas assíncronas do H2ADS", () => {
  it("transforma uma falha de rollback em resposta 503 sem rejeição solta", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = makeResponse();
      const guarded = safeH2AdsWorkerRoute(async () => {
        throw Object.assign(new Error("Failed query: rollback"), { cause: { code: "ECONNRESET" } });
      });
      guarded(request, res as unknown as Response);
      await vi.waitFor(() => expect(res.json).toHaveBeenCalledOnce());
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: "Serviço temporariamente indisponível. Tente novamente." });
      expect(errorLog).toHaveBeenCalledWith("[H2ADS-WORKER] falha assíncrona", {
        route: "/api/h2ads/worker/commands/next",
        code: "ECONNRESET",
      });
    } finally {
      errorLog.mockRestore();
    }
  });

  it("preserva resposta normal quando o handler conclui", async () => {
    const res = makeResponse();
    const action = vi.fn(async () => undefined);
    safeH2AdsWorkerRoute(action)(request, res as unknown as Response);
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("nao envia segundo JSON quando os cabeçalhos ja foram enviados", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = makeResponse();
      res.headersSent = true;
      safeH2AdsWorkerRoute(async () => { throw new Error("falha após envio"); })(request, res as unknown as Response);
      await vi.waitFor(() => expect(res.end).toHaveBeenCalledOnce());
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });
});
