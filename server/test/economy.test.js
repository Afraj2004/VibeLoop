// Meet-to-Earn accrual/cap and atomic gifting against ioredis-mock + an in-memory fake Postgres
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { srcPath, stubModule, stubRedis } = require('../test-support/harness');

stubRedis();

// ---- in-memory Postgres stand-in (supports rollback) ----------------------
let users = {};
let ledger = [];

function handle(text, params = []) {
  const sql = text.replace(/\s+/g, ' ');
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
  if (sql.includes('SELECT daily_earned_tokens')) {
    const u = users[params[0]];
    return { rows: u ? [{ daily_earned_tokens: u.daily, last_day: u.lastDay }] : [] };
  }
  if (sql.includes('SET vibe_balance = vibe_balance + $2, daily_earned_tokens')) {
    const u = users[params[0]];
    u.balance += params[1];
    u.daily = params[2];
    u.lastDay = params[3];
    return { rows: [{ vibe_balance: u.balance }] };
  }
  if (sql.includes('WHERE id = ANY')) {
    return {
      rows: params[0].filter((id) => users[id]).sort().map((id) => ({ id, vibe_balance: users[id].balance }))
    };
  }
  if (sql.includes('vibe_balance = vibe_balance - $2')) {
    users[params[0]].balance -= params[1];
    return { rows: [{ vibe_balance: users[params[0]].balance }] };
  }
  if (sql.includes('earned_balance = earned_balance + $2')) {
    users[params[0]].earned += params[1];
    return { rows: [] };
  }
  if (sql.includes('INSERT INTO token_transactions')) {
    const rows = [];
    for (let i = 0; i < params.length; i += 3) {
      const id = `tx${ledger.length + 1}`;
      ledger.push({ id, userId: params[i], amount: params[i + 1], sql });
      rows.push({ id });
    }
    return { rows };
  }
  throw new Error(`unhandled SQL: ${sql}`);
}

stubModule('config/db.js', {
  query: async (text, params) => handle(text, params),
  withTransaction: async (work) => {
    const snapshot = JSON.stringify({ users, ledger });
    try {
      return await work({ query: async (text, params) => handle(text, params) });
    } catch (err) {
      ({ users, ledger } = JSON.parse(snapshot));
      throw err;
    }
  }
});

const meetToEarn = require(srcPath('services/meetToEarn.js'));
const wallet = require(srcPath('controllers/walletController.js'));

const SENDER = '11111111-1111-1111-1111-111111111111';
const RECIPIENT = '22222222-2222-2222-2222-222222222222';
const today = new Date().toISOString().slice(0, 10);

function resetUsers() {
  users = {
    [SENDER]: { balance: 12, earned: 0, daily: 0, lastDay: null },
    [RECIPIENT]: { balance: 10, earned: 0, daily: 0, lastDay: null }
  };
  ledger = [];
}

function sendGift(body, userId = SENDER) {
  const emitted = [];
  return new Promise((resolve) => {
    const req = {
      user: { id: userId, username: 'sender' },
      body,
      app: { get: () => ({ to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) }) }
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, payload, emitted }); }
    };
    wallet.sendGift(req, res);
  });
}

describe('Meet-to-Earn', () => {
  // Each test uses its own user so the per-day Redis counters do not interfere
  let n = 0;
  let userId;
  beforeEach(() => {
    n += 1;
    userId = `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, '0')}`;
    users = { [userId]: { balance: 10, earned: 0, daily: 0, lastDay: null } };
    ledger = [];
  });

  it('pays 0.10 VIBE per completed 3-minute cycle and writes the ledger', async () => {
    let progress = await meetToEarn.creditActiveSeconds(userId, 179);
    assert.strictEqual(progress.rewardEarned, 0);
    assert.strictEqual(progress.secondsUntilNextReward, 1);

    progress = await meetToEarn.creditActiveSeconds(userId, 2);
    assert.strictEqual(progress.rewardEarned, 0.1);
    assert.strictEqual(users[userId].daily, 0.1);
    assert.strictEqual(users[userId].lastDay, today);
    assert.ok(ledger[0].sql.includes("'EARN_CHAT'"));
  });

  it('pays multiple cycles in one accrual', async () => {
    const progress = await meetToEarn.creditActiveSeconds(userId, 360);
    assert.strictEqual(progress.rewardEarned, 0.2);
  });

  it('enforces the 10 VIBE daily cap', async () => {
    users[userId].daily = 9.95;
    users[userId].lastDay = today;
    let progress = await meetToEarn.creditActiveSeconds(userId, 180);
    assert.strictEqual(progress.rewardEarned, 0.05);
    assert.strictEqual(progress.m2eEarnedToday, 10);

    progress = await meetToEarn.creditActiveSeconds(userId, 180);
    assert.strictEqual(progress.rewardEarned, 0);
  });

  it('resets the cap on a new day', async () => {
    users[userId].daily = 10;
    users[userId].lastDay = '2000-01-01';
    const progress = await meetToEarn.creditActiveSeconds(userId, 180);
    assert.strictEqual(progress.rewardEarned, 0.1);
  });
});

describe('gifting', () => {
  beforeEach(resetUsers);

  it('debits the sender, credits 50% to the recipient earned balance, writes ledger, notifies', async () => {
    const result = await sendGift({ recipientId: RECIPIENT, giftId: 'rose' });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.senderNewBalance, 2);
    assert.strictEqual(users[RECIPIENT].earned, 5);
    assert.strictEqual(users[RECIPIENT].balance, 10, 'gift earnings are cash-out balance, not spendable');
    assert.deepStrictEqual(ledger.map((l) => l.amount), [-10, 5]);
    assert.strictEqual(result.emitted[0].room, `user:${RECIPIENT}`);
    assert.strictEqual(result.emitted[0].event, 'gift_received');
  });

  it('rejects insufficient balance with no side effects', async () => {
    const result = await sendGift({ recipientId: RECIPIENT, giftId: 'ring' });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.payload.error, 'Insufficient VIBE tokens');
    assert.strictEqual(users[SENDER].balance, 12);
    assert.strictEqual(ledger.length, 0);
  });

  it('rejects self-gifts, unknown recipients, malformed ids and unknown gifts', async () => {
    assert.strictEqual((await sendGift({ recipientId: SENDER, giftId: 'compliment' })).status, 400);
    assert.strictEqual(
      (await sendGift({ recipientId: '33333333-3333-3333-3333-333333333333', giftId: 'compliment' })).status,
      404
    );
    assert.strictEqual((await sendGift({ recipientId: 'guest_peer', giftId: 'compliment' })).status, 400);
    assert.strictEqual((await sendGift({ recipientId: RECIPIENT, giftId: 'nope' })).status, 404);
    assert.strictEqual(users[SENDER].balance, 12);
  });
});
