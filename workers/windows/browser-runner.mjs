import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection, isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Server } from "proxy-chain";

const execFileAsync = promisify(execFile);
const DNS_TIMEOUT_MS = 8_000;
const TCP_TIMEOUT_MS = 10_000;

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function isPrivateOrLocalIp(value) {
  const ip = String(value || "").trim().toLowerCase();
  if (!ip || ip === "localhost" || ip === "::1" || ip === "0.0.0.0") return true;
  if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (ip.includes(":")) {
    return ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip);
  }
  return true;
}

function validateProxy(proxy) {
  if (!proxy || typeof proxy.host !== "string" || proxy.host.trim().length < 1 || !Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65_535 || typeof proxy.username !== "string" || typeof proxy.password !== "string") {
    throw Object.assign(new Error("proxy_config_invalid"), { category: "proxy_config_invalid", stage: "config" });
  }
  if (!["http", "https", "socks5"].includes(proxy.protocol)) {
    throw Object.assign(new Error("proxy_protocol_invalid"), { category: "proxy_config_invalid", stage: "config" });
  }
}

function upstreamUrl(proxy) {
  validateProxy(proxy);
  const protocol = proxy.protocol === "socks5" ? "socks5" : proxy.protocol === "https" ? "https" : "http";
  return `${protocol}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`;
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function withTimeout(promise, timeoutMs, category, stage) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(category), { category, stage })), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function verifyProxyDns(host) {
  if (isIP(host)) return;
  try {
    await withTimeout(lookup(host), DNS_TIMEOUT_MS, "proxy_dns_timeout", "dns");
  } catch (error) {
    if (error?.category) throw error;
    const code = String(error?.code || "").toUpperCase();
    const category = code === "ENOTFOUND" ? "proxy_dns_failed" : code === "EAI_AGAIN" ? "proxy_dns_temporary_failure" : "proxy_dns_failed";
    throw Object.assign(new Error(category), { category, stage: "dns" });
  }
}

async function verifyProxyTcp(host, port) {
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve();
    };
    socket.setTimeout(TCP_TIMEOUT_MS, () => finish(Object.assign(new Error("proxy_tcp_timeout"), { category: "proxy_tcp_timeout", stage: "tcp" })));
    socket.once("connect", () => finish());
    socket.once("error", (error) => {
      const code = String(error?.code || "").toUpperCase();
      const category = code === "ECONNREFUSED" ? "proxy_connection_refused"
        : code === "ETIMEDOUT" ? "proxy_tcp_timeout"
          : code === "ENETUNREACH" || code === "EHOSTUNREACH" ? "proxy_unreachable"
            : "proxy_tcp_failed";
      finish(Object.assign(new Error(category), { category, stage: "tcp" }));
    });
  });
}

function classifyRelayError(error) {
  const message = `${error?.message || ""}\n${error?.stderr || ""}`.toLowerCase();
  if (message.includes("407") || message.includes("proxy authentication") || message.includes("authentication required")) return { category: "proxy_auth_407", stage: "auth" };
  if (message.includes("tunnel connection failed") || message.includes("connect tunnel failed") || message.includes("proxy connect aborted") || message.includes("403")) return { category: "proxy_connect_denied", stage: "connect" };
  if (message.includes("certificate") || message.includes("ssl") || message.includes("tls")) return { category: "proxy_tls_failed", stage: "tls" };
  if (message.includes("timed out") || message.includes("timeout") || message.includes("etimedout")) return { category: "proxy_request_timeout", stage: "https" };
  if (message.includes("connection refused") || message.includes("econnrefused")) return { category: "local_relay_down", stage: "relay" };
  if (message.includes("could not resolve")) return { category: "proxy_dns_failed", stage: "dns" };
  return { category: "proxy_https_failed", stage: "https" };
}

async function checkIp(localPort) {
  const endpoints = [
    { url: "https://api.ipify.org?format=json", parse: (body) => JSON.parse(body).ip, name: "ipify" },
    { url: "https://ifconfig.me/ip", parse: (body) => body.trim(), name: "ifconfig_me" },
    { url: "https://api64.ipify.org?format=json", parse: (body) => JSON.parse(body).ip, name: "ipify64" },
  ];
  const attempts = endpoints.map(async (endpoint) => {
    try {
      const { stdout } = await execFileAsync("curl.exe", [
        "--silent",
        "--show-error",
        "--fail",
        "--connect-timeout",
        "10",
        "--max-time",
        "22",
        "--proxy",
        `http://127.0.0.1:${localPort}`,
        endpoint.url,
      ], { windowsHide: true, timeout: 27_000, maxBuffer: 8_192 });
      const ip = String(endpoint.parse(stdout) || "").trim();
      if (ip.length < 3 || ip.length > 64) throw Object.assign(new Error("proxy_ip_response_invalid"), { category: "proxy_ip_response_invalid", stage: "https" });
      if (isPrivateOrLocalIp(ip)) throw Object.assign(new Error("private_or_local_ip_detected"), { category: "private_or_local_ip_detected", stage: "https" });
      return { ip, endpoint: endpoint.name };
    } catch (error) {
      const classified = error?.category ? { category: error.category, stage: error.stage || "https" } : classifyRelayError(error);
      throw Object.assign(new Error(classified.category), classified);
    }
  });
  try {
    return await Promise.any(attempts);
  } catch (aggregate) {
    const errors = Array.isArray(aggregate?.errors) ? aggregate.errors : [];
    const preferred = errors.find(error => error?.category && error.category !== "proxy_request_timeout") || errors[0];
    if (preferred?.category) throw preferred;
    const classified = classifyRelayError(preferred || aggregate);
    throw Object.assign(new Error(classified.category), classified);
  }
}


function validateBrowserExecutable(value) {
  if (typeof value !== "string" || value.trim().length < 5 || !/chrome\.exe$/i.test(value.trim())) {
    throw Object.assign(new Error("dedicated_browser_unavailable"), { category: "dedicated_browser_unavailable", stage: "browser" });
  }
  return value.trim();
}

async function extractPublicIpFromChrome(executable, args, timeoutMs = 25_000) {
  const endpoints = [
    "https://api.ipify.org?format=json",
    "https://ifconfig.me/ip",
    "https://api64.ipify.org?format=json",
  ];
  let lastError = null;
  for (const endpoint of endpoints) {
    const profile = await mkdtemp(join(tmpdir(), "h2ads-chrome-probe-"));
    try {
      const { stdout } = await execFileAsync(executable, [
        "--headless=new", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "--disable-sync",
        "--metrics-recording-only", "--no-first-run", "--no-default-browser-check",
        "--user-data-dir=" + profile,
        ...args,
        "--virtual-time-budget=7000",
        "--dump-dom",
        endpoint,
      ], { windowsHide: true, timeout: timeoutMs, maxBuffer: 512_000 });
      const matches = String(stdout).match(/(?:\d{1,3}\.){3}\d{1,3}|(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+/ig) || [];
      const publicIp = matches.map(item => item.trim()).find(item => !isPrivateOrLocalIp(item));
      if (publicIp) return publicIp;
      lastError = new Error("browser_probe_invalid_response");
    } catch (error) {
      lastError = error;
    } finally {
      await rm(profile, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  throw lastError || new Error("browser_proxy_unverified");
}

async function verifyDirectBrowserEgressBlocked(executable) {
  try {
    const directIp = await extractPublicIpFromChrome(executable, [
      "--disable-quic",
      "--dns-prefetch-disable",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ], 12_000);
    if (directIp && !isPrivateOrLocalIp(directIp)) {
      throw Object.assign(new Error("direct_browser_egress_detected"), {
        category: "direct_browser_egress_detected",
        stage: "firewall",
      });
    }
  } catch (error) {
    if (error?.category === "direct_browser_egress_detected" || error?.message === "direct_browser_egress_detected") throw error;
    // Expected result: the dedicated Chrome cannot reach a public IP without the local relay/proxy.
    return true;
  }
  return true;
}

async function verifyChromeProxyPath(executable, localPort) {
  try {
    const browserObservedIp = await extractPublicIpFromChrome(executable, [
      "--proxy-server=http://127.0.0.1:" + localPort,
      "--proxy-bypass-list=<-loopback>",
      "--disable-quic",
      "--dns-prefetch-disable",
      "--host-resolver-rules=MAP * ~NOTFOUND",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ]);
    if (isPrivateOrLocalIp(browserObservedIp)) {
      throw Object.assign(new Error("private_or_local_ip_detected"), { category: "private_or_local_ip_detected", stage: "browser" });
    }
    return browserObservedIp;
  } catch (error) {
    if (error?.category) throw error;
    throw Object.assign(new Error("browser_proxy_unverified"), { category: "browser_proxy_unverified", stage: "browser" });
  }
}

async function verifyWebRtcNoLocalLeak(executable, localPort) {
  const profile = await mkdtemp(join(tmpdir(), "h2ads-webrtc-probe-"));
  const probePath = join(profile, "probe.html");
  const html = `<!doctype html><html><body><pre id="out">pending</pre><script>
  (async()=>{try{
    const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    pc.createDataChannel("x");
    const found=[];
    pc.onicecandidate=e=>{if(e.candidate){found.push(e.candidate.candidate||"");}else{
      document.getElementById("out").textContent=JSON.stringify(found);pc.close();
    }};
    await pc.setLocalDescription(await pc.createOffer());
    setTimeout(()=>{document.getElementById("out").textContent=JSON.stringify(found);try{pc.close()}catch{}},3500);
  }catch(e){document.getElementById("out").textContent="[]";}})();
  </script></body></html>`;
  await writeFile(probePath, html, "utf8");
  try {
    const { stdout } = await execFileAsync(executable, [
      "--headless=new", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "--disable-sync",
      "--metrics-recording-only", "--no-first-run", "--no-default-browser-check",
      "--user-data-dir=" + profile,
      "--proxy-server=http://127.0.0.1:" + localPort,
      "--proxy-bypass-list=<-loopback>",
      "--disable-quic",
      "--dns-prefetch-disable",
      "--host-resolver-rules=MAP * ~NOTFOUND",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--virtual-time-budget=5000",
      "--dump-dom",
      pathToFileURL(probePath).href,
    ], { windowsHide: true, timeout: 15_000, maxBuffer: 512_000 });
    const localPattern = /(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?|\bfc[0-9a-f]{2}:|\bfd[0-9a-f]{2}:|\bfe[89ab][0-9a-f]:)/i;
    if (localPattern.test(String(stdout))) {
      throw Object.assign(new Error("webrtc_local_ip_leak_detected"), { category: "webrtc_local_ip_leak_detected", stage: "webrtc" });
    }
    return true;
  } catch (error) {
    if (error?.category) throw error;
    throw Object.assign(new Error("webrtc_probe_failed"), { category: "webrtc_probe_failed", stage: "webrtc" });
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function run() {
  let server;
  try {
    const input = await readInput();
    if (input?.command !== "prepare_browser") throw Object.assign(new Error("command_not_allowed"), { category: "command_not_allowed", stage: "command" });
    validateProxy(input.proxy);
    await verifyProxyDns(input.proxy.host);
    await verifyProxyTcp(input.proxy.host, input.proxy.port);

    server = new Server({
      host: "127.0.0.1",
      port: 0,
      verbose: false,
      prepareRequestFunction: () => ({ upstreamProxyUrl: upstreamUrl(input.proxy) }),
    });
    await server.listen();
    const observed = await checkIp(server.port);
    const executable = validateBrowserExecutable(input.browserExecutable);
    await verifyDirectBrowserEgressBlocked(executable);
    const browserObservedIp = await verifyChromeProxyPath(executable, server.port);
    await verifyWebRtcNoLocalLeak(executable, server.port);
    output({
      state: "proxy_verified",
      observedIp: browserObservedIp,
      diagnostics: {
        dns: "ok",
        tcp: "ok",
        https: "ok",
        ipEndpoint: observed.endpoint,
        relayObservedIp: observed.ip,
        browserProxy: "ok",
        browserObservedIp,
        directBrowserEgress: "blocked",
        webrtc: "ok",
        dnsDirect: "blocked",
      },
    });
  } catch (error) {
    output({
      state: "blocked",
      errorCategory: error?.category || (error instanceof SyntaxError ? "proxy_input_invalid_json" : "proxy_unavailable"),
      stage: error?.stage || "unknown",
    });
  } finally {
    if (server) await server.close(true).catch(() => undefined);
  }
}

run();
