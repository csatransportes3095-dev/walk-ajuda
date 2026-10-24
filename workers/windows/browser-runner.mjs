import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { createConnection, isIP } from "node:net";
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
    output({ state: "proxy_verified", observedIp: observed.ip, diagnostics: { dns: "ok", tcp: "ok", https: "ok", ipEndpoint: observed.endpoint } });
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
