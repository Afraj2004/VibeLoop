// Admin moderation endpoints and personal-data rights (export / deletion)
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { srcPath, stubModule, stubRedis } = require('../test-support/harness');

const redis = stubRedis();

// ---- scriptable fake Postgres ---------------------------------------------
let queries = [];
let users = {};
let matchPeers = [];

stubModule('config/db.js', {
  query: async (text, params = []) => {
    const sql = text.replace(/\s+/g, ' ').trim();
    queries.push({ sql, params });
    if (sql.startsWith('SELECT is_admin')) return { rows: users[params[0]] ? [{ is_admin: users[params[0]].isAdmin }] : [] };
    if (sql.startsWith('SELECT password_hash')) return { rows: users[params[0]] ? [{ password_hash: users[params[0]].hash }] : [] };
    if (sql.startsWith('SELECT DISTINCT user_id FROM match_history')) return { rows: matchPeers.map((user_id) => ({ user_id })) };
    if (sql.startsWith('SELECT id, username, email')) return { rows: users[params[0]] ? [{ id: params[0], username: 'me' }] : [] };
    if (sql.startsWith('SELECT')) return { rows: [] };
    return { rows: [] };
  }
});

const requireAdmin = require(srcPath('middlewares/requireAdmin.js'));
const admin = require(srcPath('controllers/adminController.js'));
const account = require(srcPath('controllers/accountController.js'));
const history = require(srcPath('services/history.js'));

const ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MEMBER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GUEST = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PEER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function call(handler, req) {
  const signalingCalls = [];
  const fullReq = {
    params: {},
    body: {},
    ...req,
    app: {
      get: () => ({
        enforceSuspension: (...args) => signalingCalls.push(['enforceSuspension', ...args]),
        disconnectUser: (...args) => signalingCalls.push(['disconnectUser', ...args])
      })
    }
  };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, headers: this.headers, signalingCalls, nextCalled: false }); }
    };
    handler(fullReq, res, () => resolve({ nextCalled: true, signalingCalls }));
  });
}

async function resetState() {
  queries = [];
  matchPeers = [];
  users = {
    [ADMIN]: { isAdmin: true, hash: null },
    [MEMBER]: { isAdmin: false, hash: await bcrypt.hash('correct horse', 4) },
    [GUEST]: { isAdmin: false, hash: null }
  };
}

describe('admin access', () => {
  beforeEach(resetState);

  it('blocks non-admins and lets admins through', async () => {
    const denied = await call(requireAdmin, { user: { id: MEMBER } });
    assert.strictEqual(denied.status, 403);
    const allowed = await call(requireAdmin, { user: { id: ADMIN } });
    assert.strictEqual(allowed.nextCalled, true);
  });
});

describe('admin moderation actions', () => {
  beforeEach(resetState);

  it('validates the user id and ban duration', async () => {
    assert.strictEqual((await call(admin.banUser, { user: { id: ADMIN }, params: { id: 'nope' }, body: { duration: '24h' } })).status, 400);
    assert.strictEqual((await call(admin.banUser, { user: { id: ADMIN }, params: { id: MEMBER }, body: { duration: 'forever' } })).status, 400);
  });

  it('bans: sets the ban, kicks live sessions, closes open reports, writes the audit log', async () => {
    const result = await call(admin.banUser, { user: { id: ADMIN }, params: { id: MEMBER }, body: { duration: '7d' } });
    assert.strictEqual(result.status, 200);

    const ttl = await redis.ttl(`ban:${MEMBER}`);
    assert.ok(ttl > 6 * 24 * 3600 && ttl <= 7 * 24 * 3600);
    assert.strictEqual(result.signalingCalls[0][0], 'enforceSuspension');
    assert.strictEqual(result.signalingCalls[0][1], MEMBER);
    assert.ok(queries.some((q) => q.sql.startsWith('UPDATE reports SET reviewed_at')));
    const audit = queries.find((q) => q.sql.startsWith('INSERT INTO moderation_actions'));
    assert.deepStrictEqual(audit.params, [ADMIN, MEMBER, 'ban', { duration: '7d' }]);
  });

  it('unbans and dismisses with audit entries', async () => {
    await redis.set(`ban:${MEMBER}`, 'x', 'EX', 100);
    assert.strictEqual((await call(admin.unbanUser, { user: { id: ADMIN }, params: { id: MEMBER } })).status, 200);
    assert.strictEqual(await redis.get(`ban:${MEMBER}`), null);
    assert.ok(queries.some((q) => q.sql.includes('SET banned_until = NULL')));

    assert.strictEqual((await call(admin.dismissReports, { user: { id: ADMIN }, params: { id: MEMBER } })).status, 200);
    const actions = queries.filter((q) => q.sql.startsWith('INSERT INTO moderation_actions')).map((q) => q.params[2]);
    assert.deepStrictEqual(actions, ['unban', 'dismiss']);
  });
});

describe('account deletion', () => {
  beforeEach(resetState);

  it('requires typing DELETE', async () => {
    const result = await call(account.deleteAccount, { user: { id: GUEST }, body: {} });
    assert.strictEqual(result.status, 400);
    assert.ok(!queries.some((q) => q.sql.startsWith('DELETE FROM users')));
  });

  it('requires the correct password for registered accounts', async () => {
    const result = await call(account.deleteAccount, { user: { id: MEMBER }, body: { confirm: 'DELETE', password: 'wrong' } });
    assert.strictEqual(result.status, 401);
    assert.ok(!queries.some((q) => q.sql.startsWith('DELETE FROM users')));
  });

  it('erases the account: disconnects, scrubs other users\' history strips and Redis state, deletes the row', async () => {
    matchPeers = [PEER];
    await history.recordCall(
      { id: MEMBER, username: 'member', country: 'IN' },
      { id: PEER, username: 'peer', country: 'IN' },
      45
    );
    await redis.sadd(`blocks:${MEMBER}`, PEER);
    assert.strictEqual((await history.getHistory(PEER)).length, 1);

    const result = await call(account.deleteAccount, {
      user: { id: MEMBER },
      body: { confirm: 'DELETE', password: 'correct horse' }
    });
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.signalingCalls[0], ['disconnectUser', MEMBER]);
    assert.deepStrictEqual(await history.getHistory(PEER), [], 'removed from the peer\'s recent contacts');
    assert.deepStrictEqual(await history.getHistory(MEMBER), []);
    assert.strictEqual(await redis.exists(`blocks:${MEMBER}`), 0);
    assert.ok(queries.some((q) => q.sql.startsWith('UPDATE reports SET reporter_ip = NULL')), 'reporter IPs scrubbed');
    const deletion = queries.find((q) => q.sql.startsWith('DELETE FROM users'));
    assert.deepStrictEqual(deletion.params, [MEMBER]);
  });

  it('lets guests delete with confirmation only', async () => {
    const result = await call(account.deleteAccount, { user: { id: GUEST }, body: { confirm: 'DELETE' } });
    assert.strictEqual(result.status, 200);
  });
});

describe('data export', () => {
  beforeEach(resetState);

  it('returns every data category as a downloadable file', async () => {
    const result = await call(account.exportData, { user: { id: GUEST } });
    assert.strictEqual(result.status, 200);
    assert.match(result.headers['Content-Disposition'], /attachment; filename="vibeloop-data-\d{4}-\d{2}-\d{2}\.json"/);
    for (const key of ['profile', 'transactions', 'matchHistory', 'recentContacts', 'messages', 'reportsYouFiled', 'usersYouBlocked']) {
      assert.ok(key in result.body, `export includes ${key}`);
    }
  });
});
