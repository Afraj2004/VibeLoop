// Guest-to-account upgrade on registration, optional auth, and wallet transaction history
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { srcPath, stubModule, stubRedis } = require('../test-support/harness');

stubRedis();

const GUEST_ID = '11111111-1111-1111-1111-111111111111';
const NEW_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_ID = '33333333-3333-3333-3333-333333333333';

let queries = [];
let state = {};

function userRow(id, overrides = {}) {
  return {
    id, username: 'newname', email: 'me@example.com', vibe_balance: '12.40',
    gender: 'female', country_code: 'IN', is_guest: false, ...overrides
  };
}

stubModule('config/db.js', {
  query: async (text, params = []) => {
    const sql = text.replace(/\s+/g, ' ').trim();
    queries.push({ sql, params });
    if (sql.startsWith('SELECT id FROM users WHERE (email')) return { rows: state.conflict ? [{ id: OTHER_ID }] : [] };
    if (sql.startsWith('UPDATE users SET username')) return { rows: state.guestExists ? [userRow(params[0])] : [] };
    if (sql.startsWith('INSERT INTO users (username, email')) return { rows: [userRow(NEW_ID, { vibe_balance: '10.00' })] };
    if (sql.startsWith('SELECT t.id, t.amount')) return { rows: state.ledger };
    throw new Error(`unhandled SQL: ${sql}`);
  }
});

const { verifyToken, signToken } = require(srcPath('config/jwt.js'));
const optionalAuth = require(srcPath('middlewares/optionalAuth.js'));
const authController = require(srcPath('controllers/authController.js'));
const wallet = require(srcPath('controllers/walletController.js'));

const REGISTRATION = {
  username: 'newname', email: 'me@example.com', password: 'longenough1',
  gender: 'female', country: 'IN', ageConfirmed: true, termsAccepted: true
};

function call(handler, req) {
  return new Promise((resolve) => {
    handler({ body: {}, ...req }, {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); }
    });
  });
}

describe('optional auth', () => {
  it('sets req.user for a valid token and ignores missing or invalid ones', () => {
    const token = signToken({ id: GUEST_ID, username: 'guest_x', is_guest: true });
    const withToken = { header: () => `Bearer ${token}` };
    optionalAuth(withToken, {}, () => {});
    assert.strictEqual(withToken.user.id, GUEST_ID);
    assert.strictEqual(withToken.user.isGuest, true);

    const bad = { header: () => 'Bearer garbage' };
    optionalAuth(bad, {}, () => {});
    assert.strictEqual(bad.user, undefined);

    const none = { header: () => undefined };
    let nextCalled = false;
    optionalAuth(none, {}, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });
});

describe('registration from a guest session', () => {
  beforeEach(() => {
    queries = [];
    state = { conflict: false, guestExists: true, ledger: [] };
  });

  it('upgrades the guest row in place, keeping its id and balance', async () => {
    const { status, body } = await call(authController.register, {
      body: REGISTRATION,
      user: { id: GUEST_ID, isGuest: true }
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.upgraded, true);
    assert.strictEqual(body.user.id, GUEST_ID);
    assert.strictEqual(body.user.balance, '12.40');
    assert.strictEqual(verifyToken(body.token).isGuest, false);

    const update = queries.find((q) => q.sql.startsWith('UPDATE users SET username'));
    assert.strictEqual(update.params[0], GUEST_ID);
    assert.match(update.sql, /WHERE id = \$1 AND is_guest = TRUE/);
    assert.ok(!queries.some((q) => q.sql.startsWith('INSERT INTO users')));
  });

  it('excludes the guest\'s own row from the duplicate check', async () => {
    await call(authController.register, { body: REGISTRATION, user: { id: GUEST_ID, isGuest: true } });
    const check = queries.find((q) => q.sql.startsWith('SELECT id FROM users WHERE (email'));
    assert.deepStrictEqual(check.params, ['me@example.com', 'newname', GUEST_ID]);
  });

  it('creates a fresh account when the guest row is gone', async () => {
    state.guestExists = false;
    const { status, body } = await call(authController.register, {
      body: REGISTRATION,
      user: { id: GUEST_ID, isGuest: true }
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.user.id, NEW_ID);
    assert.strictEqual(body.upgraded, undefined);
  });

  it('creates a fresh account without a guest session, and never upgrades a registered user', async () => {
    let result = await call(authController.register, { body: REGISTRATION });
    assert.strictEqual(result.body.user.id, NEW_ID);

    queries = [];
    result = await call(authController.register, { body: REGISTRATION, user: { id: OTHER_ID, isGuest: false } });
    assert.strictEqual(result.body.user.id, NEW_ID);
    assert.ok(!queries.some((q) => q.sql.startsWith('UPDATE users')));
  });

  it('rejects an email or username taken by someone else', async () => {
    state.conflict = true;
    const { status } = await call(authController.register, {
      body: REGISTRATION,
      user: { id: GUEST_ID, isGuest: true }
    });
    assert.strictEqual(status, 400);
    assert.ok(!queries.some((q) => q.sql.startsWith('UPDATE users')));
  });
});

describe('wallet transactions', () => {
  it('labels gifts and counterparties', async () => {
    state.ledger = [
      { id: 't1', amount: '-10.00', transaction_type: 'SEND_GIFT', metadata: { giftId: 'rose', recipientId: OTHER_ID }, created_at: '2026-10-11T10:00:00Z', counterparty: 'friend' },
      { id: 't2', amount: '0.10', transaction_type: 'EARN_CHAT', metadata: { day: '2026-10-11' }, created_at: '2026-10-11T09:00:00Z', counterparty: null }
    ];
    const { body } = await call(wallet.getTransactions, { user: { id: GUEST_ID } });
    assert.deepStrictEqual(body.transactions[0], {
      id: 't1', type: 'SEND_GIFT', amount: -10, createdAt: '2026-10-11T10:00:00Z',
      gift: { name: 'Neon Rose', icon: '🌹' }, counterparty: 'friend'
    });
    assert.strictEqual(body.transactions[1].gift, null);
    assert.strictEqual(body.transactions[1].amount, 0.1);
  });
});
