// Local-only Chrome DevTools Protocol pipe. No TCP debug port, global
// Chrome policy, proxy credential, fingerprint override or CAPTCHA solver.
const patterns = [
  "*://google.com/sorry*", "*://*.google.com/sorry*",
  "*://google.com.br/sorry*", "*://*.google.com.br/sorry*",
].map(urlPattern => ({ urlPattern, resourceType: "Document", requestStage: "Request" }));

export function isGoogleSorryUrl(raw) {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const googleHost = host === "google.com" || host.endsWith(".google.com")
      || host === "google.com.br" || host.endsWith(".google.com.br");
    return (parsed.protocol === "https:" || parsed.protocol === "http:")
      && googleHost && /^\/sorry(?:\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export const googleVerificationNotice = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>H2ADS - Verificacao solicitada</title>
<style>
html,body{margin:0;min-height:100%;background:#09111f;color:#e5eefc;font-family:Arial,sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:20px;box-sizing:border-box}
section{width:min(680px,100%);border:1px solid #334155;border-radius:18px;background:#111d30;padding:32px;box-sizing:border-box}
small{color:#67e8f9;font-weight:700;letter-spacing:.1em}
h1{font-size:26px;margin:15px 0}
p{color:#cbd5e1;line-height:1.6}
a{color:#67e8f9}
</style></head><body><main><section><small>H2ADS - AVISO DE NAVEGACAO</small>
<h1>O Google solicitou uma verificacao</h1>
<p>A pesquisa foi interrompida por uma verificacao do Google. O H2ADS nao
resolve nem contorna reCAPTCHA. A janela e suas abas permanecem abertas.</p>
<p>Voce pode concluir a verificacao manualmente no Google, caso precise, ou
usar outro mecanismo de pesquisa. Nenhum endereco IP foi incluído neste aviso.</p>
<p><a href="https://www.bing.com/">Abrir Bing</a></p>
</section></main></body></html>`;

export function startGoogleSorryGuard(chrome, { onFailure = () => {}, onBlocked = () => {}, timeoutMs = 12000 } = {}) {
  const writer = chrome?.stdio?.[3];
  const reader = chrome?.stdio?.[4];
  if (!writer || !reader) throw new Error("privacy_guard_pipe_unavailable");
  const pending = new Map();
  const sessions = new Set();
  const decoder = new TextDecoder();
  let nextId = 0;
  let buffer = "";
  let state = "starting";
  let autoAttachReady = false;
  let configuredPages = 0;
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const startTimer = setTimeout(() => fail("privacy_guard_start_timeout"), timeoutMs);
  startTimer.unref?.();

  function cleanupPending() {
    for (const wait of pending.values()) {
      clearTimeout(wait.timer);
      wait.reject(new Error("privacy_guard_protocol_closed"));
    }
    pending.clear();
  }

  function fail(code) {
    if (state === "failed" || state === "closed") return;
    state = "failed";
    clearTimeout(startTimer);
    cleanupPending();
    readyReject(new Error(code));
    try { onFailure(code); } catch { }
  }

  function send(method, params = {}, sessionId) {
    if (state === "failed" || state === "closed") {
      return Promise.reject(new Error("privacy_guard_protocol_closed"));
    }
    const id = ++nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("privacy_guard_command_timeout"));
      }, Math.min(timeoutMs, 7000));
      timer.unref?.();
      pending.set(id, { resolve, reject, timer });
      try {
        writer.write(JSON.stringify(message) + "\0");
      } catch {
        clearTimeout(timer);
        pending.delete(id);
        reject(new Error("privacy_guard_pipe_write_failed"));
      }
    });
  }

  function maybeReady() {
    if (state !== "starting" || !autoAttachReady || configuredPages < 1) return;
    state = "active";
    clearTimeout(startTimer);
    readyResolve(true);
  }

  async function attached(message) {
    const sessionId = message.params?.sessionId;
    if (!sessionId) return;
    if (message.params?.targetInfo?.type !== "page") {
      await send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => undefined);
      return;
    }
    if (sessions.has(sessionId)) return;
    sessions.add(sessionId);
    try {
      await send("Fetch.enable", { patterns }, sessionId);
      configuredPages += 1;
      maybeReady();
      await send("Runtime.runIfWaitingForDebugger", {}, sessionId);
    } catch {
      fail("privacy_guard_session_setup_failed");
    }
  }

  async function paused(message) {
    const sessionId = message.sessionId;
    const params = message.params || {};
    if (!sessionId || !params.requestId) return;
    try {
      if (params.resourceType === "Document" && isGoogleSorryUrl(params.request?.url)) {
        await send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "text/html; charset=utf-8" },
            { name: "Cache-Control", value: "no-store" },
            { name: "X-Content-Type-Options", value: "nosniff" },
            { name: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; form-action https://www.bing.com" },
          ],
          body: Buffer.from(googleVerificationNotice, "utf8").toString("base64"),
        }, sessionId);
        try { onBlocked(); } catch { }
      } else {
        await send("Fetch.continueRequest", { requestId: params.requestId }, sessionId);
      }
    } catch {
      fail("privacy_guard_interception_failed");
    }
  }

  function processMessage(raw) {
    if (!raw) return;
    let message;
    try { message = JSON.parse(raw); } catch {
      fail("privacy_guard_invalid_protocol");
      return;
    }
    if (Number.isInteger(message.id)) {
      const wait = pending.get(message.id);
      if (!wait) return;
      clearTimeout(wait.timer);
      pending.delete(message.id);
      if (message.error) wait.reject(new Error("privacy_guard_command_rejected"));
      else wait.resolve(message.result || {});
      return;
    }
    if (message.method === "Target.attachedToTarget") {
      void attached(message);
    } else if (message.method === "Target.detachedFromTarget") {
      sessions.delete(message.params?.sessionId);
    } else if (message.method === "Fetch.requestPaused") {
      void paused(message);
    }
  }

  const onData = (chunk) => {
    if (state === "closed" || state === "failed") return;
    buffer += decoder.decode(chunk, { stream: true });
    if (buffer.length > 4 * 1024 * 1024) { fail("privacy_guard_protocol_oversized"); return; }
    let index;
    while ((index = buffer.indexOf("\0")) !== -1) {
      const message = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      processMessage(message);
      if (state === "failed") return;
    }
  };
  const onEnd = () => fail("privacy_guard_pipe_closed");
  reader.on("data", onData);
  reader.on("end", onEnd);
  reader.on("error", onEnd);
  writer.on("error", onEnd);
  void send("Target.setAutoAttach", {
    autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
    filter: [{ type: "page", exclude: false }],
  }).then(() => { autoAttachReady = true; maybeReady(); }).catch(() => fail("privacy_guard_attach_failed"));

  function close() {
    if (state === "closed") return;
    const wasStarting = state === "starting";
    state = "closed";
    clearTimeout(startTimer);
    reader.off("data", onData);
    reader.off("end", onEnd);
    reader.off("error", onEnd);
    writer.off("error", onEnd);
    cleanupPending();
    if (wasStarting) readyReject(new Error("privacy_guard_closed"));
  }

  return { ready, close, send, getState: () => state };
}
