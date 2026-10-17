const POLL_MS = 1_600;
const CDP_TIMEOUT_MS = 9_000;
const MAX_JPEG_BASE64_CHARS = 465_000;
const MAX_CDP_BUFFER = 2_000_000;

/**
 * Ponte local CDP over pipe (fd 3/4, JSON delimitado por NUL).
 * Nao abre porta de depuracao, nao injeta scripts e nao modifica paginas.
 * Apenas uma aba HTTP(S) e selecionada para o piloto.
 */
export function startH2AdsMobileRemote({ browser, panelUrl, workerKey, workerToken, instanceId }) {
  const writer = browser?.stdio?.[3];
  const reader = browser?.stdio?.[4];
  if (!writer || !reader) return () => {};

  let stopped = false;
  let busy = false;
  let loggedError = false;
  let serial = 0;
  // A aba e fixada por sessao: nunca migrar o controle para outra aba por engano.
  let pinnedLeaseId = null;
  let pinnedTargetId = null;
  let inputBuffer = "";
  const decoder = new TextDecoder();
  const pending = new Map();

  const rejectPending = () => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("remote_pipe_closed"));
    }
    pending.clear();
  };

  const onData = chunk => {
    inputBuffer += decoder.decode(chunk, { stream: true });
    if (inputBuffer.length > MAX_CDP_BUFFER) {
      inputBuffer = "";
      rejectPending();
      return;
    }
    let boundary;
    while ((boundary = inputBuffer.indexOf("\0")) >= 0) {
      const message = inputBuffer.slice(0, boundary);
      inputBuffer = inputBuffer.slice(boundary + 1);
      let data;
      try { data = JSON.parse(message); } catch { continue; }
      const item = pending.get(data.id);
      if (!item) continue;
      pending.delete(data.id);
      clearTimeout(item.timer);
      if (data.error) item.reject(new Error("remote_cdp_rejected"));
      else item.resolve(data.result || {});
    }
  };
  const onClose = () => { stopped = true; rejectPending(); };
  reader.on("data", onData);
  reader.on("error", onClose);
  reader.on("close", onClose);
  writer.on("error", onClose);
  writer.on("close", onClose);

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (stopped || writer.destroyed || !writer.writable) {
      reject(new Error("remote_pipe_unavailable"));
      return;
    }
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("remote_cdp_timeout"));
    }, CDP_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    const command = { id, method, params };
    if (sessionId) command.sessionId = sessionId;
    try {
      writer.write(JSON.stringify(command) + "\0");
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      reject(new Error("remote_cdp_unavailable"));
    }
  });

  const headers = {
    Authorization: `Bearer ${workerToken}`,
    "X-H2ADS-Worker-Key": workerKey,
    "Content-Type": "application/json",
  };

  async function remoteRequest(endpoint, body = {}) {
    const response = await fetch(`${panelUrl.replace(/\/$/, "")}/api/h2ads/worker/mobile/${instanceId}/${endpoint}`, {
      method: "POST", headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`mobile_worker_http_${response.status}`);
    return response.json();
  }

  async function handleInput(sendPage, job) {
    const metrics = await sendPage("Page.getLayoutMetrics");
    const viewport = metrics.cssVisualViewport || metrics.cssLayoutViewport || {};
    const width = Math.max(1, Number(viewport.clientWidth) || 960);
    const height = Math.max(1, Number(viewport.clientHeight) || 700);
    if (job.kind === "tap" && Number.isFinite(job.x) && Number.isFinite(job.y) &&
        job.x >= 0 && job.x <= 1 && job.y >= 0 && job.y <= 1) {
      const x = job.x * width, y = job.y * height;
      await sendPage("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, x, y });
      await sendPage("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, x, y });
    } else if (job.kind === "scroll" && Number.isFinite(job.deltaY)) {
      await sendPage("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: width / 2, y: height / 2, deltaX: 0,
        deltaY: Math.max(-800, Math.min(800, job.deltaY)),
      });
    } else if (job.kind === "text" && typeof job.text === "string" && job.text.length <= 180) {
      await sendPage("Input.insertText", { text: job.text });
    } else if (job.kind === "key" && ["Enter", "Backspace", "Tab", "Escape"].includes(job.key)) {
      const codes = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27 };
      const key = job.key, windowsVirtualKeyCode = codes[key];
      await sendPage("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode });
      await sendPage("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode });
    }
  }

  async function tick() {
    if (stopped || busy || !browser || browser.exitCode !== null) return;
    busy = true;
    try {
      const work = await remoteRequest("next");
      if (!work?.active) {
        pinnedLeaseId = null;
        pinnedTargetId = null;
        return;
      }
      if (work.workerLeaseId !== pinnedLeaseId) {
        pinnedLeaseId = work.workerLeaseId;
        pinnedTargetId = null;
      }
      const { targetInfos } = await send("Target.getTargets");
      // Evita enviar comandos para a aba errada quando houver varias paginas.
      // O piloto controla somente o caso em que existe uma unica aba HTTP(S).
      const eligible = Array.isArray(targetInfos) ? targetInfos.filter(info =>
        info.type === "page" && /^https?:\/\//i.test(String(info.url || ""))) : [];
      if (eligible.length !== 1 || !eligible[0]?.targetId) return;
      const target = eligible[0];
      if (!pinnedTargetId) pinnedTargetId = target.targetId;
      // Se uma aba for substituida, mesmo que reste apenas uma, nao redirecionar
      // os toques nem o teclado para a nova pagina sem uma nova sessao ADM.
      if (target.targetId !== pinnedTargetId) return;
      const attached = await send("Target.attachToTarget", { targetId: pinnedTargetId, flatten: true });
      if (!attached.sessionId) return;
      const sessionId = attached.sessionId;
      const sendPage = (method, params = {}) => send(method, params, sessionId);
      try {
        const fresh = await send("Target.getTargetInfo", { targetId: pinnedTargetId });
        const current = fresh?.targetInfo;
        if (!current || current.targetId !== pinnedTargetId ||
            current.type !== "page" || !/^https?:\/\//i.test(String(current.url || ""))) return;
        await sendPage("Page.enable");
        if (work.input) await handleInput(sendPage, work.input);
        if (work.capture) {
          const result = await sendPage("Page.captureScreenshot", {
            format: "jpeg", quality: 42, fromSurface: true, captureBeyondViewport: false,
          });
          if (typeof result.data === "string" && result.data.length >= 136 &&
              result.data.length <= MAX_JPEG_BASE64_CHARS) {
            await remoteRequest("frame", { workerLeaseId: work.workerLeaseId, imageBase64: result.data });
          }
        }
      } finally {
        await send("Target.detachFromTarget", { sessionId }).catch(() => undefined);
      }
    } catch (error) {
      if (!loggedError) {
        const code = error instanceof Error ? error.message : "remote_control_unavailable";
        console.warn("[H2AdsMobile] controle remoto indisponivel:", code);
        loggedError = true;
      }
    } finally {
      busy = false;
    }
  }

  const interval = setInterval(() => { void tick(); }, POLL_MS);
  interval.unref?.();
  void tick();
  return () => {
    stopped = true;
    clearInterval(interval);
    reader.off("data", onData);
    reader.off("error", onClose);
    reader.off("close", onClose);
    writer.off("error", onClose);
    writer.off("close", onClose);
    rejectPending();
  };
}
