// Calls surviving a dropped connection: real Socket.IO server + clients, short resume window
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { stubModule, stubRedis, sleep, once, startSignalingServer } = require('../test-support/harness');

stubRedis();
stubModule('config/db.js', {
  query: async () => ({ rows: [] }),
  withTransaction: async () => {
    throw new Error('no transactions expected');
  }
});

const GRACE_MS = 400;

describe('call reconnect', () => {
  let app;

  before(async () => {
    app = await startSignalingServer({ resumeGraceMs: GRACE_MS });
  });

  after(async () => {
    await app.close();
  });

  async function newCall() {
    const a = await app.connect();
    const b = await app.connect();
    const { matchA } = await app.matchPair(a, b);
    return { a, b, roomId: matchA.roomId };
  }

  it('holds the call while a socket is gone and resumes it on the new socket', async () => {
    const { a, b, roomId } = await newCall();
    const oldId = a.id;

    let partnerLeft = false;
    b.on('partner_left', () => { partnerLeft = true; });
    await Promise.all([once(b, 'partner_reconnecting'), a.disconnect()]);

    a.connect();
    await once(a, 'connect');
    assert.notStrictEqual(a.id, oldId);
    const [resumed] = await Promise.all([
      once(a, 'call_resumed'),
      once(b, 'partner_reconnected'),
      a.emit('resume_call', { roomId })
    ]);
    assert.strictEqual(resumed.roomId, roomId);

    // Signaling flows both ways through the new socket, and the old seat never expires the call
    const [offer] = await Promise.all([once(b, 'signal_offer'), a.emit('signal_offer', { sdp: { type: 'offer', sdp: 'restart' } })]);
    assert.strictEqual(offer.sdp.sdp, 'restart');
    const [answer] = await Promise.all([once(a, 'signal_answer'), b.emit('signal_answer', { sdp: { type: 'answer', sdp: 'ok' } })]);
    assert.strictEqual(answer.sdp.sdp, 'ok');
    await sleep(GRACE_MS + 150);
    assert.strictEqual(partnerLeft, false);

    // Skipping still ends it normally
    await Promise.all([once(b, 'partner_left'), a.emit('leave')]);
  });

  it('ends the call for the partner when nobody comes back in time', async () => {
    const { a, b, roomId } = await newCall();
    await Promise.all([once(b, 'partner_reconnecting'), a.disconnect()]);
    await once(b, 'partner_left', GRACE_MS + 1000);

    a.connect();
    await once(a, 'connect');
    const [failed] = await Promise.all([once(a, 'call_resume_failed'), a.emit('resume_call', { roomId })]);
    assert.strictEqual(failed.roomId, roomId);
  });

  it('lets the same user take over from a socket the server still thinks is alive', async () => {
    const { a, b, roomId } = await newCall();
    // Same account, new connection (the old one is a zombie the server hasn't timed out yet)
    const a2 = await app.connect({ id: a.userId });
    const [, , kicked] = await Promise.all([
      once(a2, 'call_resumed'),
      once(b, 'partner_reconnected'),
      once(a, 'disconnect'),
      a2.emit('resume_call', { roomId })
    ]);
    assert.strictEqual(kicked, 'io server disconnect');

    const [ice] = await Promise.all([once(b, 'ice_candidate'), a2.emit('ice_candidate', { candidate: { candidate: 'new-path' } })]);
    assert.strictEqual(ice.candidate.candidate, 'new-path');
    await Promise.all([once(b, 'partner_left'), a2.emit('leave')]);
  });

  it("refuses to resume someone else's seat", async () => {
    const { b, roomId } = await newCall();
    const stranger = await app.connect();
    let reconnecting = false;
    b.on('partner_reconnected', () => { reconnecting = true; });
    const [failed] = await Promise.all([once(stranger, 'call_resume_failed'), stranger.emit('resume_call', { roomId })]);
    assert.strictEqual(failed.roomId, roomId);
    await sleep(50);
    assert.strictEqual(reconnecting, false);
  });
});
