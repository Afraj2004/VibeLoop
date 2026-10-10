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
    D.emit('find_partner', { targetGender: 'female' });
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
