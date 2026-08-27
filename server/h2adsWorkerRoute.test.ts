import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateH2AdsWorker, claimH2AdsWorker, claimNextH2AdsWorkerCommand, completeH2AdsWorkerBrowserCommand, completeH2AdsWorkerPreparation, getH2AdsProxyCredential, recordH2AdsBrowserRuntimeState, recordH2AdsWorkerHeartbeat } = vi.hoisted(() => ({
  authenticateH2AdsWorker: vi.fn(),
  claimH2AdsWorker: vi.fn(),
  claimNextH2AdsWorkerCommand: vi.fn(),
  completeH2AdsWorkerBrowserCommand: vi.fn(),
  completeH2AdsWorkerPreparation: vi.fn(),
  getH2AdsProxyCredential: vi.fn(),
  recordH2AdsBrowserRuntimeState: vi.fn(),
  recordH2AdsWorkerHeartbeat: vi.fn(),
}));

vi.mock("./h2ads", () => ({ authenticateH2AdsWorker, claimH2AdsWorker, claimNextH2AdsWorkerCommand, completeH2AdsWorkerBrowserCommand, completeH2AdsWorkerPreparation, getH2AdsProxyCredential, recordH2AdsBrowserRuntimeState, recordH2AdsWorkerHeartbeat }));
vi.mock("./h2adsProxySecurity", () => ({ decryptH2AdsProxy: vi.fn() }));

import { registerH2AdsWorkerRoute } from "./h2adsWorkerRoute";

type Handler = (req: any, res: any) => Promise<void> | void;
type RouteMap = Record<string, Handler>;

function setupRoutes(): RouteMap {
  const routes: RouteMap = {};
  registerH2AdsWorkerRoute({
    get: (path: string, handler: Handler) => { routes[`GET ${path}`] = handler; },
    post: (path: string, handler: Handler) => { routes[`POST ${path}`] = handler; },
  } as any);
  return routes;
}

function response() {
  const state = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>, ended: false };
  const res = {
    headersSent: false,
    setHeader: (name: string, value: string) => { state.headers[name] = value; },
    status: (code: number) => { state.statusCode = code; return res; },
    json: (body: unknown) => { state.body = body; return res; },
    end: () => { state.ended = true; return res; },
    download: vi.fn(),
  };
  return { res, state };
}

describe("endpoints do Browser Worker H2 Ads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejeita pareamento incompleto sem consultar a camada de Worker", async () => {
    const routes = setupRoutes();
    const { res, state } = response();
    await routes["POST /api/h2ads/worker/claim"]({ body: { pairingCode: "" } }, res);
    expect(state.statusCode).toBe(400);
    expect(state.headers["Cache-Control"]).toBe("no-store, private");
    expect(claimH2AdsWorker).not.toHaveBeenCalled();
  });

  it("aceita o código somente pela rota de claim e devolve a credencial apenas ao Worker recém-pareado", async () => {
    claimH2AdsWorker.mockResolvedValue({ workerKey: "h2w_synthetic", workerToken: "h2wt_synthetic", workerName: "Windows principal", capacity: 1 });
    const routes = setupRoutes();
    const { res, state } = response();
    await routes["POST /api/h2ads/worker/claim"]({ body: { pairingCode: "H2W-synthetic", computerName: "WORKSTATION", agentVersion: "1.0.0" } }, res);
    expect(state.statusCode).toBe(201);
    expect(claimH2AdsWorker).toHaveBeenCalledWith({ pairingCode: "H2W-synthetic", computerName: "WORKSTATION", agentVersion: "1.0.0" });
    expect(state.body).toMatchObject({ workerKey: "h2w_synthetic", workerName: "Windows principal" });
  });

  it("rejeita heartbeat sem Bearer token e aceita somente o Worker autenticado", async () => {
    const routes = setupRoutes();
    const missing = response();
    await routes["POST /api/h2ads/worker/heartbeat"]({ body: { computerName: "WORKSTATION", agentVersion: "1.0.0" }, header: () => undefined }, missing.res);
    expect(missing.state.statusCode).toBe(401);
    expect(recordH2AdsWorkerHeartbeat).not.toHaveBeenCalled();

    recordH2AdsWorkerHeartbeat.mockResolvedValue(true);
    const accepted = response();
    await routes["POST /api/h2ads/worker/heartbeat"]({ body: { computerName: "WORKSTATION", agentVersion: "1.0.0" }, header: (name: string) => name === "authorization" ? "Bearer h2wt_synthetic" : "h2w_synthetic" }, accepted.res);
    expect(recordH2AdsWorkerHeartbeat).toHaveBeenCalledWith({ workerKey: "h2w_synthetic", workerToken: "h2wt_synthetic", computerName: "WORKSTATION", agentVersion: "1.0.0" });
    expect(accepted.state.statusCode).toBe(204);
    expect(accepted.state.ended).toBe(true);
  });

  it("não entrega comandos de preparação sem Worker autenticado", async () => {
    const routes = setupRoutes();
    const { res, state } = response();
    await routes["POST /api/h2ads/worker/commands/next"]({ body: {}, header: () => undefined }, res);
    expect(state.statusCode).toBe(401);
    expect(claimNextH2AdsWorkerCommand).not.toHaveBeenCalled();
  });

  it("entrega encerramento sem carregar a rota e registra estado fechado apenas para Worker autenticado", async () => {
    authenticateH2AdsWorker.mockResolvedValue({ id: 7, workerKey: "h2w_synthetic", name: "Windows", status: "active", capacity: 1 });
    claimNextH2AdsWorkerCommand.mockResolvedValue({ id: 9, workerId: 7, instanceId: 32, command: "close_browser" });
    const routes = setupRoutes();
    const next = response();
    await routes["POST /api/h2ads/worker/commands/next"]({ body: {}, header: (name: string) => name === "authorization" ? "Bearer h2wt_synthetic" : "h2w_synthetic" }, next.res);
    expect(next.state.statusCode).toBe(200);
    expect(next.state.body).toEqual({ command: { id: 9, instanceId: 32, command: "close_browser" } });
    expect(getH2AdsProxyCredential).not.toHaveBeenCalled();

    recordH2AdsBrowserRuntimeState.mockResolvedValue(true);
    const closed = response();
    await routes["POST /api/h2ads/worker/runs/:instanceId/state"]({ params: { instanceId: "32" }, body: { state: "closed" }, header: (name: string) => name === "authorization" ? "Bearer h2wt_synthetic" : "h2w_synthetic" }, closed.res);
    expect(recordH2AdsBrowserRuntimeState).toHaveBeenCalledWith({ workerId: 7, instanceId: 32, state: "closed" });
    expect(closed.state.statusCode).toBe(204);
  });
});
