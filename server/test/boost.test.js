// VibeBoost: purchase (atomic debit + ledger + Redis cache) and matchmaking priority / perks
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { srcPath, stubModule, stubRedis, sleep, once, startSignalingServer } = require('../test-support/harness');

const redis = stubRedis();

const BUYER = '44444444-4444-4444-4444-444444444444';
let balances = {};
let ledger = [];

function handle(text, params = []) {
  const sql = text.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
  if (sql.startsWith('UPDATE users SET vibe_balance = vibe_balance - $2, boost_until')) {
    const balance = balances[params[0]];
    if (balance === undefined || balance < params[1]) return { rows: [] };
    balances[params[0]] = balance - params[1];
    return { rows: [{ vibe_balance: balances[params[0]], boost_until: new Date(Date.now() + params[2] * 1000) }] };
  }
  if (sql.startsWith('SELECT vibe_balance FROM users')) {
    return { rows: balances[params[0]] === undefined ? [] : [{ vibe_balance: balances[params[0]] }] };
  }
  if (sql.startsWith('INSERT INTO token_transactions')) {
    ledger.push(params);
    return { rows: [] };
  }
  // Connection-time hydration (blocks, bans, boosts) finds nothing
  if (sql.startsWith('SELECT')) return { rows: [] };
  return { rows: [] };
}

stubModule('config/db.js', {
  query: async (text, params) => handle(text, params),
  withTransaction: async (work) => work({ query: async (text, params) => handle(text, params) })
});

const wallet = require(srcPath('controllers/walletController.js'));

function callPurchase(userId) {
  return new Promise((resolve) => {
    wallet.purchaseBoost({ user: { id: userId } }, {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); }
    });
  });
}

describe('buying VibeBoost', () => {
  beforeEach(async () => {
    balances = { [BUYER]: 15 };
    ledger = [];
    await redis.del(`boost:${BUYER}`);
  });

  it('charges 10 VIBE, records PURCHASE_BOOST and caches a 1-hour boost', async () => {
    const { status, body } = await callPurchase(BUYER);
    assert.strictEqual(status, 200);
    assert.strictEqual(body.balance, 5);
    assert.strictEqual(ledger.length, 1);
    assert.strictEqual(ledger[0][1], -10);

    const ttl = await redis.ttl(`boost:${BUYER}`);
    assert.ok(ttl > 3500 && ttl <= 3600, `boost cached for ~1h (ttl ${ttl})`);
    assert.strictEqual(await redis.get(`boost:${BUYER}`), body.boostUntil);
  });

  it('refuses when the balance is too low, with no charge or boost', async () => {
    balances[BUYER] = 9.5;
    const { status, body } = await callPurchase(BUYER);
    assert.strictEqual(status, 400);
    assert.strictEqual(body.error, 'Insufficient VIBE tokens');
    assert.strictEqual(body.currentBalance, 9.5);
    assert.strictEqual(ledger.length, 0);
    assert.strictEqual(await redis.get(`boost:${BUYER}`), null);
  });
});

describe('boosted matchmaking', () => {
  let app;

  before(async () => {
    app = await startSignalingServer();
  });

  after(async () => {
    await app.close();
  });

  const boostUser = (socket) => redis.set(`boost:${socket.userId}`, new Date(Date.now() + 3600e3).toISOString(), 'EX', 3600);

  it('offers a waiting boosted user first, with a flame badge, and reveals gender only to the booster', async () => {
    // Waiting users who cannot match each other, but all accept the searcher (a man from IN)
    const normals = [];
    for (let i = 0; i < 4; i++) {
      const normal = await app.connect({ gender: 'female', country: 'US' });
      normal.emit('find_partner', { targetGender: 'male', targetCountry: 'IN' });
      normals.push(normal);
      await sleep(40);
    }
    const boosted = await app.connect({ gender: 'female', country: 'US' });
    await boostUser(boosted);
    boosted.emit('find_partner', { targetGender: 'male' });
    await sleep(60);
    assert.ok((await redis.smembers('queue:boosted')).includes(boosted.id), 'waiting booster is in the priority set');

    const searcher = await app.connect({ gender: 'male', country: 'IN' });
    const [searcherMatch, boostedMatch] = await Promise.all([
      once(searcher, 'match_found'),
      once(boosted, 'match_found'),
      searcher.emit('find_partner', {})
    ]);

    assert.strictEqual(searcherMatch.peer.id, boosted.userId, 'boosted user beats 4 earlier waiters');
    assert.strictEqual(searcherMatch.peer.boosted, true, 'flame badge');
    assert.strictEqual(searcherMatch.peer.gender, undefined, 'non-boosted viewer does not see gender');
    assert.strictEqual(boostedMatch.peer.boosted, false);
    assert.strictEqual(boostedMatch.peer.gender, 'male', 'boosted viewer sees gender early');
    assert.ok(!(await redis.smembers('queue:boosted')).includes(boosted.id), 'matched user leaves the priority set');

    [...normals, boosted, searcher].forEach((sock) => sock.close());
    await sleep(100);
  });

  it('still respects filters: a boosted user the searcher does not want is skipped', async () => {
    const normal = await app.connect({ gender: 'female', country: 'US' });
    normal.emit('find_partner', { targetGender: 'male', targetCountry: 'IN' });
    await sleep(60);

    const boosted = await app.connect({ gender: 'male', country: 'US' });
    await boostUser(boosted);
    boosted.emit('find_partner', { targetGender: 'female' });
    await sleep(60);
    assert.ok((await redis.smembers('queue:boosted')).includes(boosted.id));

    const searcher = await app.connect({ gender: 'male', country: 'IN' });
    const [match] = await Promise.all([
      once(searcher, 'match_found'),
      searcher.emit('find_partner', { targetGender: 'female' })
    ]);
    assert.strictEqual(match.peer.id, normal.userId);

    // Leaving clears the boosted user from the priority set
    boosted.emit('leave');
    await sleep(100);
    assert.ok(!(await redis.smembers('queue:boosted')).includes(boosted.id));
  });
});
