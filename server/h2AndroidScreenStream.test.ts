import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startAndroidScreenStream,
  type AndroidScreenFrame,
  type AndroidScreenStream,
  type AndroidScreenTransport,
} from "../client/src/lib/androidScreenStream";

const streams: AndroidScreenStream[] = [];
const png = new Blob(["frame"], { type: "image/png" });
const size = { width: 1080, height: 2400 };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  let nextId = 0;
  const frames: AndroidScreenFrame[] = [];
  const request = vi.fn(async (_url: string, _signal: AbortSignal): Promise<Blob | null> => png);
  const decode = vi.fn(async (_src: string) => size);
  const revokeUrl = vi.fn();
  const transport: AndroidScreenTransport = {
    request, decode, revokeUrl,
    createUrl: () => "blob:frame-" + ++nextId,
    schedule(task, delay) {
      const timer = setTimeout(task, delay);
      return () => clearTimeout(timer);
    },
  };
  return {
    frames, request, decode, revokeUrl,
    start() {
      const stream = startAndroidScreenStream("/api/h2-android/screen/agent/H2Android_01", frame => frames.push(frame), { transport });
      streams.push(stream);
      return stream;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  streams.splice(0).forEach(stream => stream.stop());
  vi.useRealTimers();
});

describe("H2 Android - imagem estavel durante atualizacoes", () => {
  it("publica o primeiro quadro somente depois da decodificacao", async () => {
    const h = harness();
    const decoded = deferred<typeof size>();
    h.decode.mockReturnValueOnce(decoded.promise);
    h.start();
    await flush();
    expect(h.frames).toEqual([]);
    decoded.resolve(size);
    await flush();
    expect(h.frames).toEqual([{ src: "blob:frame-1", ...size }]);
  });

  it("mantem o quadro anterior durante uma atualizacao lenta e libera sua URL apenas depois da troca", async () => {
    const h = harness();
    const stream = h.start();
    await flush();
    stream.shown(h.frames[0].src);
    const decoded = deferred<typeof size>();
    h.decode.mockReturnValueOnce(decoded.promise);
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.frames).toHaveLength(1);
    expect(h.frames[0]).toEqual({ src: "blob:frame-1", ...size });
    expect(h.revokeUrl).not.toHaveBeenCalled();
    decoded.resolve(size);
    await flush();
    expect(h.frames).toHaveLength(2);
    expect(h.revokeUrl).not.toHaveBeenCalled();
    stream.shown(h.frames[1].src);
    expect(h.revokeUrl).toHaveBeenCalledTimes(1);
    expect(h.revokeUrl).toHaveBeenCalledWith("blob:frame-1");
  });

  it("nao apaga o quadro em resposta vazia ou falha temporaria e retoma a atualizacao", async () => {
    const h = harness();
    h.request.mockResolvedValueOnce(png).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("offline"));
    h.start();
    await flush();
    await vi.advanceTimersByTimeAsync(6000);
    expect(h.frames).toEqual([{ src: "blob:frame-1", ...size }]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.frames).toHaveLength(2);
  });

  it("cancela pedidos e impede um quadro atrasado de reaparecer depois de fechar a tela", async () => {
    const h = harness();
    const decoded = deferred<typeof size>();
    h.decode.mockReturnValueOnce(decoded.promise);
    const stream = h.start();
    await flush();
    stream.stop();
    expect(h.request.mock.calls[0][1].aborted).toBe(true);
    expect(h.revokeUrl).toHaveBeenCalledTimes(1);
    expect(h.revokeUrl).toHaveBeenCalledWith("blob:frame-1");
    decoded.resolve(size);
    await flush();
    await vi.advanceTimersByTimeAsync(30000);
    expect(h.frames).toEqual([]);
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("agrupa refreshes manuais sem iniciar requisicoes simultaneas", async () => {
    const h = harness();
    const response = deferred<Blob | null>();
    h.request.mockReturnValueOnce(response.promise);
    const stream = h.start();
    stream.refresh();
    stream.refresh();
    expect(h.request).toHaveBeenCalledTimes(1);
    response.resolve(png);
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.request).toHaveBeenCalledTimes(2);
  });

  it("descarta quadros invalidos e libera todas as imagens ao encerrar", async () => {
    const h = harness();
    const stream = h.start();
    await flush();
    h.decode.mockResolvedValueOnce({ width: 0, height: 0 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.frames).toEqual([{ src: "blob:frame-1", ...size }]);
    expect(h.revokeUrl).toHaveBeenCalledWith("blob:frame-2");
    stream.stop();
    expect(h.revokeUrl).toHaveBeenCalledWith("blob:frame-1");
    expect(vi.getTimerCount()).toBe(0);
  });
});
