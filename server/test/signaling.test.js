// Signaling engine end to end: real Socket.IO server + clients, real Lua matchmaking on ioredis-mock
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { stubModule, stubRedis, sleep, once, startSignalingServer } = require('../test-support/harness');

const redis = stubRedis();
const dbCalls = [];
stubModule('config/db.js', {
  query: async (text) => {
    dbCalls.push(text);
    return { rows: [] };
  },
  withTransaction: async () => {
    throw new Error('no transactions expected in signaling tests');
  }
});

describe('signaling', () => {
  let app;
  let A, B, C;

  before(async () => {
    app = await startSignalingServer();
  });

  after(async () => {
    await app.close();
  });

  it('matches reciprocal filters and removes both users from every queue', async () => {
    A = await app.connect({ gender: 'male', country: 'IN' });
    B = await app.connect({ gender: 'female', country: 'IN' });
    const { matchA, matchB } = await app.matchPair(
      A, B,
      { targetGender: 'female', targetCountry: 'ALL' },
      { targetGender: 'any', targetCountry: 'ALL' }
    );

    assert.strictEqual(matchB.isInitiator, true);
    assert.strictEqual(matchA.isInitiator, false);
    assert.strictEqual(matchA.peer.id, B.userId);
    assert.strictEqual(matchA.roomId, matchB.roomId);
    assert.deepStrictEqual(await redis.smembers('queue:ALL:any'), []);
  });

  it('relays SDP and ICE only to the partner', async () => {
    const [offer] = await Promise.all([
      once(A, 'signal_offer'),
      B.emit('signal_offer', { sdp: { type: 'offer', sdp: 'x' } })
    ]);
    assert.strictEqual(offer.sdp.type, 'offer');

    const [ice] = await Promise.all([
      once(B, 'ice_candidate'),
      A.emit('ice_candidate', { candidate: { candidate: 'c' } })
    ]);
    assert.strictEqual(ice.candidate.candidate, 'c');
  });

  it('delivers in-call chat to the partner, echoes to the sender and persists it', async () => {
    const [received, sent] = await Promise.all([
      once(B, 'receive_message'),
      once(A, 'message_sent'),
      A.emit('send_message', { messageText: '  hello  ' })
    ]);
    assert.strictEqual(received.body, 'hello');
    assert.strictEqual(received.recipient_id, B.userId);
    assert.strictEqual(sent.id, received.id);

    await sleep(50);
    assert.ok(dbCalls.some((q) => q.includes('INSERT INTO messages')));
  });

  it('tells the partner when the user skips', async () => {
    await Promise.all([once(B, 'partner_left'), A.emit('find_partner', {})]);
    A.emit('leave');
    await sleep(50);
  });

  it('never matches a candidate whose own filters reject the searcher', async () => {
    C = await app.connect({ gender: 'male', country: 'US' });
    const D = await app.connect({ gender: 'male', country: 'US' });
    D.emit('find_partner', { targetCountry: 'IN' });
    await sleep(100);

    let cMatched = false;
    C.once('match_found', () => { cMatched = true; });
    C.emit('find_partner', { targetGender: 'any' });
    await sleep(200);
    assert.strictEqual(cMatched, false);

    D.disconnect();
    await sleep(100);
    assert.ok(!(await redis.smembers('queue:ALL:male')).includes(D.id), 'disconnect removes from pool');
  });

  it('refuses chat outside a call', async () => {
    const [err] = await Promise.all([once(C, 'chat_error'), C.emit('send_message', { messageText: 'hi' })]);
    assert.ok(err.error);
  });

  it('rejects sockets without a valid token', async () => {
    const bad = app.rawClient(`http://localhost:${app.port}`, { auth: { token: 'nope' }, transports: ['websocket'] });
    const err = await once(bad, 'connect_error');
    assert.strictEqual(err.message, 'unauthorized');
    bad.close();
  });

  it('rate-limits chat floods (16th message in 10s refused)', async () => {
    const E = await app.connect({ gender: 'female', country: 'US' });
    await Promise.all([once(C, 'match_found'), once(E, 'match_found'), E.emit('find_partner', {})]);

    let chatErrors = 0;
    C.on('chat_error', () => { chatErrors += 1; });
    for (let i = 0; i < 16; i++) C.emit('send_message', { messageText: `m${i}` });
    await sleep(300);
    assert.strictEqual(chatErrors, 1);
  });

  it('rate-limits skip spam (41st find_partner in a minute refused)', async () => {
    const F = await app.connect({ gender: 'male', country: 'US' });
    let matchErrors = 0;
    F.on('match_error', () => { matchErrors += 1; });
    for (let i = 0; i < 41; i++) {
      F.emit('find_partner', {});
      await sleep(15);
    }
    await sleep(200);
    assert.strictEqual(matchErrors, 1);
  });
});

describe('age filter', () => {
  let app;
  const born = (years) => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - years);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  };

  before(async () => {
    await redis.flushall();
    app = await startSignalingServer();
  });

  after(async () => {
    await app.close();
  });

  it('only matches people inside both age ranges and shows the age, never the birth date', async () => {
    const waiting = await app.connect({ birthDate: born(30) });
    waiting.emit('find_partner', { minAge: 18, maxAge: 25 });
    await sleep(100);

    // 40 is outside the waiting user's 18-25
    const older = await app.connect({ birthDate: born(40) });
    let olderMatched = false;
    older.once('match_found', () => { olderMatched = true; });
    older.emit('find_partner', {});
    await sleep(200);
    assert.strictEqual(olderMatched, false);
    older.emit('leave');

    // 22 fits, but this searcher only wants 35+: no match, and they wait instead
    const picky = await app.connect({ birthDate: born(22) });
    let pickyMatched = false;
    picky.once('match_found', () => { pickyMatched = true; });
    picky.emit('find_partner', { minAge: 35, maxAge: 60 });
    await sleep(200);
    assert.strictEqual(pickyMatched, false);
    picky.emit('leave');
    await sleep(50);

    const young = await app.connect({ birthDate: born(22) });
    const [forWaiting, forYoung] = await Promise.all([
      once(waiting, 'match_found'),
      once(young, 'match_found'),
      young.emit('find_partner', { minAge: 25, maxAge: 60 })
    ]);
    assert.strictEqual(forWaiting.peer.age, 22);
    assert.strictEqual(forYoung.peer.age, 30);
    assert.strictEqual(forYoung.peer.birthDate, undefined);
  });

  it('asks sessions without a birth date for one before matching', async () => {
    const noDate = await app.connect({ birthDate: null });
    const [err] = await Promise.all([once(noDate, 'match_error'), noDate.emit('find_partner', {})]);
    assert.strictEqual(err.needsBirthDate, true);
  });

  it('clamps and orders the requested range', () => {
    const { normalizePreferences } = require('../src/matchmaker');
    assert.deepStrictEqual(
      normalizePreferences({ minAge: 70, maxAge: 5 }),
      { targetGender: 'any', targetCountry: 'ALL', minAge: 18, maxAge: 60 }
    );
    assert.strictEqual(normalizePreferences({ minAge: 'x' }).minAge, 18);
    assert.strictEqual(normalizePreferences({ minAge: 30, maxAge: 24 }).minAge, 24);
  });
});
