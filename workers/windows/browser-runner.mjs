import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Server } from "proxy-chain";

const execFileAsync = promisify(execFile);

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function upstreamUrl(proxy) {
  const protocol = proxy?.protocol === "socks5" ? "socks5" : proxy?.protocol === "https" ? "https" : "http";
  if (!proxy || typeof proxy.host !== "string" || !Number.isInteger(proxy.port) || typeof proxy.username !== "string" || typeof proxy.password !== "string") {
    throw new Error("Configuração de rota inválida.");
  }
  return `${protocol}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`;
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function checkIp(localPort) {
  const { stdout } = await execFileAsync("curl.exe", ["--silent", "--show-error", "--fail", "--max-time", "20", "--proxy", `http://127.0.0.1:${localPort}`, "https://api.ipify.org?format=json"], { windowsHide: true, timeout: 25_000, maxBuffer: 8_192 });
  const data = JSON.parse(stdout);
  if (typeof data.ip !== "string" || data.ip.length > 64) throw new Error("Resposta de IP inválida.");
  return data.ip;
}

async function run() {
  let server;
  try {
    const input = await readInput();
    if (input?.command !== "prepare_browser") throw new Error("Comando não permitido.");
    server = new Server({
      host: "127.0.0.1",
      port: 0,
      verbose: false,
      prepareRequestFunction: () => ({ upstreamProxyUrl: upstreamUrl(input.proxy) }),
    });
    await server.listen();
    const observedIp = await checkIp(server.port);
    output({ state: "proxy_verified", observedIp });
  } catch (_error) {
    output({ state: "blocked", errorCategory: "proxy_unavailable" });
  } finally {
    if (server) await server.close(true).catch(() => undefined);
  }
}

run();
