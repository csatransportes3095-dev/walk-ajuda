import net from 'node:net';
import fs from 'node:fs';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';

// Per-instance loopback HTTP proxy backed by one authenticated SOCKS5 upstream.
// No credentials are written to disk, to stdout, or in emulator arguments.
const host = process.env.H2_SOCKS_HOST;
const port = Number(process.env.H2_SOCKS_PORT);
const username = process.env.H2_SOCKS_USER || '';
const password = process.env.H2_SOCKS_PASSWORD || '';
const readyFile = process.env.H2_RELAY_READY_FILE;
const proxyId = process.env.H2_RELAY_PROXY_ID;
if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !readyFile || !/^\d+$/.test(proxyId || '')) {
  process.stderr.write('invalid_relay_configuration\n');
  process.exit(2);
}

// Keep the listener port stable while changing the upstream proxy in memory.
// Credentials are never written to the ready file or emitted in responses.
let activeUpstream = { host, port, username, password };
let activeProxyId = proxyId;
const controlSecret = randomBytes(32).toString('hex');
const openClients = new Set();
let controlPort = 0;
const writeReady = nextId => {
  const temp = readyFile + '.tmp';
  fs.writeFileSync(temp, JSON.stringify({ port: server.address().port, pid: process.pid, proxyId: nextId, controlPort, controlSecret }), { mode: 0o600 });
  fs.renameSync(temp, readyFile);
};

function readExactly(socket, size) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('socks_read_timeout')), 12000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('readable', onReadable);
      socket.off('error', onError);
      socket.off('end', onClose);
      socket.off('close', onClose);
    };
    const finish = (error, data) => {
      cleanup();
      if (error) reject(error);
      else resolve(data);
    };
    const onError = error => finish(error);
    const onClose = () => finish(new Error('socks_connection_closed'));
    const onReadable = () => {
      const data = socket.read(size);
      if (data !== null) finish(null, data);
    };
    socket.on('readable', onReadable);
    socket.once('error', onError);
    socket.once('end', onClose);
    socket.once('close', onClose);
    onReadable();
  });
}

async function connectSocks(destinationHost, destinationPort, proxy = activeUpstream) {
  const socket = net.createConnection({ host: proxy.host, port: proxy.port });
  socket.setTimeout(12000, () => socket.destroy(new Error('socks_timeout')));
  try {
    await once(socket, 'connect');
    const credentials = proxy.username.length > 0 || proxy.password.length > 0;
    socket.write(Buffer.from(credentials ? [5, 1, 2] : [5, 1, 0]));
    const hello = await readExactly(socket, 2);
    if (hello[0] !== 5 || hello[1] !== (credentials ? 2 : 0)) {
      throw new Error('socks_auth_method_rejected');
    }
    if (credentials) {
      const user = Buffer.from(proxy.username, 'utf8');
      const pass = Buffer.from(proxy.password, 'utf8');
      if (user.length > 255 || pass.length > 255) throw new Error('socks_credentials_too_long');
      socket.write(Buffer.concat([Buffer.from([1, user.length]), user, Buffer.from([pass.length]), pass]));
      const auth = await readExactly(socket, 2);
      if (auth[0] !== 1 || auth[1] !== 0) throw new Error('socks_auth_failed');
    }
    const name = Buffer.from(destinationHost, 'utf8');
    if (name.length > 255 || !name.length) throw new Error('invalid_destination');
    socket.write(Buffer.concat([
      Buffer.from([5, 1, 0, 3, name.length]), name,
      Buffer.from([destinationPort >> 8, destinationPort & 255]),
    ]));
    const head = await readExactly(socket, 4);
    if (head[0] !== 5 || head[1] !== 0) throw new Error('socks_connect_failed');
    if (head[3] === 1) await readExactly(socket, 4);
    else if (head[3] === 4) await readExactly(socket, 16);
    else if (head[3] === 3) {
      const length = (await readExactly(socket, 1))[0];
      await readExactly(socket, length);
    } else throw new Error('socks_invalid_response');
    await readExactly(socket, 2);
    socket.setTimeout(0);
    return socket; // Excess bytes remain buffered for pipe(), not discarded.
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

function parseHttpRequest(header) {
  const lines = header.split('\r\n');
  const request = lines.shift() || '';
  const m = request.match(/^([A-Z]+)\s+(\S+)\s+(HTTP\/1\.[01])$/);
  if (!m) throw new Error('invalid_http_request');
  const [, method, target, httpVersion] = m;
  if (method === 'CONNECT') {
    const endpoint = target.match(/^(?:\[([^\]]+)\]|([^:]+)):(\d{1,5})$/);
    if (!endpoint) throw new Error('invalid_connect_target');
    const destPort = Number(endpoint[3]);
    if (!destPort || destPort > 65535) throw new Error('invalid_connect_port');
    return { method, host: endpoint[1] || endpoint[2], port: destPort, header: '' };
  }
  if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(method)) throw new Error('unsupported_method');
  const url = new URL(target);
  if (url.protocol !== 'http:') throw new Error('unsupported_http_url');
  const cleanHeaders = lines.filter(line => !/^proxy-(authorization|connection):/i.test(line));
  return {
    method, host: url.hostname, port: Number(url.port) || 80,
    header: method + ' ' + (url.pathname || '/') + url.search + ' ' + httpVersion + '\r\n' + cleanHeaders.join('\r\n') + '\r\n\r\n',
  };
}

const server = net.createServer(client => {
  openClients.add(client);
  client.once('close', () => openClients.delete(client));
  let buffer = Buffer.alloc(0);
  let handled = false;
  client.setTimeout(30000, () => client.destroy());
  client.on('error', () => {});
  client.on('data', async chunk => {
    if (handled) return;
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 32768) {
      handled = true;
      client.end('HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n');
      return;
    }
    const end = buffer.indexOf('\r\n\r\n');
    if (end === -1) return;
    handled = true;
    client.pause();
    let target;
    try {
      target = parseHttpRequest(buffer.subarray(0, end).toString('latin1'));
    } catch {
      client.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }
    try {
      const upstream = await connectSocks(target.host, target.port);
      client.setTimeout(0);
      upstream.on('error', () => client.destroy());
      client.on('close', () => upstream.destroy());
      const remainder = buffer.subarray(end + 4);
      if (target.method === 'CONNECT') {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      } else upstream.write(target.header);
      if (remainder.length) upstream.write(remainder);
      client.pipe(upstream);
      upstream.pipe(client);
      client.resume();
    } catch {
      if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    }
  });
});
// Local-only control channel: fresh random bearer secret, no public listener.
// A live switch keeps the Android emulator's existing local HTTP proxy port.
const control = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const local = req.socket.remoteAddress;
  if (local !== '127.0.0.1' && local !== '::ffff:127.0.0.1' && local !== '::1') {
    res.writeHead(403).end('{"accepted":false}'); return;
  }
  if (req.method !== 'POST' || req.url !== '/rotate' ||
      req.headers.authorization !== 'Bearer ' + controlSecret) {
    res.writeHead(403).end('{"accepted":false}'); return;
  }
  let payload = '';
  req.on('data', chunk => {
    payload += chunk.toString('utf8');
    if (payload.length > 5000) req.destroy();
  });
  req.on('end', () => {
    try {
      const input = JSON.parse(payload);
      if (!/^\\d+$/.test(String(input.proxyId)) ||
          typeof input.host !== 'string' || !input.host ||
          input.host.length > 255 || /[\\s]/.test(input.host) ||
          !Number.isInteger(input.port) || input.port < 1 || input.port > 65535 ||
          typeof input.username !== 'string' || typeof input.password !== 'string' ||
          Buffer.byteLength(input.username) > 255 || Buffer.byteLength(input.password) > 255) {
        throw new Error('invalid_rotation_parameters');
      }
      const next = { host: input.host, port: input.port, username: input.username, password: input.password };
      // If the ready-file cannot be saved, do NOT change the current upstream.
      writeReady(String(input.proxyId));
      activeUpstream = next;
      activeProxyId = String(input.proxyId);
      res.end(JSON.stringify({ accepted: true, proxyId: activeProxyId, port: server.address().port }));
      // Break previous connections: no client keeps using the retired proxy.
      setTimeout(() => {
        for (const client of openClients) client.destroy();
      }, 80);
    } catch {
      res.writeHead(400).end('{"accepted":false}');
    }
  });
});
control.on('error', () => process.exit(3));
server.on('error', () => process.exit(3));
control.listen(0, '127.0.0.1', () => {
  controlPort = control.address().port;
  server.listen(0, '127.0.0.1', () => {
    try { writeReady(activeProxyId); }
    catch { server.close(() => control.close(() => process.exit(4))); }
  });
});
const shutdown = () => {
  for (const client of openClients) client.destroy();
  server.close(() => control.close(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);