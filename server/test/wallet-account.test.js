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
    if (sql.startsWith('WITH u AS ( UPDATE users SET username')) return { rows: state.guestExists ? [userRow(params[0])] : [] };
    if (sql.startsWith('WITH u AS ( INSERT INTO users (username, email')) return { rows: [userRow(NEW_ID, { vibe_balance: '5.00' })] };
    if (sql.startsWith('WITH u AS ( UPDATE users SET avatar_url')) {
      if (!state.avatarUser) return { rows: [] };
      const first = !state.avatarUser.rewarded;
      state.avatarUser.rewarded = true;
      return { rows: [userRow(params[0], { vibe_balance: first ? '1.00' : '1.00', avatar_updated_at: new Date(), rewarded: first })] };
    }
    if (sql.startsWith('SELECT t.id, t.amount')) return { rows: state.ledger };
    if (sql.startsWith('SELECT is_guest, gender, country_code FROM users')) return { rows: state.profile ? [state.profile] : [] };
    if (sql.startsWith('UPDATE users SET country_code')) return { rows: [userRow(params[0], { country_code: params[1] })] };
    if (sql.startsWith('UPDATE users SET gender')) return { rows: [userRow(params[0], { gender: params[1], country_code: params[2], is_guest: state.profile.is_guest })] };
    throw new Error(`unhandled SQL: ${sql}`);
  }
});

const { verifyToken, signToken } = require(srcPath('config/jwt.js'));
const optionalAuth = require(srcPath('middlewares/optionalAuth.js'));
const authController = require(srcPath('controllers/authController.js'));
const wallet = require(srcPath('controllers/walletController.js'));
const profile = require(srcPath('controllers/profileController.js'));
const { REWARDS } = require(srcPath('config/economy.js'));

const REGISTRATION = {
  username: 'newname', email: 'me@example.com', password: 'longenough1',
  gender: 'female', ageConfirmed: true, termsAccepted: true,
  // Bengaluru
  location: { latitude: 12.97, longitude: 77.59 }
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

    const update = queries.find((q) => q.sql.startsWith('WITH u AS ( UPDATE users SET username'));
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
    assert.ok(!queries.some((q) => q.sql.includes('UPDATE users')));
  });

  it('rejects an email or username taken by someone else', async () => {
    state.conflict = true;
    const { status } = await call(authController.register, {
      body: REGISTRATION,
      user: { id: GUEST_ID, isGuest: true }
    });
    assert.strictEqual(status, 400);
    assert.ok(!queries.some((q) => q.sql.includes('UPDATE users')));
  });
});

describe('sign-up bonus', () => {
  beforeEach(() => {
    queries = [];
    state = { conflict: false, guestExists: true, ledger: [] };
  });

  it('credits the bonus with a ledger row in the same statement, for upgrades and fresh accounts', async () => {
    const upgraded = await call(authController.register, { body: REGISTRATION, user: { id: GUEST_ID, isGuest: true } });
    assert.strictEqual(upgraded.body.bonus, REWARDS.SIGNUP);
    const update = queries.find((q) => q.sql.includes('UPDATE users SET username'));
    assert.match(update.sql, /vibe_balance = vibe_balance \+ \$8/);
    assert.match(update.sql, /INSERT INTO token_transactions .* 'SIGNUP_BONUS'/);
    assert.strictEqual(update.params[7], REWARDS.SIGNUP);

    queries = [];
    const fresh = await call(authController.register, { body: REGISTRATION });
    assert.strictEqual(fresh.body.bonus, REWARDS.SIGNUP);
    const insert = queries.find((q) => q.sql.includes('INSERT INTO users'));
    assert.match(insert.sql, /'SIGNUP_BONUS'/);
    assert.strictEqual(insert.params[6], REWARDS.SIGNUP);
  });

  it('starts guests at 0 VIBE', async () => {
    const createGuest = authController.createGuest;
    const guestQueries = [];
    const db = require(srcPath('config/db.js'));
    const original = db.query;
    db.query = async (text, params) => {
      guestQueries.push(text.replace(/\s+/g, ' '));
      return { rows: [userRow(GUEST_ID, { is_guest: true, vibe_balance: '0.00' })] };
    };
    try {
      await call(createGuest, { body: { ageConfirmed: true, termsAccepted: true } });
    } finally {
      db.query = original;
    }
    assert.match(guestQueries[0], /vibe_balance\) VALUES \(\$1, TRUE, NOW\(\), NOW\(\), \$2, 0\)/);
  });
});

describe('profile photo', () => {
  // 1x1 JPEG header bytes are enough for the format check
  const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString('base64');

  beforeEach(() => {
    queries = [];
    state = { avatarUser: { rewarded: false } };
  });

  it('pays the reward for the first photo only', async () => {
    let result = await call(profile.setAvatar, { body: { image: JPEG }, user: { id: OTHER_ID, isGuest: false } });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.reward, REWARDS.PROFILE_PHOTO);
    assert.ok(result.body.user.avatarVersion);
    const sql = queries[0].sql;
    assert.match(sql, /CASE WHEN avatar_rewarded_at IS NULL THEN \$3 ELSE 0 END/);
    assert.match(sql, /'PROFILE_PHOTO_BONUS' FROM u WHERE rewarded/);

    result = await call(profile.setAvatar, { body: { image: JPEG }, user: { id: OTHER_ID, isGuest: false } });
    assert.strictEqual(result.body.reward, 0);
  });

  it('rejects guests, non-images and mislabelled files', async () => {
    let result = await call(profile.setAvatar, { body: { image: JPEG }, user: { id: GUEST_ID, isGuest: true } });
    assert.strictEqual(result.status, 403);

    result = await call(profile.setAvatar, { body: { image: 'data:text/html;base64,PGgxPg==' }, user: { id: OTHER_ID } });
    assert.strictEqual(result.status, 400);

    const fakePng = 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64');
    result = await call(profile.setAvatar, { body: { image: fakePng }, user: { id: OTHER_ID } });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(queries.length, 0);
  });

  it('rejects photos over the size limit', async () => {
    const big = Buffer.alloc(200 * 1024);
    big.set([0xff, 0xd8, 0xff]);
    const result = await call(profile.setAvatar, { body: { image: 'data:image/jpeg;base64,' + big.toString('base64') }, user: { id: OTHER_ID } });
    assert.strictEqual(result.status, 413);
  });
});

describe('gender lock', () => {
  beforeEach(() => {
    queries = [];
    state = { conflict: false, guestExists: true, ledger: [] };
  });

  it('requires a gender to register', async () => {
    const { status, body } = await call(authController.register, { body: { ...REGISTRATION, gender: undefined } });
    assert.strictEqual(status, 400);
    assert.match(body.error, /gender/i);
    assert.strictEqual(queries.length, 0);
  });

  it('lets guests change gender freely', async () => {
    state.profile = { is_guest: true, gender: 'other', country_code: 'ALL' };
    const { status, body } = await call(authController.updateProfile, {
      body: { gender: 'male', country: 'IN' }, user: { id: GUEST_ID, isGuest: true }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.user.gender, 'male');
  });

  it('stops registered users changing gender or typing a different country', async () => {
    state.profile = { is_guest: false, gender: 'female', country_code: 'IN' };
    let result = await call(authController.updateProfile, {
      body: { gender: 'male', country: 'IN' }, user: { id: OTHER_ID, isGuest: false }
    });
    assert.strictEqual(result.status, 403);
    assert.ok(!queries.some((q) => q.sql.includes('UPDATE users')));

    result = await call(authController.updateProfile, {
      body: { gender: 'female', country: 'GB' }, user: { id: OTHER_ID, isGuest: false }
    });
    assert.strictEqual(result.status, 403);
    assert.match(result.body.error, /location/);

    result = await call(authController.updateProfile, {
      body: { gender: 'female', country: 'IN' }, user: { id: OTHER_ID, isGuest: false }
    });
    assert.strictEqual(result.status, 200);
  });
});

describe('country from location', () => {
  beforeEach(() => {
    queries = [];
    state = { conflict: false, guestExists: true, ledger: [] };
  });

  it('sets the country from the location and ignores a typed one', async () => {
    await call(authController.register, { body: { ...REGISTRATION, country: 'US' } });
    const insert = queries.find((q) => q.sql.includes('INSERT INTO users'));
    assert.strictEqual(insert.params[4], 'IN');
  });

  it('requires a location that resolves to a country', async () => {
    let result = await call(authController.register, { body: { ...REGISTRATION, location: undefined } });
    assert.strictEqual(result.status, 400);
    assert.match(result.body.error, /location/);

    // Gulf of Guinea, no country
    result = await call(authController.register, { body: { ...REGISTRATION, location: { latitude: 0, longitude: 0 } } });
    assert.strictEqual(result.status, 400);

    result = await call(authController.register, { body: { ...REGISTRATION, location: { latitude: 'x', longitude: 500 } } });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(queries.length, 0);
  });

  it('previews and updates the country from a location', async () => {
    const preview = await call(authController.detectCountry, { body: { latitude: 51.5, longitude: -0.12 } });
    assert.strictEqual(preview.body.country, 'GB');

    const { body } = await call(authController.updateLocation, {
      body: { latitude: 40.7, longitude: -74 }, user: { id: OTHER_ID, isGuest: false }
    });
    assert.strictEqual(body.user.country, 'US');
    assert.strictEqual(verifyToken(body.token).country, 'US');
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
