import net from 'node:net';
import fs from 'node:fs';
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

async function connectSocks(destinationHost, destinationPort) {
  const socket = net.createConnection({ host, port });
  socket.setTimeout(12000, () => socket.destroy(new Error('socks_timeout')));
  try {
    await once(socket, 'connect');
    const credentials = username.length > 0 || password.length > 0;
    socket.write(Buffer.from(credentials ? [5, 1, 2] : [5, 1, 0]));
    const hello = await readExactly(socket, 2);
    if (hello[0] !== 5 || hello[1] !== (credentials ? 2 : 0)) {
      throw new Error('socks_auth_method_rejected');
    }
    if (credentials) {
      const user = Buffer.from(username, 'utf8');
      const pass = Buffer.from(password, 'utf8');
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
server.on('error', () => process.exit(3));
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  try {
    const temp = readyFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({ port, pid: process.pid, proxyId }), { mode: 0o600 });
    fs.renameSync(temp, readyFile);
  } catch {
    server.close(() => process.exit(4));
  }
});
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
