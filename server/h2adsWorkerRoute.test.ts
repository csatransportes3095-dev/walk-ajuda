import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateH2AdsWorker = vi.fn();
const claimNextH2AdsWorkerCommand = vi.fn();
const decryptH2AdsProxy = vi.fn();
const getH2AdsInstance = vi.fn();
const completeH2AdsWorkerCommand = vi.fn();
const recordH2AdsBrowserRuntimeState = vi.fn();

vi.mock("./h2ads", async () => {
  const actual = await vi.importActual<any>("./h2ads");
  return {
    ...actual,
    authenticateH2AdsWorker,
    claimNextH2AdsWorkerCommand,
    decryptH2AdsProxy,
    getH2AdsInstance,
    completeH2AdsWorkerCommand,
    recordH2AdsBrowserRuntimeState,
  };
});

import { createH2AdsWorkerRouteHandlers } from "./h2adsWorkerRoute";

function response() {
  const state: any = { statusCode: 200, body: undefined };
  return {
    state,
    res: {
      status(code: number) { state.statusCode = code; return this; },
      json(body: unknown) { state.body = body; return this; },
      send(body?: unknown) { state.body = body; return this; },
      setHeader() { return this; },
      end() { return this; },
    },
  };
}

function workerHeader(name: string) {
  if (name.toLowerCase() === "authorization") return "Bearer synthetic";
  if (name.toLowerCase() === "x-h2ads-worker-key") return "h2w_synthetic";
  if (name.toLowerCase() === "x-h2ads-agent-version") return "1.3.9";
  return undefined;
}

function setupRoutes() {
  return createH2AdsWorkerRouteHandlers();
}

describe("endpoints do Browser Worker H2 Ads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateH2AdsWorker.mockResolvedValue({ id: 7, workerKey: "h2w_synthetic", name: "Windows", status: "active", capacity: 1 });
    claimNextH2AdsWorkerCommand.mockResolvedValue(null);
    completeH2AdsWorkerCommand.mockResolvedValue(true);
    recordH2AdsBrowserRuntimeState.mockResolvedValue(true);
  });

  it("não entrega comando quando não existe item pendente", async () => {
    const routes = setupRoutes();
    const out = response();
    await routes["POST /api/h2ads/worker/commands/next"]({ body: {}, header: (name: string) => workerHeader(name) }, out.res);
    expect(out.state.statusCode).toBe(204);
  });

  it("entrega preparação isolada por instância", async () => {
    claimNextH2AdsWorkerCommand.mockResolvedValue({ id: 8, workerId: 7, instanceId: 31, command: "prepare_browser" });
    const routes = setupRoutes();
    const out = response();
    await routes["POST /api/h2ads/worker/commands/next"]({ body: {}, header: (name: string) => workerHeader(name) }, out.res);
    expect(out.state.statusCode).toBe(200);
    expect(out.state.body).toEqual({ command: { id: 8, instanceId: 31, command: "prepare_browser" } });
  });

  it("entrega lançamento com proxy descriptografado somente ao Worker autenticado", async () => {
    claimNextH2AdsWorkerCommand.mockResolvedValue({ id: 10, workerId: 7, instanceId: 32, command: "launch_browser" });
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

  it("mantém o componente de sessão válido e limita o Privacy Guard ao CDP local sem injetar scripts", () => {
    const sessionPath = path.resolve(import.meta.dirname, "..", "workers", "windows", "browser-session.mjs");
    const syntax = spawnSync(process.execPath, ["--check", sessionPath], { encoding: "utf8" });
    expect(syntax.status, syntax.stderr).toBe(0);
    const source = fs.readFileSync(sessionPath, "utf8");
    expect(source).toContain("instanceWindowTitle");
    expect(source).toContain("h2ads-instance-label.html");
    expect(source).toContain("pathToFileURL");
    expect(source).not.toContain("MutationObserver");
    expect(source).not.toContain("Page.addScriptToEvaluateOnNewDocument");
    expect(source).toContain("--remote-debugging-address=127.0.0.1");
    expect(source).toContain("--remote-debugging-port=0");
    expect(source).toContain("Fetch.enable");
    expect(source).toContain("Fetch.fulfillRequest");
    expect(source).toContain("google.com/sorry");
    expect(source).toContain("google.com.br/sorry");
    expect(source).not.toContain("Runtime.evaluate");
  });

  it("entrega encerramento sem carregar a rota e registra estado fechado apenas para Worker atualizado", async () => {
    authenticateH2AdsWorker.mockResolvedValue({ id: 7, workerKey: "h2w_synthetic", name: "Windows", status: "active", capacity: 1 });
    claimNextH2AdsWorkerCommand.mockResolvedValue({ id: 9, workerId: 7, instanceId: 32, command: "close_browser" });
    const routes = setupRoutes();
    const next = response();
    await routes["POST /api/h2ads/worker/commands/next"]({ body: {}, header: (name: string) => workerHeader(name) }, next.res);
    expect(next.state.statusCode).toBe(200);
    expect(next.state.body).toEqual({ command: { id: 9, instanceId: 32, command: "close_browser" } });
    expect(getH2AdsInstance).not.toHaveBeenCalled();

    recordH2AdsBrowserRuntimeState.mockResolvedValue(true);
    const closed = response();
    await routes["POST /api/h2ads/worker/runs/:instanceId/state"]({ params: { instanceId: "32" }, body: { state: "closed" }, header: (name: string) => workerHeader(name) }, closed.res);
    expect(recordH2AdsBrowserRuntimeState).toHaveBeenCalledWith({ workerId: 7, instanceId: 32, state: "closed" });
    expect(closed.state.statusCode).toBe(204);
  });
});