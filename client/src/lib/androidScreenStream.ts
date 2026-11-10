export type AndroidScreenFrame = {
  src: string;
  width: number;
  height: number;
};

export type AndroidScreenTransport = {
  request(url: string, signal: AbortSignal): Promise<Blob | null>;
  decode(src: string): Promise<{ width: number; height: number }>;
  createUrl(blob: Blob): string;
  revokeUrl(src: string): void;
  schedule(task: () => void, delay: number): () => void;
};

export type AndroidScreenStream = {
  refresh(): void;
  shown(src: string): void;
  stop(): void;
};

const browserTransport: AndroidScreenTransport = {
  async request(url, signal) {
    const response = await fetch(url, { signal, credentials: "same-origin", cache: "no-store" });
    if (response.status === 204) return null;
    if (!response.ok) {
      const diagnostic = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(diagnostic?.error || "Tela temporariamente indisponivel.");
    }
    const blob = await response.blob();
    return blob.size > 0 && blob.type === "image/png" ? blob : null;
  },
  async decode(src) {
    const image = new Image();
    image.src = src;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  },
  createUrl: blob => URL.createObjectURL(blob),
  revokeUrl: src => URL.revokeObjectURL(src),
  schedule(task, delay) {
    const timer = setTimeout(task, delay);
    return () => clearTimeout(timer);
  },
};

/** Publish only decoded frames. The last displayed frame survives empty/failed polls. */
export function startAndroidScreenStream(
  url: string,
  onFrame: (frame: AndroidScreenFrame) => void,
  { transport = browserTransport, intervalMs = 3000, onError }: {
    transport?: AndroidScreenTransport;
    intervalMs?: number;
    onError?: (message: string) => void;
  } = {},
): AndroidScreenStream {
  let stopped = false;
  let busy = false;
  let refreshPending = false;
  let sequence = 0;
  let currentSrc: string | null = null;
  let request: AbortController | null = null;
  let cancelTimer: (() => void) | null = null;
  const ownedUrls = new Set<string>();
  const publishedUrls = new Set<string>();

  function release(src: string) {
    publishedUrls.delete(src);
    if (ownedUrls.delete(src)) transport.revokeUrl(src);
  }

  async function poll(): Promise<void> {
    if (stopped) return;
    if (busy) {
      refreshPending = true;
      return;
    }
    cancelTimer?.();
    cancelTimer = null;
    busy = true;
    const controller = new AbortController();
    request = controller;
    let candidate: string | null = null;
    try {
      const separator = url.includes("?") ? "&" : "?";
      const blob = await transport.request(url + separator + "t=" + Date.now() + "-" + sequence++, controller.signal);
      if (stopped || controller.signal.aborted || !blob) return;
      candidate = transport.createUrl(blob);
      ownedUrls.add(candidate);
      const size = await transport.decode(candidate);
      if (stopped || controller.signal.aborted) return;
      if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
        throw new Error("Quadro sem dimensoes.");
      }
      currentSrc = candidate;
      publishedUrls.add(candidate);
      const frame = { src: candidate, ...size };
      candidate = null;
      onFrame(frame);
    } catch (error) {
      // Keep the previous frame, but show a safe diagnostic to the administrator.
      if (!stopped && !controller.signal.aborted) onError?.(error instanceof Error ? error.message : "Erro ao consultar a tela.");
    } finally {
      if (candidate) release(candidate);
      if (request === controller) request = null;
      busy = false;
      if (!stopped) {
        const delay = refreshPending ? 0 : intervalMs;
        refreshPending = false;
        cancelTimer = transport.schedule(() => {
          cancelTimer = null;
          void poll();
        }, delay);
      }
    }
  }

  const stream: AndroidScreenStream = {
    refresh() { void poll(); },
    shown(src) {
      if (stopped || src !== currentSrc) return;
      // Release older images only after the replacement is shown by the DOM image.
      for (const previous of publishedUrls) if (previous !== src) release(previous);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      cancelTimer?.();
      cancelTimer = null;
      request?.abort();
      for (const src of ownedUrls) release(src);
      currentSrc = null;
    },
  };
  stream.refresh();
  return stream;
}
