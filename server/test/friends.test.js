// Friends: direct messages and calls over the socket, plus the friend-request rules
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { srcPath, stubModule, stubRedis, sleep, once, startSignalingServer } = require('../test-support/harness');

stubRedis();

// Accepted friendships as "a|b" keys (both orders)
const friendPairs = new Set();
const befriend = (a, b) => { friendPairs.add(`${a}|${b}`); friendPairs.add(`${b}|${a}`); };

const dbCalls = [];
let requestState = {};
const likeCounts = {};

stubModule('config/db.js', {
  query: async (text, params = []) => {
    const sql = text.replace(/\s+/g, ' ').trim();
    dbCalls.push({ sql, params });

    if (sql.startsWith("SELECT 1 FROM friendships WHERE status = 'accepted'")) {
      return { rows: friendPairs.has(`${params[0]}|${params[1]}`) ? [{}] : [] };
    }
    if (sql.startsWith('SELECT CASE WHEN requester_id')) {
      return { rows: [...friendPairs].filter((k) => k.startsWith(`${params[0]}|`)).map((k) => ({ id: k.split('|')[1] })) };
    }
    // Friend-request controller
    if (sql.startsWith('SELECT id, username, is_guest FROM users')) return { rows: requestState.target ? [requestState.target] : [] };
    if (sql.startsWith('SELECT 1 FROM blocks')) return { rows: requestState.blocked ? [{}] : [] };
    if (sql.startsWith('SELECT requester_id, addressee_id, status FROM friendships')) return { rows: requestState.existing ? [requestState.existing] : [] };
    if (sql.startsWith('UPDATE friendships')) return { rows: [], rowCount: 1 };
    // Likes
    if (sql.startsWith('SELECT id, likes_received FROM users')) return { rows: params[0].map((id) => ({ id, likes_received: likeCounts[id] || 0 })) };
    if (sql.startsWith('UPDATE users SET likes_received')) {
      likeCounts[params[0]] = (likeCounts[params[0]] || 0) + 1;
      return { rows: [{ likes_received: likeCounts[params[0]] }] };
    }
    if (sql.startsWith('INSERT INTO friendships')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  },
  withTransaction: async () => {
    throw new Error('no transactions expected');
  }
});

describe('friends over the socket', () => {
  let app;
  let A, B, C;

  before(async () => {
    app = await startSignalingServer();
    A = await app.connect({ isGuest: false });
    B = await app.connect({ isGuest: false });
    C = await app.connect({ isGuest: false });
    befriend(A.userId, B.userId);
  });

  after(async () => {
    await app.close();
  });

  it('delivers direct messages between friends to both sides, unread', async () => {
    const [received, echoed] = await Promise.all([
      once(B, 'direct_message'),
      once(A, 'direct_message'),
      A.emit('send_direct_message', { friendId: B.userId, messageText: ' hey ' })
    ]);
    assert.strictEqual(received.body, 'hey');
    assert.strictEqual(echoed.id, received.id);

    await sleep(50);
    const insert = dbCalls.find((q) => q.sql.startsWith('INSERT INTO messages'));
    assert.strictEqual(insert.params.at(-1), false);
  });

  it('refuses direct messages to non-friends', async () => {
    let delivered = false;
    C.once('direct_message', () => { delivered = true; });
    const [err] = await Promise.all([
      once(A, 'direct_message_error'),
      A.emit('send_direct_message', { friendId: C.userId, messageText: 'hi' })
    ]);
    assert.match(err.error, /only message friends/);
    await sleep(50);
    assert.strictEqual(delivered, false);
  });

  it('rings a friend and connects both sides as a friend call when accepted', async () => {
    const [incoming] = await Promise.all([
      once(B, 'incoming_call'),
      once(A, 'call_ringing'),
      A.emit('call_friend', { friendId: B.userId })
    ]);
    assert.strictEqual(incoming.from.id, A.userId);

    const [matchA, matchB] = await Promise.all([
      once(A, 'match_found'),
      once(B, 'match_found'),
      B.emit('answer_call', { callId: incoming.callId, accept: true })
    ]);
    assert.strictEqual(matchA.friendCall, true);
    assert.strictEqual(matchA.isInitiator, true);
    assert.strictEqual(matchB.peer.id, A.userId);

    // Hanging up tells the friend, and friend calls are not logged to history
    dbCalls.length = 0;
    await Promise.all([once(B, 'partner_left'), A.emit('leave')]);
    await sleep(50);
    assert.ok(!dbCalls.some((q) => q.sql.includes('match_history')));
  });

  it('sends like counts with a match and allows one like per call', async () => {
    likeCounts[B.userId] = 7;
    const [incoming] = await Promise.all([once(B, 'incoming_call'), A.emit('call_friend', { friendId: B.userId })]);
    const [likesSeenByA] = await Promise.all([
      once(A, 'peer_likes'),
      B.emit('answer_call', { callId: incoming.callId, accept: true })
    ]);
    assert.deepStrictEqual(likesSeenByA, { userId: B.userId, likes: 7 });

    const [update, liked] = await Promise.all([once(A, 'like_update'), once(B, 'liked'), A.emit('like_partner')]);
    assert.strictEqual(update.likes, 8);
    assert.strictEqual(liked.likes, 8);

    // A second like in the same call is ignored
    A.emit('like_partner');
    await sleep(80);
    assert.strictEqual(likeCounts[B.userId], 8);

    await Promise.all([once(B, 'partner_left'), A.emit('leave')]);
  });

  it('tells the caller when the friend declines', async () => {
    const [incoming] = await Promise.all([once(B, 'incoming_call'), A.emit('call_friend', { friendId: B.userId })]);
    const [ended] = await Promise.all([
      once(A, 'call_ended'),
      B.emit('answer_call', { callId: incoming.callId, accept: false })
    ]);
    assert.strictEqual(ended.reason, 'declined');
  });

  it('stops ringing when the caller cancels, and the stale answer goes nowhere', async () => {
    const [incoming] = await Promise.all([once(B, 'incoming_call'), A.emit('call_friend', { friendId: B.userId })]);
    await Promise.all([once(B, 'call_cancelled'), A.emit('cancel_call', { callId: incoming.callId })]);

    let matched = false;
    A.once('match_found', () => { matched = true; });
    await Promise.all([once(B, 'call_cancelled'), B.emit('answer_call', { callId: incoming.callId, accept: true })]);
    await sleep(50);
    assert.strictEqual(matched, false);
  });

  it('only lets registered friends call', async () => {
    let [err] = await Promise.all([once(A, 'call_error'), A.emit('call_friend', { friendId: C.userId })]);
    assert.match(err.error, /only call friends/);

    const guest = await app.connect({ isGuest: true });
    [err] = await Promise.all([once(guest, 'call_error'), guest.emit('call_friend', { friendId: A.userId })]);
    assert.match(err.error, /Create an account/);
  });

  it('tells friends when someone goes offline', async () => {
    const [presence] = await Promise.all([once(A, 'friend_presence'), B.close()]);
    assert.deepStrictEqual(presence, { userId: B.userId, online: false });

    const [err] = await Promise.all([once(A, 'call_error'), A.emit('call_friend', { friendId: B.userId })]);
    assert.match(err.error, /offline/);
  });
});

describe('friend requests', () => {
  const friendsController = require(srcPath('controllers/friendsController.js'));
  const ME = '00000000-0000-0000-0000-00000000aaaa';
  const THEM = '00000000-0000-0000-0000-00000000bbbb';

  function call(handler, req) {
    return new Promise((resolve) => {
      handler({ body: {}, params: {}, ...req }, {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ status: this.statusCode, body }); }
      });
    });
  }

  const send = (body, user = { id: ME, username: 'me', isGuest: false }) => call(friendsController.sendRequest, { body, user });

  beforeEach(() => {
    dbCalls.length = 0;
    requestState = { target: { id: THEM, username: 'them', is_guest: false } };
  });

  it('sends a pending request by username', async () => {
    const { status, body } = await send({ username: 'Them' });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.status, 'pending');
    assert.ok(dbCalls.some((q) => q.sql.startsWith('INSERT INTO friendships')));
  });

  it('accepts instead when they already asked you', async () => {
    requestState.existing = { requester_id: THEM, addressee_id: ME, status: 'pending' };
    const { body } = await send({ userId: THEM });
    assert.strictEqual(body.status, 'accepted');
    assert.ok(!dbCalls.some((q) => q.sql.startsWith('INSERT INTO friendships')));
  });

  it('refuses guests, guest targets, yourself and blocked users', async () => {
    assert.strictEqual((await send({ userId: THEM }, { id: ME, isGuest: true })).status, 403);

    requestState.target = { id: THEM, username: 'guest_x', is_guest: true };
    assert.strictEqual((await send({ userId: THEM })).status, 400);

    requestState.target = { id: ME, username: 'me', is_guest: false };
    assert.strictEqual((await send({ userId: ME })).status, 400);

    requestState = { target: { id: THEM, username: 'them', is_guest: false }, blocked: true };
    assert.strictEqual((await send({ userId: THEM })).status, 403);
    assert.ok(!dbCalls.some((q) => q.sql.startsWith('INSERT INTO friendships')));
  });

  it('reports duplicates', async () => {
    requestState.existing = { requester_id: ME, addressee_id: THEM, status: 'pending' };
    assert.strictEqual((await send({ userId: THEM })).status, 409);
    requestState.existing = { requester_id: THEM, addressee_id: ME, status: 'accepted' };
    assert.strictEqual((await send({ userId: THEM })).status, 409);
  });
});
