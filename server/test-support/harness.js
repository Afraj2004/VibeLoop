// Shared test harness: swaps the Redis/Postgres config modules for in-memory
// stand-ins and boots a real Socket.IO signaling server on a random port.
const path = require('path');
const http = require('http');
const Module = require('module');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const SRC = path.join(__dirname, '..', 'src');
const srcPath = (rel) => path.join(SRC, rel);

/**
 * Replaces a module under src/ before anything requires it
 */
function stubModule(rel, exports) {
  const resolved = require.resolve(srcPath(rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ioredis-mock only supports ioredis 5 (its reply transformers break on ioredis 6's
// RESP3-aware ones), so give the mock its own ioredis 5 copy; the app keeps ioredis 6.
const originalLoad = Module._load;
Module._load = function loadWithMockedIoredis(request, parent, ...rest) {
  // The mock imports subpaths such as ioredis/built/Command
  if (/^ioredis(\/|$)/.test(request) && parent?.filename?.includes(`${path.sep}ioredis-mock${path.sep}`)) {
    return originalLoad.call(this, request.replace(/^ioredis/, 'ioredis-v5'), parent, ...rest);
  }
  return originalLoad.call(this, request, parent, ...rest);
};

/**
 * In-memory Redis that runs the real Lua scripts (via ioredis-mock)
 */
function stubRedis() {
  const RedisMock = require('ioredis-mock');
  const redis = new RedisMock();
  stubModule('config/redis.js', redis);
  return redis;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function once(emitter, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    emitter.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/**
 * Starts the signaling server. Must be called after the Redis/DB stubs are installed.
 */
async function startSignalingServer() {
  const { Server } = require('socket.io');
  const jwt = require('jsonwebtoken');
  const { io: ioClient } = require('socket.io-client');
  const { registerSignaling } = require(srcPath('services/webrtcSignaling.js'));

  const server = http.createServer();
  const io = new Server(server);
  registerSignaling(io);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const clients = [];
  let userCount = 0;

  /**
   * Connects an authenticated client. `ip` is sent as X-Forwarded-For (honoured when TRUST_PROXY is set).
   */
  async function connect(claims = {}, ip = '9.9.9.9') {
    userCount += 1;
    const id = `00000000-0000-0000-0000-${String(userCount).padStart(12, '0')}`;
    const token = jwt.sign(
      { id, username: `user${userCount}`, gender: 'other', country: 'US', ...claims },
      process.env.JWT_SECRET
    );
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      extraHeaders: { 'x-forwarded-for': ip }
    });
    await once(socket, 'connect');
    socket.userId = id;
    clients.push(socket);
    return socket;
  }

  /**
   * a waits in the pool, b searches and is paired with a
   */
  async function matchPair(a, b, preferencesA = {}, preferencesB = {}) {
    a.emit('find_partner', preferencesA);
    await sleep(80);
    const [matchA, matchB] = await Promise.all([
      once(a, 'match_found'),
      once(b, 'match_found'),
      b.emit('find_partner', preferencesB)
    ]);
    return { matchA, matchB };
  }

  async function close() {
    clients.forEach((socket) => socket.close());
    io.close();
    await new Promise((resolve) => server.close(resolve));
  }

  return { io, port, connect, matchPair, close, rawClient: ioClient };
}

module.exports = { srcPath, stubModule, stubRedis, sleep, once, startSignalingServer };
