import { once } from 'node:events';
import { connect, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { productionServer } from './browser/production-server';

// The browser test server must behave like a real offline origin: once it is
// switched offline, no TCP connection may stay open waiting for Node's
// keep-alive or headers timeouts.
const servers: { close: () => Promise<void> }[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const server of servers.splice(0)) await server.close();
});

async function startServer() {
  const server = await productionServer();
  servers.push(server);
  return { server, port: Number(new URL(server.url).port) };
}

async function openSocket(port: number): Promise<Socket> {
  const socket = connect(port, '127.0.0.1');
  sockets.push(socket);
  await once(socket, 'connect');
  return socket;
}

/** Resolve true if the peer closes the socket within the deadline. */
function closesWithin(socket: Socket, milliseconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (socket.destroyed || socket.readableEnded) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => resolve(false), milliseconds);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/** Send one keep-alive request and wait for its full response. */
async function completeKeepAliveRequest(socket: Socket): Promise<void> {
  const response = new Promise<void>((resolve) => {
    let received = '';
    const onData = (chunk: Buffer) => {
      received += chunk.toString('utf8');
      if (received.includes('Worker probe</body></html>')) {
        socket.off('data', onData);
        resolve();
      }
    };
    socket.on('data', onData);
  });
  socket.write(
    'GET /test-probe.html HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n',
  );
  await response;
}

describe('browser test server offline simulation', () => {
  it('destroys an idle keep-alive connection when switched offline', async () => {
    const { server, port } = await startServer();
    const keepAlive = await openSocket(port);
    await completeKeepAliveRequest(keepAlive);

    server.failure('offline');

    expect(await closesWithin(keepAlive, 1000)).toBe(true);
  });

  it('destroys an accepted connection that never sent a request', async () => {
    const { server, port } = await startServer();
    const requestless = await openSocket(port);

    server.failure('offline');

    expect(await closesWithin(requestless, 1000)).toBe(true);
  });

  it('destroys a new connection accepted while offline', async () => {
    const { server, port } = await startServer();
    server.failure('offline');

    const late = connect(port, '127.0.0.1');
    sockets.push(late);
    late.on('error', () => undefined);

    expect(await closesWithin(late, 1000)).toBe(true);
  });

  it('keeps serving normally while online', async () => {
    const { port } = await startServer();
    const socket = await openSocket(port);
    await completeKeepAliveRequest(socket);

    expect(await closesWithin(socket, 300)).toBe(false);
  });
});
