import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateH2AdsWorker, claimH2AdsWorker, claimNextH2AdsWorkerCommand, completeH2AdsWorkerBrowserCommand, completeH2AdsWorkerPreparation, decryptH2AdsProxy, getH2AdsInstance, getH2AdsProxyCredential, recordH2AdsBrowserRuntimeState, recordH2AdsWorkerHeartbeat, getDb } = vi.hoisted(() => ({
  authenticateH2AdsWorker: vi.fn(),
  claimH2AdsWorker: vi.fn(),
  claimNextH2AdsWorkerCommand: vi.fn(),
  completeH2AdsWorkerBrowserCommand: vi.fn(),
  completeH2AdsWorkerPreparation: vi.fn(),
  decryptH2AdsProxy: vi.fn(),
  getH2AdsInstance: vi.fn(),
  getH2AdsProxyCredential: vi.fn(),
  recordH2AdsBrowserRuntimeState: vi.fn(),
  recordH2AdsWorkerHeartbeat: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("./h2ads", () => ({ authenticateH2AdsWorker, claimH2AdsWorker, claimNextH2AdsWorkerCommand, completeH2AdsWorkerBrowserCommand, completeH2AdsWorkerPreparation, getH2AdsInstance, getH2AdsProxyCredential, recordH2AdsBrowserRuntimeState, recordH2AdsWorkerHeartbeat }));
vi.mock("./h2adsProxySecurity", () => ({ decryptH2AdsProxy }));
vi.mock("./db", () => ({ getDb }));

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

function workerHeader(name: string, includeVersion = true) {
  if (name === "authorization") return "Bearer h2wt_synthetic";
  if (name === "x-h2ads-worker-key") return "h2w_synthetic";
  if (name === "x-h2ads-agent-version" && includeVersion) return "1.3.0";
  return undefined;
}

describe("endpoints do Browser Worker H2 Ads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDb.mockResolvedValue(null);
  });

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
    await routes["POST /api/h2ads/worker/heartbeat"]({ body: { computerName: "WORKSTATION", agentVersion: "1.3.0" }, header: (name: string) => workerHeader(name) }, accepted.res);
    expect(recordH2AdsWorkerHeartbeat).toHaveBeenCalledWith({ workerKey: "h2w_synthetic", workerToken: "h2wt_synthetic", computerName: "WORKSTATION", agentVersion: "1.3.0" });
    expect(accepted.state.statusCode).toBe(204);
    expect(accepted.state.ended).toBe(true);
  });

  it("não entrega comandos sem Worker autenticado", async () => {
    const routes = setupRoutes();
    const { res, state } = response();
    await routes["POST /api/h2ads/worker/commands/next"]({ body: {}, header: () => undefined }, res);
    expect(state.statusCode).toBe(401);
    expect(claimNextH2AdsWorkerCommand).not.toHaveBeenCalled();
  });

  it("impede agente antigo de capturar comandos de navegador", async () => {
    authenticateH2AdsWorker.mockResolvedValue({ id: 7, workerKey: "h2w_synthetic", name: "Windows", status: "active", capacity: 1 });
    const routes = setupRoutes();
    const outdated = response();
    await routes["POST /api/h2ads/worker/commands/next"]({ body: {}, header: (name: string) => workerHeader(name, false) }, outdated.res);
    expect(outdated.state.statusCode).toBe(426);
    expect(outdated.state.body).toEqual({ error: "Atualize o agente H2 Ads para executar comandos de navegador." });
    expect(claimNextH2AdsWorkerCommand).not.toHaveBeenCalled();
  });

  it("envia o nome da instância junto da rota protegida para rotular a janela do browser", async () => {
    authenticateH2AdsWorker.mockResolvedValue({ id: 7, workerKey: "h2w_synthetic", name: "Windows", status: "active", capacity: 1 });
    claimNextH2AdsWorkerCommand.mockResolvedValue({ id: 10, workerId: 7, instanceId: 32, command: "launch_browser" });
    getH2AdsProxyCredential.mockResolvedValue("encrypted-proxy");
    decryptH2AdsProxy.mockReturnValue({ protocol: "http", host: "127.0.0.1", port: 8080, username: "worker", password: "secret", rotationMinutes: null });
    getH2AdsInstance.mockResolvedValue({ id: 32, name: "460 LEANDRO DE MORAES DOS SANTOS" });
    const routes = setupRoutes();
    const next = response();

    await routes["POST /api/h2ads/worker/commands/next"]({ body: {}, header: (name: string) => workerHeader(name) }, next.res);

    expect(next.state.statusCode).toBe(200);
    expect(next.state.body).toMatchObject({
      command: { id: 10, instanceId: 32, command: "launch_browser" },
      proxy: { instanceName: "460 LEANDRO DE MORAES DOS SANTOS" },
    });
    expect(getH2AdsInstance).toHaveBeenCalledWith(32);
  });

  it("mantém o componente de sessão válido e fixa o título H2ADS no Chrome local", () => {
    const sessionPath = path.resolve(import.meta.dirname, "..", "workers", "windows", "browser-session.mjs");
    const syntax = spawnSync(process.execPath, ["--check", sessionPath], { encoding: "utf8" });
    expect(syntax.status, syntax.stderr).toBe(0);
    const source = fs.readFileSync(sessionPath, "utf8");
    expect(source).toContain("instanceWindowTitle");
    expect(source).toContain("Page.addScriptToEvaluateOnNewDocument");
    expect(source).toContain("--remote-debugging-address=127.0.0.1");
    expect(source).toContain("--remote-debugging-port=0");
  });

  it("entrega encerramento sem carregar a rota e registra estado fechado apenas para Worker atualizado", async () => {
    authenticateH2AdsWorker.mockResolvedValue({ id: 7, workerKey: "h2w_synthetic", name: "Windows", status: "active", capacity: 1 });
    claimNextH2AdsWorkerCommand.mockResolvedValue({ id: 9, workerId: 7, instanceId: 32, command: "close_browser" });
    const routes = setupRoutes();
    const next = response();
    await routes["POST /api/h2ads/worker/commands/next"]({ body: {}, header: (name: string) => workerHeader(name) }, next.res);
    expect(next.state.statusCode).toBe(200);
    expect(next.state.body).toEqual({ command: { id: 9, instanceId: 32, command: "close_browser" } });
    expect(getH2AdsProxyCredential).not.toHaveBeenCalled();

    recordH2AdsBrowserRuntimeState.mockResolvedValue(true);
    const closed = response();
    await routes["POST /api/h2ads/worker/runs/:instanceId/state"]({ params: { instanceId: "32" }, body: { state: "closed" }, header: (name: string) => workerHeader(name) }, closed.res);
    expect(recordH2AdsBrowserRuntimeState).toHaveBeenCalledWith({ workerId: 7, instanceId: 32, state: "closed" });
    expect(closed.state.statusCode).toBe(204);
  });
});
