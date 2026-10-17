import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const POLL_MS = 1_600;
const CDP_TIMEOUT_MS = 9_000;
const MAX_JPEG_BASE64_CHARS = 465_000;

/**
 * Controle local, experimental e limitado a UMA aba HTTP(S) do Chrome ja aberto.
 * A conexao CDP nunca deixa o loopback do Windows. Nenhum proxy ou perfil sai
 * do computador. Somente uma imagem JPEG temporaria segue ao servidor.
 */
export function startH2AdsMobileRemote({ browser, profileDirectory, panelUrl, workerKey, workerToken, instanceId }) {
  if (typeof WebSocket !== "function") return () => {};
  let busy = false;
  let stopped = false;
  let interval;
  let reportedFeatureUnavailable = false;

  const headers = () => ({
    Authorization: `Bearer ${workerToken}`,
    "X-H2ADS-Worker-Key": workerKey,
    "Content-Type": "application/json",
  });

  async function request(endpoint, body = {}) {
    const response = await fetch(`${panelUrl.replace(/\/$/, "")}/api/h2ads/worker/mobile/${instanceId}/${endpoint}`, {
      method: "POST", headers: headers(), body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`mobile_worker_http_${response.status}`);
    return response.json();
  }

  function localDebugPort() {
    const portFile = join(profileDirectory, "DevToolsActivePort");
    if (!existsSync(portFile)) return null;
    const port = Number(readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
    return Number.isSafeInteger(port) && port >= 1024 && port <= 65535 ? port : null;
  }

  async function targetForRemote() {
    const port = localDebugPort();
    if (!port) return null;
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const targets = await response.json();
    if (!Array.isArray(targets)) return null;
    const target = targets.find(t => t.type === "page" &&
      /^https?:\/\//i.test(String(t.url || "")) &&
      typeof t.webSocketDebuggerUrl === "string");
    if (!target) return null;
    const url = new URL(target.webSocketDebuggerUrl);
    // Nunca conectar CDP fora do localhost e da porta que o nosso Chrome escreveu.
    if (url.protocol !== "ws:" || !["127.0.0.1", "localhost"].includes(url.hostname) ||
        Number(url.port) !== port || !url.pathname.startsWith("/devtools/page/")) return null;
    return url.toString();
  }

  async function withCdp(endpoint, fn) {
    const socket = new WebSocket(endpoint);
    const pending = new Map();
    let serial = 0;
    const settleAll = error => {
      for (const item of pending.values()) item.reject(error);
      pending.clear();
    };

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("remote_cdp_timeout")), CDP_TIMEOUT_MS);
        socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("remote_cdp_unavailable")); }, { once: true });
      });
      socket.addEventListener("message", event => {
        let response;
        try { response = JSON.parse(String(event.data)); } catch { return; }
        const item = pending.get(response.id);
        if (!item) return;
        pending.delete(response.id);
        if (response.error) item.reject(new Error("remote_cdp_rejected"));
        else item.resolve(response.result || {});
      });
      socket.addEventListener("close", () => settleAll(new Error("remote_cdp_closed")));
      const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("remote_cdp_timeout"));
        }, CDP_TIMEOUT_MS);
        pending.set(id, {
          resolve: v => { clearTimeout(timer); resolve(v); },
          reject: e => { clearTimeout(timer); reject(e); },
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
      return await fn(send);
    } finally {
      try { socket.close(); } catch { }
      settleAll(new Error("remote_cdp_closed"));
    }
  }

  async function handleInput(send, job) {
    const metrics = await send("Page.getLayoutMetrics");
    const viewport = metrics.cssVisualViewport || metrics.cssLayoutViewport || {};
    const width = Math.max(1, Number(viewport.clientWidth) || 960);
    const height = Math.max(1, Number(viewport.clientHeight) || 700);
    if (job.kind === "tap" && Number.isFinite(job.x) && Number.isFinite(job.y) &&
        job.x >= 0 && job.x <= 1 && job.y >= 0 && job.y <= 1) {
      const x = job.x * width, y = job.y * height;
      await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, x, y });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, x, y });
    } else if (job.kind === "scroll" && Number.isFinite(job.deltaY)) {
      await send("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: width / 2, y: height / 2, deltaX: 0,
        deltaY: Math.max(-800, Math.min(800, job.deltaY)),
      });
    } else if (job.kind === "text" && typeof job.text === "string" && job.text.length <= 180) {
      await send("Input.insertText", { text: job.text });
    } else if (job.kind === "key" && ["Enter", "Backspace", "Tab", "Escape"].includes(job.key)) {
      const codes = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27 };
      const key = job.key, windowsVirtualKeyCode = codes[key];
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode });
    }
  }

  async function tick() {
    if (stopped || busy || !browser || browser.exitCode !== null) return;
    busy = true;
    try {
      const work = await request("next");
      if (!work?.active) return;
      const endpoint = await targetForRemote();
      if (!endpoint) return;
      await withCdp(endpoint, async send => {
        await send("Page.enable");
        if (work.input) await handleInput(send, work.input);
        if (work.capture) {
          const result = await send("Page.captureScreenshot", {
            format: "jpeg", quality: 42, fromSurface: true,
            captureBeyondViewport: false,
          });
          if (typeof result.data === "string" && result.data.length >= 136 &&
              result.data.length <= MAX_JPEG_BASE64_CHARS) {
            await request("frame", { workerLeaseId: work.workerLeaseId, imageBase64: result.data });
          }
        }
      });
    } catch (error) {
      if (!reportedFeatureUnavailable) {
        const code = error instanceof Error ? error.message : "remote_control_unavailable";
        console.warn("[H2AdsMobile] acesso remoto indisponivel:", code);
        reportedFeatureUnavailable = true;
      }
    } finally {
      busy = false;
    }
  }

  interval = setInterval(() => { void tick(); }, POLL_MS);
  interval.unref?.();
  void tick();
  return () => {
    stopped = true;
    if (interval) clearInterval(interval);
  };
}
