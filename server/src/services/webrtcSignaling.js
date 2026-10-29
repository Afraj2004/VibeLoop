const crypto = require('crypto');
const { verifyToken } = require('../config/jwt');
const matchmaker = require('../matchmaker');
const { saveAndDeliverMessage } = require('./chatService');
const meetToEarn = require('./meetToEarn');
const history = require('./history');
const moderation = require('./moderation');
const boost = require('./boost');
const friends = require('./friends');
const likes = require('./likes');
const leaderboard = require('./leaderboard');
const { ageOn } = require('../config/age');
const { consume } = require('../middlewares/rateLimiter');

// Skip-spam guard: bots cycling the queue get cut off; humans rarely skip more than once every few seconds
const FIND_PARTNER_LIMIT = { limit: 40, windowSeconds: 60 };
const CHAT_LIMIT = { limit: 15, windowSeconds: 10 };
const REPORT_LIMIT = { limit: 10, windowSeconds: 60 * 60 };
const CALL_LIMIT = { limit: 10, windowSeconds: 60 };

// An unanswered friend call stops ringing after this long
const CALL_RING_MS = 30 * 1000;

const { isId } = require('../config/ids');

/**
 * What a matched partner learns about you. Your boost earns you a flame badge; the viewer's
 * own boost reveals your gender to them before video connects. Your age (never the birth date)
 * is always shown, and last week's top 3 on the likes leaderboard wear their medal (champion: 1-3).
 */
function toPublicProfile(user, { boosted = false, revealGender = false } = {}) {
  return {
    id: user.id,
    username: user.username,
    country: user.country,
    boosted,
    age: user.birthDate ? ageOn(user.birthDate) : null,
    champion: user.isGuest ? null : leaderboard.championPlace(user.id),
    ...(revealGender && { gender: user.gender })
  };
}

const BIRTH_DATE_REQUIRED = 'Add your date of birth to start matching.';

// Bans further out than this are treated as permanent in user-facing messages
const PERMANENT_BAN_YEARS = 50;

function suspensionMessage(bannedUntil) {
  const until = new Date(bannedUntil);
  if (until.getUTCFullYear() - new Date().getUTCFullYear() >= PERMANENT_BAN_YEARS) {
    return 'Your account has been permanently suspended for violating the Community Guidelines.';
  }
  return `Your account is suspended for violating the Community Guidelines. You can match again after ${until.toUTCString()}.`;
}

// Mirrors Express's trust-proxy handling so socket reports carry the same client IP as REST calls
function clientIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (process.env.TRUST_PROXY && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address;
}

/**
 * Registers the Socket.IO signaling engine.
 *
 * Call state (who is talking to whom) lives on socket.data, so SDP/ICE relays
 * only ever reach the socket's current partner, never an arbitrary socket ID.
 */
function registerSignaling(io) {
  // Every socket must carry a valid session JWT (guest or registered)
  io.use((socket, next) => {
    try {
      const claims = verifyToken(socket.handshake.auth?.token);
      socket.data.user = {
        id: String(claims.id),
        username: claims.username,
        gender: claims.gender || 'other',
        country: claims.country || 'ALL',
        birthDate: claims.birthDate || null,
        isGuest: Boolean(claims.isGuest)
      };
      socket.data.partnerId = null;
      next();
    } catch (err) {
      next(new Error('unauthorized'));
    }
  });

  const broadcastOnlineCount = () => {
    io.emit('online_count', io.of('/').sockets.size);
  };

  const isOnline = (userId) => io.of('/').adapter.rooms.has(`user:${userId}`);

  // Tells a user's friends they came online or went offline
  function announcePresence(userId, online) {
    friends
      .listFriendIds(userId)
      .then((ids) => ids.forEach((id) => io.to(`user:${id}`).emit('friend_presence', { userId, online })))
      .catch((err) => console.error('[VibeLoop Friends] presence failed:', err.message));
  }

  // Ringing friend calls: callId -> { callId, callerSocketId, calleeId, timer }
  const pendingCalls = new Map();

  function takePendingCall(callId) {
    const call = pendingCalls.get(callId);
    if (!call) return null;
    clearTimeout(call.timer);
    pendingCalls.delete(callId);
    const caller = io.sockets.sockets.get(call.callerSocketId);
    if (caller) caller.data.outgoingCallId = null;
    return { ...call, caller };
  }

  // Caller hung up (or disconnected) before an answer
  function cancelOutgoingCall(socket) {
    const call = takePendingCall(socket.data.outgoingCallId);
    if (call) io.to(`user:${call.calleeId}`).emit('call_cancelled', { callId: call.callId });
  }

  /**
   * Credits Meet-to-Earn for call time elapsed since the last accrual. Time is
   * measured on the server, so clients cannot inflate it.
   */
  function accrueCallTime(socket) {
    // Calls between friends don't earn: two friends could otherwise farm VIBE together
    if (!socket.data.partnerId || socket.data.friendCall) return;

    const now = Date.now();
    const seconds = (now - socket.data.lastAccrualAt) / 1000;
    socket.data.lastAccrualAt = now;
    if (seconds <= 0) return;

    meetToEarn
      .creditActiveSeconds(socket.data.user.id, seconds)
      .then((progress) => socket.emit('m2e_progress', progress))
      .catch((err) => console.error('[VibeLoop M2E] accrual failed:', err.message));
  }

  /**
   * Tears down the socket's current call (if any), notifies the partner and
   * logs the contact to both histories if the call lasted 20+ seconds
   */
  function endCall(socket) {
    const partnerId = socket.data.partnerId;
    if (!partnerId) return;

    const partner = io.sockets.sockets.get(partnerId);
    const wasFriendCall = Boolean(socket.data.friendCall);
    accrueCallTime(socket);
    socket.data.partnerId = null;
    socket.data.friendCall = false;

    if (partner && partner.data.partnerId === socket.id) {
      accrueCallTime(partner);
      partner.data.partnerId = null;
      partner.data.friendCall = false;
      partner.emit('partner_left');

      if (wasFriendCall) return;
      const durationSeconds = Math.floor((Date.now() - socket.data.connectedAt) / 1000);
      history
        .recordCall(socket.data.user, partner.data.user, durationSeconds)
        .then((recorded) => {
          if (recorded) {
            socket.emit('history_updated');
            partner.emit('history_updated');
          }
        })
        .catch((err) => console.error('[VibeLoop History] record failed:', err.message));
    }
  }

  /**
   * Drops every socket of a newly suspended user out of calls and the match pool
   */
  function enforceSuspension(userId, bannedUntil) {
    const socketIds = io.of('/').adapter.rooms.get(`user:${userId}`) || new Set();
    for (const socketId of socketIds) {
      const target = io.sockets.sockets.get(socketId);
      if (!target) continue;
      endCall(target);
      matchmaker.removeUser(target.id, target.data.user).catch(() => {});
      target.emit('match_error', { error: suspensionMessage(bannedUntil) });
    }
  }

  /**
   * Connects two sockets. `friendCall` marks a call placed to a friend rather than a random match.
   */
  function pair(initiator, receiver, { friendCall = false } = {}) {
    const roomId = crypto.randomUUID();
    const connectedAt = Date.now();

    initiator.data.partnerId = receiver.id;
    receiver.data.partnerId = initiator.id;
    initiator.data.friendCall = friendCall;
    receiver.data.friendCall = friendCall;
    // One like per call, in each direction
    initiator.data.likedPartner = false;
    receiver.data.likedPartner = false;
    initiator.data.connectedAt = connectedAt;
    receiver.data.connectedAt = connectedAt;
    initiator.data.lastAccrualAt = connectedAt;
    receiver.data.lastAccrualAt = connectedAt;

    receiver.emit('match_found', {
      roomId,
      friendCall,
      isInitiator: false,
      peer: toPublicProfile(initiator.data.user, {
        boosted: Boolean(initiator.data.boosted),
        revealGender: Boolean(receiver.data.boosted)
      })
    });
    initiator.emit('match_found', {
      roomId,
      friendCall,
      isInitiator: true,
      peer: toPublicProfile(receiver.data.user, {
        boosted: Boolean(receiver.data.boosted),
        revealGender: Boolean(initiator.data.boosted)
      })
    });
    sendLikeCounts(initiator, receiver);
  }

  // Sent right after match_found so pairing never waits on the database
  function sendLikeCounts(a, b) {
    const idA = a.data.user.id;
    const idB = b.data.user.id;
    likes
      .getCounts([idA, idB])
      .then((counts) => {
        a.emit('peer_likes', { userId: idB, likes: counts[idB] || 0 });
        b.emit('peer_likes', { userId: idA, likes: counts[idA] || 0 });
      })
      .catch((err) => console.error('[VibeLoop Likes] count fetch failed:', err.message));
  }

  function relayToPartner(socket, event, payload) {
    const partnerId = socket.data.partnerId;
    if (partnerId) {
      io.to(partnerId).emit(event, payload);
    }
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    broadcastOnlineCount();
    // First open tab: friends see this user come online
    if (!user.isGuest && io.of('/').adapter.rooms.get(`user:${user.id}`)?.size === 1) {
      announcePresence(user.id, true);
    }

    moderation
      .hydrateSafetyState(user.id)
      .catch((err) => console.error('[VibeLoop Safety] hydrate failed:', err.message));
    boost
      .hydrateBoost(user.id)
      .catch((err) => console.error('[VibeLoop Boost] hydrate failed:', err.message));

    // One matchmaking attempt in flight per socket; repeats are ignored until it settles
    let isFinding = false;

    socket.on('find_partner', async (preferences) => {
      if (isFinding) return;
      isFinding = true;

      endCall(socket);

      // Sessions from before birth dates were asked get the one-time prompt first
      if (!user.birthDate) {
        isFinding = false;
        socket.emit('match_error', { error: BIRTH_DATE_REQUIRED, needsBirthDate: true });
        return;
      }

      const userState = {
        userId: user.id,
        gender: user.gender,
        country: user.country,
        age: ageOn(user.birthDate),
        ...matchmaker.normalizePreferences(preferences)
      };

      try {
        const bannedUntil = await moderation.getBanExpiry(user.id);
        if (bannedUntil) {
          socket.emit('match_error', { error: suspensionMessage(bannedUntil) });
          return;
        }

        socket.data.boosted = Boolean(await boost.getBoostExpiry(user.id));
        userState.boosted = socket.data.boosted;

        // Gender filters are a VibeBoost perk; without a boost, match with everyone
        if (!socket.data.boosted) userState.targetGender = 'any';

        const { limit, windowSeconds } = FIND_PARTNER_LIMIT;
        const { allowed, retryAfter } = await consume(`find:${user.id}`, limit, windowSeconds);
        if (!allowed) {
          socket.emit('match_error', { error: `You're skipping too fast. Try again in ${retryAfter}s.` });
          return;
        }

        // Each loop either pairs, enqueues, or discards one stale queue entry, so it terminates
        for (;;) {
          const peerSocketId = await matchmaker.findOrEnqueue(socket.id, userState);

          if (!socket.connected) {
            await matchmaker.removeUser(socket.id, userState);
            return;
          }

          // Nobody compatible yet: we now wait in the pool until another searcher picks us
          if (!peerSocketId) return;

          const peer = io.sockets.sockets.get(peerSocketId);
          if (!peer || peer.data.partnerId) {
            await matchmaker.clearUserState(peerSocketId);
            continue;
          }

          // We are matched, so we are no longer waiting anywhere
          await matchmaker.dequeueUser(socket.id, userState);
          pair(socket, peer);
          return;
        }
      } catch (err) {
        console.error('[VibeLoop Match] find_partner failed:', err.message);
        socket.emit('match_error', { error: 'Matchmaking is temporarily unavailable' });
      } finally {
        isFinding = false;
      }
    });

    socket.on('leave', async () => {
      endCall(socket);
      try {
        await matchmaker.removeUser(socket.id, user);
      } catch (err) {
        console.error('[VibeLoop Match] leave cleanup failed:', err.message);
      }
    });

    // WebRTC negotiation relays
    socket.on('signal_offer', ({ sdp } = {}) => {
      if (sdp) relayToPartner(socket, 'signal_offer', { sdp });
    });

    socket.on('signal_answer', ({ sdp } = {}) => {
      if (sdp) relayToPartner(socket, 'signal_answer', { sdp });
    });

    socket.on('ice_candidate', ({ candidate } = {}) => {
      if (candidate) relayToPartner(socket, 'ice_candidate', { candidate });
    });

    // Trust & safety. Both end the call; the client then searches again.
    // blockUser() is invoked before endCall() so its Redis write is queued ahead of any
    // follow-up find_partner from either side: the pair can never be re-matched.
    socket.on('block_partner', async () => {
      const partner = io.sockets.sockets.get(socket.data.partnerId);
      if (!partner) return;

      const blocked = moderation.blockUser(user.id, partner.data.user.id);
      endCall(socket);

      try {
        await blocked;
        socket.emit('safety_ack', { action: 'block' });
      } catch (err) {
        console.error('[VibeLoop Safety] block failed:', err.message);
      }
    });

    socket.on('report_partner', async ({ reason, details } = {}) => {
      const partner = io.sockets.sockets.get(socket.data.partnerId);
      if (!partner) return;
      if (!moderation.REPORT_REASONS.includes(reason)) {
        return socket.emit('safety_error', { error: 'Invalid report reason' });
      }

      // Reporting always blocks, even if the report itself is rate-limited
      const reportedId = partner.data.user.id;
      const blocked = moderation.blockUser(user.id, reportedId);
      endCall(socket);

      try {
        await blocked;

        const { limit, windowSeconds } = REPORT_LIMIT;
        const { allowed } = await consume(`report:${user.id}`, limit, windowSeconds);
        if (!allowed) {
          return socket.emit('safety_error', { error: 'You have sent too many reports. Please try again later.' });
        }

        const bannedUntil = await moderation.fileReport({
          reporterId: user.id,
          reportedId,
          reason,
          details: typeof details === 'string' ? details.trim().substring(0, 500) : null,
          reporterIp: clientIp(socket)
        });
        if (bannedUntil) {
          enforceSuspension(reportedId, bannedUntil);
        }
        socket.emit('safety_ack', { action: 'report' });
      } catch (err) {
        console.error('[VibeLoop Safety] report failed:', err.message);
        socket.emit('safety_error', { error: 'Could not submit your report. Please try again.' });
      }
    });

    // Like the current partner (once per call). Both sides get the new lifetime total.
    socket.on('like_partner', async () => {
      const partner = io.sockets.sockets.get(socket.data.partnerId);
      if (!partner || socket.data.likedPartner) return;
      socket.data.likedPartner = true;

      const partnerId = partner.data.user.id;
      try {
        const total = await likes.addLike(partnerId, user.id);
        socket.emit('like_update', { userId: partnerId, likes: total });
        partner.emit('liked', { by: user.username, likes: total });
      } catch (err) {
        console.error('[VibeLoop Likes] like failed:', err.message);
        socket.data.likedPartner = false;
        socket.emit('like_error', { error: 'Could not send your like. Please try again.' });
      }
    });

    // Periodic client ping while in a call; the server decides how much time counts
    socket.on('m2e_heartbeat', () => accrueCallTime(socket));

    // In-call chat goes to the current partner only
    socket.on('send_message', async ({ messageText } = {}) => {
      const partner = io.sockets.sockets.get(socket.data.partnerId);
      if (!partner) {
        return socket.emit('chat_error', { error: 'You are not in a call' });
      }

      const { limit, windowSeconds } = CHAT_LIMIT;
      const { allowed } = await consume(`chat:${user.id}`, limit, windowSeconds);
      if (!allowed) {
        return socket.emit('chat_error', { error: 'Slow down! You are sending messages too quickly.' });
      }

      saveAndDeliverMessage(io, socket, { recipientId: partner.data.user.id, messageText });
    });

    // Direct messages between friends, outside any call
    socket.on('send_direct_message', async ({ friendId: rawFriendId, messageText } = {}) => {
      const friendId = String(rawFriendId ?? '');
      const fail = (error) => socket.emit('direct_message_error', { friendId, error });
      if (user.isGuest) return fail('Create an account to message friends');
      if (!isId(friendId) || typeof messageText !== 'string' || !messageText.trim()) return;

      try {
        const { limit, windowSeconds } = CHAT_LIMIT;
        const { allowed } = await consume(`chat:${user.id}`, limit, windowSeconds);
        if (!allowed) return fail('Slow down! You are sending messages too quickly.');
        if (!(await friends.areFriends(user.id, friendId))) return fail('You can only message friends');
      } catch (err) {
        console.error('[VibeLoop Friends] message check failed:', err.message);
        return fail('Could not send your message. Please try again.');
      }

      saveAndDeliverMessage(io, socket, { recipientId: friendId, messageText, direct: true });
    });

    // Friend calls: ring every tab the friend has open; the first to answer takes the call
    socket.on('call_friend', async ({ friendId: rawFriendId } = {}) => {
      const friendId = String(rawFriendId ?? '');
      const fail = (error) => socket.emit('call_error', { error });
      if (user.isGuest) return fail('Create an account to call friends');
      if (!isId(friendId) || socket.data.outgoingCallId) return;

      try {
        const { limit, windowSeconds } = CALL_LIMIT;
        const { allowed } = await consume(`call:${user.id}`, limit, windowSeconds);
        if (!allowed) return fail("You're calling too often. Try again in a minute.");

        const bannedUntil = await moderation.getBanExpiry(user.id);
        if (bannedUntil) return fail(suspensionMessage(bannedUntil));
        if (!(await friends.areFriends(user.id, friendId))) return fail('You can only call friends');
        if (!isOnline(friendId)) return fail("They're offline right now. Send them a message instead.");
        if (socket.data.outgoingCallId) return;

        // Calling takes you out of the match pool and any current call
        endCall(socket);
        await matchmaker.removeUser(socket.id, user);

        const callId = crypto.randomUUID();
        const timer = setTimeout(() => {
          if (!takePendingCall(callId)) return;
          socket.emit('call_ended', { callId, reason: 'no_answer' });
          io.to(`user:${friendId}`).emit('call_cancelled', { callId });
        }, CALL_RING_MS);
        pendingCalls.set(callId, { callId, callerSocketId: socket.id, calleeId: friendId, timer });
        socket.data.outgoingCallId = callId;

        io.to(`user:${friendId}`).emit('incoming_call', {
          callId,
          from: { id: user.id, username: user.username, country: user.country }
        });
        socket.emit('call_ringing', { callId, friendId });
      } catch (err) {
        console.error('[VibeLoop Friends] call failed:', err.message);
        fail('Could not place the call. Please try again.');
      }
    });

    socket.on('cancel_call', ({ callId } = {}) => {
      if (callId && callId === socket.data.outgoingCallId) cancelOutgoingCall(socket);
    });

    socket.on('answer_call', async ({ callId, accept } = {}) => {
      const pending = pendingCalls.get(callId);
      if (!pending || pending.calleeId !== user.id) {
        return socket.emit('call_cancelled', { callId });
      }

      const { caller } = takePendingCall(callId);
      // The callee's other tabs stop ringing
      socket.to(`user:${user.id}`).emit('call_cancelled', { callId });

      if (!accept) {
        caller?.emit('call_ended', { callId, reason: 'declined' });
        return;
      }
      if (!caller?.connected) {
        socket.emit('call_cancelled', { callId });
        return;
      }

      endCall(socket);
      endCall(caller);
      try {
        await Promise.all([
          matchmaker.removeUser(socket.id, user),
          matchmaker.removeUser(caller.id, caller.data.user)
        ]);
      } catch (err) {
        console.error('[VibeLoop Friends] queue cleanup failed:', err.message);
      }
      pair(caller, socket, { friendCall: true });
    });

    socket.on('disconnect', async () => {
      endCall(socket);
      cancelOutgoingCall(socket);
      broadcastOnlineCount();
      if (!user.isGuest && !isOnline(user.id)) {
        announcePresence(user.id, false);
      }
      try {
        await matchmaker.removeUser(socket.id, user);
      } catch (err) {
        console.error('[VibeLoop Match] disconnect cleanup failed:', err.message);
      }
    });
  });

  /**
   * Closes every socket a user has open (e.g. after account deletion); the
   * disconnect handler ends calls and clears matchmaking state
   */
  function disconnectUser(userId) {
    io.in(`user:${userId}`).disconnectSockets(true);
  }

  // Hooks for REST controllers (admin bans, account deletion, friend presence)
  return { enforceSuspension, disconnectUser, isOnline };
}

module.exports = { registerSignaling };
