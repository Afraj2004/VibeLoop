// Registration with email verification (incl. guest upgrade), optional auth, and wallet transaction history
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { srcPath, stubModule, stubRedis } = require('../test-support/harness');

stubRedis();

const GUEST_ID = '11';
const NEW_ID = '22';
const OTHER_ID = '33';

let queries = [];
let state = {};

function userRow(id, overrides = {}) {
  return {
    id, username: 'newname', email: 'me@example.com', vibe_balance: '12.40',
    gender: 'female', country_code: 'IN', is_guest: false, ...overrides
  };
}

// Emails are captured instead of sent; codes are read from the subject line
let sentEmails = [];
let emailFails = false;
stubModule('services/email.js', {
  sendEmail: async (message) => {
    if (emailFails) throw new Error('Brevo down');
    sentEmails.push(message);
  },
  EmailError: class EmailError extends Error {},
  SUPPORT_EMAIL: 'help@example.com'
});
const lastCode = () => sentEmails.at(-1).subject.slice(0, 6);

const PASSWORD_HASH = bcrypt.hashSync('longenough1', 4);

// The account row waiting for (or past) verification
function pendingRow(id, overrides = {}) {
  return {
    ...userRow(id), password_hash: PASSWORD_HASH, email_verified_at: null, verification_code_hash: null,
    verification_expires_at: null, verification_attempts: 0, verification_sent_at: null, ...overrides
  };
}

stubModule('config/db.js', {
  query: async (text, params = []) => {
    const sql = text.replace(/\s+/g, ' ').trim();
    queries.push({ sql, params });
    if (sql.startsWith('SELECT id FROM users WHERE (LOWER(email)')) return { rows: state.conflict ? [{ id: OTHER_ID }] : [] };
    if (sql.startsWith('UPDATE users SET username')) {
      if (!state.guestExists) return { rows: [] };
      state.account = pendingRow(params[0], { email: params[2], is_guest: true });
      return { rows: [state.account] };
    }
    if (sql.startsWith('INSERT INTO users (username, email')) {
      state.account = pendingRow(NEW_ID, { email: params[1], country_code: params[4] });
      return { rows: [state.account] };
    }
    if (sql.startsWith('UPDATE users SET verification_code_hash')) {
      Object.assign(state.account, {
        verification_code_hash: params[1], verification_attempts: 0, verification_sent_at: new Date(),
        verification_expires_at: new Date(Date.now() + params[2] * 60000)
      });
      return { rows: [] };
    }
    if (sql.startsWith('SELECT * FROM users WHERE LOWER(email) = LOWER($1)')) {
      // A copy, like a real query result
      return { rows: state.account && state.account.email === params[0].toLowerCase() ? [{ ...state.account }] : [] };
    }
    if (sql.startsWith('UPDATE users SET verification_attempts = verification_attempts + 1')) {
      state.account.verification_attempts += 1;
      return { rows: [] };
    }
    if (sql.startsWith('WITH prior AS')) {
      if (state.account.email_verified_at) return { rows: [] };
      state.account.email_verified_at = new Date();
      const bonusPaid = !state.bonusAlreadyPaid;
      return { rows: [userRow(params[0], { is_guest: false, vibe_balance: bonusPaid ? '17.40' : '12.40', bonus_paid: bonusPaid })] };
    }
    if (sql.startsWith('WITH u AS ( UPDATE users SET avatar_url')) {
      if (!state.avatarUser) return { rows: [] };
      const first = !state.avatarUser.rewarded;
      state.avatarUser.rewarded = true;
      return { rows: [userRow(params[0], { vibe_balance: first ? '1.00' : '1.00', avatar_updated_at: new Date(), avatar_key: params[3], rewarded: first })] };
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

describe('registration', () => {
  beforeEach(() => {
    queries = [];
    sentEmails = [];
    emailFails = false;
    state = { conflict: false, guestExists: true, ledger: [] };
  });

  it('emails a code instead of signing in, keeping a guest a guest until verified', async () => {
    const { status, body } = await call(authController.register, {
      body: REGISTRATION,
      user: { id: GUEST_ID, isGuest: true }
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.needsVerification, true);
    assert.strictEqual(body.token, undefined);
    assert.strictEqual(body.user, undefined);

    const update = queries.find((q) => q.sql.startsWith('UPDATE users SET username'));
    assert.strictEqual(update.params[0], GUEST_ID);
    assert.match(update.sql, /WHERE id = \$1 AND is_guest = TRUE/);
    assert.doesNotMatch(update.sql, /is_guest = FALSE|vibe_balance/);
    assert.ok(!queries.some((q) => q.sql.startsWith('INSERT INTO users')));

    assert.strictEqual(sentEmails.length, 1);
    assert.strictEqual(sentEmails[0].to, 'me@example.com');
    assert.match(lastCode(), /^\d{6}$/);
    // Only a hash of the code is stored
    const stored = queries.find((q) => q.sql.startsWith('UPDATE users SET verification_code_hash'));
    assert.ok(!JSON.stringify(stored.params).includes(lastCode()));
  });

  it('normalises the email and excludes the guest\'s own row from the duplicate check', async () => {
    await call(authController.register, { body: { ...REGISTRATION, email: ' Me@Example.com ' }, user: { id: GUEST_ID, isGuest: true } });
    const check = queries.find((q) => q.sql.startsWith('SELECT id FROM users WHERE (LOWER(email)'));
    assert.deepStrictEqual(check.params, ['me@example.com', 'newname', GUEST_ID]);
  });

  it('creates a fresh pending account when the guest row is gone, or without a guest session', async () => {
    state.guestExists = false;
    let result = await call(authController.register, { body: REGISTRATION, user: { id: GUEST_ID, isGuest: true } });
    assert.strictEqual(result.status, 201);
    assert.ok(queries.some((q) => q.sql.startsWith('INSERT INTO users')));

    queries = [];
    result = await call(authController.register, { body: REGISTRATION, user: { id: OTHER_ID, isGuest: false } });
    assert.strictEqual(result.body.needsVerification, true);
    assert.ok(!queries.some((q) => q.sql.startsWith('UPDATE users SET username')));
  });

  it('rejects an email or username taken by someone else', async () => {
    state.conflict = true;
    const { status } = await call(authController.register, { body: REGISTRATION, user: { id: GUEST_ID, isGuest: true } });
    assert.strictEqual(status, 400);
    assert.ok(!queries.some((q) => q.sql.includes('UPDATE users')));
    assert.strictEqual(sentEmails.length, 0);
  });

  it('still creates the account when the email fails, and says to resend', async () => {
    emailFails = true;
    const { status, body } = await call(authController.register, { body: REGISTRATION });
    assert.strictEqual(status, 201);
    assert.match(body.emailError, /Resend code/);
  });
});

describe('email verification', () => {
  beforeEach(async () => {
    queries = [];
    sentEmails = [];
    emailFails = false;
    state = { conflict: false, guestExists: true, ledger: [] };
    await call(authController.register, { body: REGISTRATION, user: { id: GUEST_ID, isGuest: true } });
  });

  const verify = (code, email = 'me@example.com') => call(authController.verifyEmail, { body: { email, code } });

  it('counts wrong codes, then signs in with the right one and pays the bonus once', async () => {
    const wrong = lastCode() === '000000' ? '111111' : '000000';
    let result = await verify(wrong);
    assert.strictEqual(result.status, 400);
    assert.match(result.body.error, /4 tries left/);

    result = await verify(lastCode(), 'ME@example.com');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.bonus, REWARDS.SIGNUP);
    assert.strictEqual(result.body.upgraded, true);
    assert.strictEqual(result.body.user.id, GUEST_ID);
    assert.strictEqual(verifyToken(result.body.token).isGuest, false);

    const activate = queries.find((q) => q.sql.startsWith('WITH prior AS'));
    assert.match(activate.sql, /transaction_type = 'SIGNUP_BONUS'/);
    assert.match(activate.sql, /WHERE id = \$1 AND email_verified_at IS NULL/);

    // The code can't be used twice
    result = await verify(lastCode());
    assert.strictEqual(result.status, 400);
    assert.match(result.body.error, /already verified/);
  });

  it('does not pay the bonus to accounts that already received it', async () => {
    state.bonusAlreadyPaid = true;
    const { body } = await verify(lastCode());
    assert.strictEqual(body.bonus, 0);
  });

  it('locks the code after 5 wrong tries and rejects expired codes', async () => {
    const wrong = lastCode() === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) await verify(wrong);
    let result = await verify(lastCode());
    assert.strictEqual(result.status, 429);

    state.account.verification_attempts = 0;
    state.account.verification_expires_at = new Date(Date.now() - 1000);
    result = await verify(lastCode());
    assert.match(result.body.error, /expired/);
  });

  it('enforces a resend cooldown and answers the same for unknown emails', async () => {
    let result = await call(authController.resendCode, { body: { email: 'me@example.com' } });
    assert.strictEqual(result.status, 429);
    assert.ok(result.body.retryAfter > 0);

    state.account.verification_sent_at = new Date(Date.now() - 61000);
    result = await call(authController.resendCode, { body: { email: 'me@example.com' } });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentEmails.length, 2);

    result = await call(authController.resendCode, { body: { email: 'nobody@example.com' } });
    assert.deepStrictEqual(result.body, { success: true });
  });

  it('refuses to sign in until verified, then allows it', async () => {
    const login = () => call(authController.login, { body: { email: 'me@example.com', password: 'longenough1' } });
    let result = await login();
    assert.strictEqual(result.status, 403);
    assert.strictEqual(result.body.needsVerification, true);
    assert.strictEqual(result.body.token, undefined);

    await verify(lastCode());
    result = await login();
    assert.strictEqual(result.status, 200);
    assert.ok(result.body.token);
  });

  it('treats sessions from before the integer-ID switch as signed out', () => {
    const jwt = require('jsonwebtoken');
    const old = jwt.sign({ id: '7a9e93e4-4eaa-4247-8cad-eef9a633e850', username: 'x' }, process.env.JWT_SECRET);
    assert.throws(() => verifyToken(old));
  });
});

describe('sign-up bonus', () => {
  beforeEach(() => {
    queries = [];
    state = { conflict: false, guestExists: true, ledger: [] };
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
    const firstKey = result.body.user.avatarKey;
    assert.match(firstKey, /^[0-9a-f]{32}$/);
    const sql = queries[0].sql;
    assert.match(sql, /CASE WHEN avatar_rewarded_at IS NULL THEN \$3 ELSE 0 END/);
    assert.match(sql, /'PROFILE_PHOTO_BONUS' FROM u WHERE rewarded/);

    result = await call(profile.setAvatar, { body: { image: JPEG }, user: { id: OTHER_ID, isGuest: false } });
    assert.strictEqual(result.body.reward, 0);
    // Every upload gets a new unguessable URL key
    assert.notStrictEqual(result.body.user.avatarKey, firstKey);
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
