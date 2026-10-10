// Trust & safety: consent, 20-second history, block, report + automatic suspension
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { srcPath, stubModule, stubRedis, sleep, once, startSignalingServer } = require('../test-support/harness');

process.env.TRUST_PROXY = '1';
const redis = stubRedis();

// ---- in-memory Postgres stand-in -----------------------------------------
const reports = [];
const blocks = [];
const matchRows = [];
let banWrites = 0;

stubModule('config/db.js', {
  query: async (text, params = []) => {
    const sql = text.replace(/\s+/g, ' ');
    if (sql.includes('SELECT blocked_id FROM blocks')) return { rows: [] };
    if (sql.includes('SELECT banned_until FROM users')) return { rows: [] };
    if (sql.includes('INSERT INTO blocks')) { blocks.push(params); return { rows: [] }; }
    if (sql.includes('INSERT INTO reports')) {
      reports.push({ reporter: params[0], reported: params[1], reason: params[2], ip: params[4] });
      return { rows: [] };
    }
    if (sql.includes('COUNT(DISTINCT reporter_id)')) {
      const mine = reports.filter((r) => r.reported === params[0]);
      return {
        rows: [{ reporters: new Set(mine.map((r) => r.reporter)).size, ips: new Set(mine.map((r) => r.ip)).size }]
      };
    }
    if (sql.includes('SET banned_until')) { banWrites += 1; return { rows: [] }; }
    if (sql.includes('INSERT INTO match_history')) { matchRows.push(params); return { rows: [] }; }
    if (sql.includes('INSERT INTO messages') || sql.includes('DELETE FROM messages')) return { rows: [] };
    throw new Error(`unhandled SQL: ${sql}`);
  },
  withTransaction: async () => {
    throw new Error('unexpected transaction');
  }
});

const history = require(srcPath('services/history.js'));
const authController = require(srcPath('controllers/authController.js'));

// Shift both sides' call start so the call counts as `seconds` long
function ageCall(app, a, b, seconds) {
  app.io.sockets.sockets.get(a.id).data.connectedAt -= seconds * 1000;
  app.io.sockets.sockets.get(b.id).data.connectedAt -= seconds * 1000;
}

describe('consent', () => {
  it('rejects guest creation without age + terms confirmation', async () => {
    const result = await new Promise((resolve) => {
      authController.createGuest({ body: { ageConfirmed: true } }, {
        status(code) { this.code = code; return this; },
        json(body) { resolve({ code: this.code, body }); }
      });
    });
    assert.strictEqual(result.code, 400);
    assert.match(result.body.error, /18 or older/);
  });
});

describe('history, blocking and reports', () => {
  let app;

  before(async () => {
    app = await startSignalingServer();
  });

  after(async () => {
    await app.close();
  });

  it('does not log calls shorter than 20 seconds', async () => {
    const A = await app.connect();
    const B = await app.connect();
    await app.matchPair(A, B);
    A.emit('leave');
    await sleep(150);
    assert.deepStrictEqual(await history.getHistory(A.userId), []);
    A.close();
    B.close();
    await sleep(50);
  });

  it('logs 20s+ calls to both histories and match_history, deduplicating repeat contacts', async () => {
    const A = await app.connect();
    const B = await app.connect();

    await app.matchPair(A, B);
    ageCall(app, A, B, 25);
    await Promise.all([once(A, 'history_updated'), once(B, 'history_updated'), A.emit('leave')]);

    const historyA = await history.getHistory(A.userId);
    assert.strictEqual(historyA.length, 1);
    assert.strictEqual(historyA[0].peerId, B.userId);
    assert.ok(historyA[0].durationSeconds >= 25);
    assert.strictEqual((await history.getHistory(B.userId))[0].peerId, A.userId);
    assert.strictEqual(matchRows.length, 1);

    await app.matchPair(A, B);
    ageCall(app, A, B, 30);
    await Promise.all([once(A, 'history_updated'), A.emit('leave')]);
    assert.strictEqual((await history.getHistory(A.userId)).length, 1, 'same peer is not duplicated');

    // Blocking ends the call, clears history and prevents re-matching in both directions
    await app.matchPair(A, B);
    await Promise.all([once(A, 'safety_ack'), once(B, 'partner_left'), A.emit('block_partner')]);
    assert.deepStrictEqual(await history.getHistory(A.userId), []);
    assert.strictEqual(blocks.length, 1);

    let rematched = false;
    A.once('match_found', () => { rematched = true; });
    B.once('match_found', () => { rematched = true; });
    A.emit('find_partner', {});
    B.emit('find_partner', {});
    await sleep(300);
    assert.strictEqual(rematched, false);

    A.close();
    B.close();
    await sleep(100);
  });

  it('suspends a user reported by 3 distinct users on 3 distinct IPs', async () => {
    const target = await app.connect({}, '7.7.7.7');

    for (let i = 1; i <= 3; i++) {
      const reporter = await app.connect({}, `10.0.0.${i}`);
      await app.matchPair(target, reporter);
      const [, targetEvent] = await Promise.all([
        once(reporter, 'safety_ack'),
        once(target, i < 3 ? 'partner_left' : 'match_error'),
        reporter.emit('report_partner', { reason: 'harassment', details: 'test' })
      ]);
      if (i === 3) assert.match(targetEvent.error, /suspended/);
      reporter.close();
      await sleep(80);
    }

    assert.deepStrictEqual(reports.map((r) => r.ip), ['10.0.0.1', '10.0.0.2', '10.0.0.3']);
    assert.strictEqual(banWrites, 1);
    assert.ok(await redis.get(`ban:${target.userId}`));

    const [err] = await Promise.all([once(target, 'match_error'), target.emit('find_partner', {})]);
    assert.match(err.error, /suspended/, 'suspended users cannot search');
  });

  it('never bans on reports that all come from one IP', async () => {
    const target = await app.connect({}, '8.8.8.8');
    for (let i = 0; i < 3; i++) {
      const reporter = await app.connect({}, '6.6.6.6');
      await app.matchPair(target, reporter);
      await Promise.all([once(reporter, 'safety_ack'), reporter.emit('report_partner', { reason: 'spam' })]);
      reporter.close();
      await sleep(80);
    }
    assert.strictEqual(await redis.get(`ban:${target.userId}`), null);

    const other = await app.connect({}, '5.5.5.5');
    await app.matchPair(target, other);
    const [invalid] = await Promise.all([
      once(other, 'safety_error'),
      other.emit('report_partner', { reason: 'bogus' })
    ]);
    assert.ok(invalid.error, 'unknown report reasons are rejected');
  });
});
