import net from "node:net";

const host = process.env.H2_SOCKS_HOST;
const port = Number(process.env.H2_SOCKS_PORT);
const username = process.env.H2_SOCKS_USER || "";
const password = process.env.H2_SOCKS_PASSWORD || "";
if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write("invalid_socks_configuration\n");
  process.exit(2);
}

function readExactly(socket, size) {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    const onData = chunk => {
      data = Buffer.concat([data, chunk]);
      if (data.length >= size) { cleanup(); resolve(data); }
    };
    const onError = error => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error("socks_closed")); };
    const cleanup = () => { socket.off("data", onData); socket.off("error", onError); socket.off("close", onClose); };
    socket.on("data", onData); socket.once("error", onError); socket.once("close", onClose);
  });
}
async function connectSocks(destinationHost, destinationPort) {
  const socket = net.createConnection({ host, port });
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  socket.write(Buffer.from([5, username ? 2 : 1, 0, ...(username ? [2] : [])]));
  const hello = await readExactly(socket, 2);
  if (hello[0] !== 5 || hello[1] === 255) throw new Error("socks_auth_methods_rejected");
  if (hello[1] === 2) {
    const u = Buffer.from(username); const p = Buffer.from(password);
    if (u.length > 255 || p.length > 255) throw new Error("socks_credentials_too_long");
    socket.write(Buffer.from([1, u.length, ...u, p.length, ...p]));
    const auth = await readExactly(socket, 2);
    if (auth[1] !== 0) throw new Error("socks_auth_failed");
  }
  const name = Buffer.from(destinationHost);
  if (name.length > 255) throw new Error("destination_too_long");
  socket.write(Buffer.from([5, 1, 0, 3, name.length, ...name, destinationPort >> 8, destinationPort & 255]));
  const head = await readExactly(socket, 4);
  if (head[0] !== 5 || head[1] !== 0) throw new Error("socks_connect_failed");
  const length = head[3] === 1 ? 4 : head[3] === 4 ? 16 : (await readExactly(socket, 1))[0];
  await readExactly(socket, length + 2);
  return socket;
}

const listener = net.createServer((client) => {
  let buffer = Buffer.alloc(0); let handled = false;
  const fail = () => { if (!handled) { handled = true; client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n"); } };
  client.setTimeout(30000, fail); client.on("error", () => {});
  client.on("data", async chunk => {
    if (handled) return;
    buffer = Buffer.concat([buffer, chunk]);
    const end = buffer.indexOf("\r\n\r\n");
    if (end < 0) { if (buffer.length > 16384) fail(); return; }
    handled = true; client.pause();
    const line = buffer.subarray(0, end).toString("latin1").split("\r\n", 1)[0] || "";
    const match = line.match(/^CONNECT\s+([^\s:]+|\[[^\]]+\]):(\d{1,5})\s+HTTP\/\d(?:\.\d)?$/i);
    if (!match) { client.end("HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n"); return; }
    const destinationHost = match[1].replace(/^\[|\]$/g, ""); const destinationPort = Number(match[2]);
    try {
      const upstream = await connectSocks(destinationHost, destinationPort);
      client.write("HTTP/1.1 200 Connection Established\r\nProxy-Agent: H2AndroidRelay/1\r\n\r\n");
      const remainder = buffer.subarray(end + 4); if (remainder.length) upstream.write(remainder);
      client.pipe(upstream); upstream.pipe(client);
      upstream.on("error", () => client.destroy()); client.on("close", () => upstream.destroy()); client.resume();
    } catch { client.destroy(); }
  });
});
listener.on("error", error => { process.stderr.write(`${error?.message || "listener_error"}\n`); process.exit(3); });
listener.listen(0, "127.0.0.1", () => { const address = listener.address(); process.stdout.write(`READY:${address.port}\n`); });
const shutdown = () => listener.close(() => process.exit(0));
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
