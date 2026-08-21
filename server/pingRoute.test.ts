import { describe, expect, it, vi } from "vitest";
import { registerPingRoute } from "./_core/pingRoute";

type PingHandler = (_req: unknown, res: {
  set: (headers: Record<string, string>) => unknown;
  status: (code: number) => { json: (body: unknown) => unknown };
}) => void;

describe("rota pública /api/ping", () => {
  it("responde 200 com corpo mínimo e cabeçalhos contra cache", () => {
    const get = vi.fn();
    registerPingRoute({ get } as never);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/api/ping", expect.any(Function));

    const handler = get.mock.calls[0][1] as PingHandler;
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const set = vi.fn();

    handler({}, { set, status });

    expect(set).toHaveBeenCalledWith({
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      Pragma: "no-cache",
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, ts: expect.any(Number) }));
  });
});
