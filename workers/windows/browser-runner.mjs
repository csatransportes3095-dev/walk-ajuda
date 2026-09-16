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
  try {
    const { stdout } = await execFileAsync("curl.exe", [
      "--silent",
      "--show-error",
      "--fail",
      "--connect-timeout",
      "10",
      "--max-time",
      "20",
      "--proxy",
      `http://127.0.0.1:${localPort}`,
      "https://api.ipify.org?format=json",
    ], { windowsHide: true, timeout: 25_000, maxBuffer: 8_192 });
    const data = JSON.parse(stdout);
    if (typeof data.ip !== "string" || data.ip.length < 3 || data.ip.length > 64) {
      throw Object.assign(new Error("proxy_ip_response_invalid"), { category: "proxy_ip_response_invalid", stage: "https" });
    }
    return data.ip.trim();
  } catch (error) {
    if (error?.category) throw error;
    const classified = classifyRelayError(error);
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
    const observedIp = await checkIp(server.port);
    output({ state: "proxy_verified", observedIp, diagnostics: { dns: "ok", tcp: "ok", https: "ok" } });
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
