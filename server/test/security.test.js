// Rate limiter, TURN credential providers and the dependency health check
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { srcPath, stubModule, stubRedis } = require('../test-support/harness');

const redis = stubRedis();
const fakeDb = { query: async () => ({ rows: [{ '?column?': 1 }] }) };
stubModule('config/db.js', fakeDb);

const { consume, rateLimit } = require(srcPath('middlewares/rateLimiter.js'));
const turn = require(srcPath('controllers/turnController.js'));
const { getHealth } = require(srcPath('controllers/healthController.js'));

function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      statusCode: 200,
      set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ blocked: true, status: this.statusCode, body, headers: this.headers }); }
    };
    middleware(req, res, () => resolve({ blocked: false }));
  });
}

function callHandler(handler, req = {}) {
  return new Promise((resolve) => {
    handler(req, {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); }
    });
  });
}

describe('rate limiter', () => {
  it('allows up to the limit, then blocks with a retry time; window keys always expire', async () => {
    for (let i = 0; i < 3; i++) {
      assert.strictEqual((await consume('t:a', 3, 60)).allowed, true);
    }
    const blocked = await consume('t:a', 3, 60);
    assert.strictEqual(blocked.allowed, false);
    assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 60);
    assert.ok((await redis.ttl('ratelimit:t:a')) > 0);
    assert.strictEqual((await consume('t:b', 3, 60)).allowed, true, 'keys are independent');
  });

  it('middleware returns 429 + Retry-After, keyed per IP or per user', async () => {
    const byIp = rateLimit({ name: 'login', limit: 2, windowSeconds: 900 });
    assert.strictEqual((await runMiddleware(byIp, { ip: '1.1.1.1' })).blocked, false);
    assert.strictEqual((await runMiddleware(byIp, { ip: '1.1.1.1' })).blocked, false);
    const limited = await runMiddleware(byIp, { ip: '1.1.1.1' });
    assert.strictEqual(limited.status, 429);
    assert.ok(Number(limited.headers['Retry-After']) > 0);
    assert.strictEqual((await runMiddleware(byIp, { ip: '2.2.2.2' })).blocked, false);

    const byUser = rateLimit({ name: 'gift', limit: 1, windowSeconds: 60, by: 'user' });
    assert.strictEqual((await runMiddleware(byUser, { user: { id: 'u1' }, ip: 'x' })).blocked, false);
    assert.strictEqual((await runMiddleware(byUser, { user: { id: 'u1' }, ip: 'y' })).blocked, true);
  });

  it('fails open when Redis is unavailable', async () => {
    const original = redis.rateLimitHit;
    redis.rateLimitHit = async () => { throw new Error('redis down'); };
    try {
      assert.strictEqual((await consume('t:c', 1, 60)).allowed, true);
    } finally {
      redis.rateLimitHit = original;
    }
  });
});

describe('TURN credentials', () => {
  const TURN_ENV = ['CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_API_TOKEN', 'TURN_SECRET', 'TURN_TTL'];
  let savedEnv;
  let savedFetch;
  const user = { id: 'user-1' };

  beforeEach(() => {
    // Never let a developer's real .env reach Cloudflare from tests
    savedEnv = Object.fromEntries(TURN_ENV.map((k) => [k, process.env[k]]));
    TURN_ENV.forEach((k) => delete process.env[k]);
    savedFetch = global.fetch;
  });

  afterEach(() => {
    TURN_ENV.forEach((k) => {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    });
    global.fetch = savedFetch;
  });

  it('serves STUN only when no provider is configured', async () => {
    const { body } = await callHandler(turn.getIceServers, { user });
    assert.strictEqual(body.turnProvider, null);
    assert.strictEqual(body.iceServers.length, 1);
    assert.ok(!body.iceServers[0].credential);
  });

  it('requests Cloudflare credentials correctly, prefers Cloudflare over coturn, drops port 53', async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = 'key123';
    process.env.CLOUDFLARE_TURN_API_TOKEN = 'tok456';
    process.env.TURN_SECRET = 's3cret';

    let captured;
    global.fetch = async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        json: async () => ({
          iceServers: [
            { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
            {
              urls: [
                'turn:turn.cloudflare.com:3478?transport=udp',
                'turn:turn.cloudflare.com:53?transport=udp',
                'turns:turn.cloudflare.com:443?transport=tcp'
              ],
              username: 'cfuser',
              credential: 'cfcred'
            }
          ]
        })
      };
    };

    const { body } = await callHandler(turn.getIceServers, { user });
    assert.strictEqual(body.turnProvider, 'cloudflare');
    assert.strictEqual(captured.url, 'https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/generate-ice-servers');
    assert.strictEqual(captured.options.method, 'POST');
    assert.strictEqual(captured.options.headers.Authorization, 'Bearer tok456');
    assert.deepStrictEqual(JSON.parse(captured.options.body), { ttl: 3600 });

    const urls = body.iceServers.flatMap((s) => s.urls);
    assert.ok(!urls.some((u) => /:53(\?|$)/.test(u)));
    assert.strictEqual(urls.length, 3);
    assert.strictEqual(body.iceServers[1].credential, 'cfcred');
  });

  it('falls back to STUN when Cloudflare is down', async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = 'key123';
    process.env.CLOUDFLARE_TURN_API_TOKEN = 'tok456';
    global.fetch = async () => ({ ok: false, status: 503 });

    const { status, body } = await callHandler(turn.getIceServers, { user });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.turnProvider, null);
  });

  it('issues per-user HMAC credentials for coturn', async () => {
    process.env.TURN_SECRET = 's3cret';
    const { body } = await callHandler(turn.getIceServers, { user });
    assert.strictEqual(body.turnProvider, 'coturn');

    const entry = body.iceServers[1];
    assert.ok(entry.username.endsWith(':user-1'));
    const expected = crypto.createHmac('sha1', 's3cret').update(entry.username).digest('base64');
    assert.strictEqual(entry.credential, expected);
    assert.strictEqual(body.ttl, 3600);
  });
});

describe('health check', () => {
  it('returns 200 when Postgres and Redis respond', async () => {
    const { status, body } = await callHandler(getHealth);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body.checks, { database: 'ok', redis: 'ok' });
  });

  it('returns 503 and names the failing dependency', async () => {
    const originalQuery = fakeDb.query;
    fakeDb.query = async () => { throw new Error('ENOTFOUND'); };
    try {
      const { status, body } = await callHandler(getHealth);
      assert.strictEqual(status, 503);
      assert.strictEqual(body.status, 'degraded');
      assert.deepStrictEqual(body.checks, { database: 'down', redis: 'ok' });
    } finally {
      fakeDb.query = originalQuery;
    }
  });

  it('treats a hung dependency as down instead of hanging', async () => {
    const originalPing = redis.ping;
    redis.ping = () => new Promise(() => {});
    try {
      const { status, body } = await callHandler(getHealth);
      assert.strictEqual(status, 503);
      assert.strictEqual(body.checks.redis, 'down');
    } finally {
      redis.ping = originalPing;
    }
  });
});
