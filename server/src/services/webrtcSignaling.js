const crypto = require('crypto');
const { verifyToken } = require('../config/jwt');
const matchmaker = require('../matchmaker');
const { saveAndDeliverMessage } = require('./chatService');
const meetToEarn = require('./meetToEarn');
const history = require('./history');
const moderation = require('./moderation');
const { consume } = require('../middlewares/rateLimiter');

// Skip-spam guard: bots cycling the queue get cut off; humans rarely skip more than once every few seconds
const FIND_PARTNER_LIMIT = { limit: 40, windowSeconds: 60 };
const CHAT_LIMIT = { limit: 15, windowSeconds: 10 };
const REPORT_LIMIT = { limit: 10, windowSeconds: 60 * 60 };

function toPublicProfile(user) {
  return { id: user.id, username: user.username, country: user.country };
}

function suspensionMessage(bannedUntil) {
  return `Your account is temporarily suspended after multiple community reports. You can match again after ${new Date(bannedUntil).toUTCString()}.`;
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
        id: claims.id,
        username: claims.username,
        gender: claims.gender || 'other',
        country: claims.country || 'ALL'
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

  /**
   * Credits Meet-to-Earn for call time elapsed since the last accrual. Time is
   * measured on the server, so clients cannot inflate it.
   */
  function accrueCallTime(socket) {
    if (!socket.data.partnerId) return;

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
    accrueCallTime(socket);
    socket.data.partnerId = null;

    if (partner && partner.data.partnerId === socket.id) {
      accrueCallTime(partner);
      partner.data.partnerId = null;
      partner.emit('partner_left');

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

  function pair(initiator, receiver) {
    const roomId = crypto.randomUUID();
    const connectedAt = Date.now();

    initiator.data.partnerId = receiver.id;
    receiver.data.partnerId = initiator.id;
    initiator.data.connectedAt = connectedAt;
    receiver.data.connectedAt = connectedAt;
    initiator.data.lastAccrualAt = connectedAt;
    receiver.data.lastAccrualAt = connectedAt;

    receiver.emit('match_found', {
      roomId,
      isInitiator: false,
      peer: toPublicProfile(initiator.data.user)
    });
    initiator.emit('match_found', {
      roomId,
      isInitiator: true,
      peer: toPublicProfile(receiver.data.user)
    });
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

    moderation
      .hydrateSafetyState(user.id)
      .catch((err) => console.error('[VibeLoop Safety] hydrate failed:', err.message));

    // One matchmaking attempt in flight per socket; repeats are ignored until it settles
    let isFinding = false;

    socket.on('find_partner', async (preferences) => {
      if (isFinding) return;
      isFinding = true;

      endCall(socket);

      const userState = {
        userId: user.id,
        gender: user.gender,
        country: user.country,
        ...matchmaker.normalizePreferences(preferences)
      };

      try {
        const bannedUntil = await moderation.getBanExpiry(user.id);
        if (bannedUntil) {
          socket.emit('match_error', { error: suspensionMessage(bannedUntil) });
          return;
        }

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

    socket.on('disconnect', async () => {
      endCall(socket);
      broadcastOnlineCount();
      try {
        await matchmaker.removeUser(socket.id, user);
      } catch (err) {
        console.error('[VibeLoop Match] disconnect cleanup failed:', err.message);
      }
    });
  });
}

module.exports = { registerSignaling };
