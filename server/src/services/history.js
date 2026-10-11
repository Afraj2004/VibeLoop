const db = require('../config/db');
const redis = require('../config/redis');

// 20-second contact retention rule: only calls at least this long are remembered
const MIN_CALL_SECONDS = 20;
const HISTORY_LIMIT = 10;
const HISTORY_TTL_SECONDS = 30 * 24 * 60 * 60;

// Sorted set of peer IDs scored by call end time (re-matching moves a peer to the front)
const historyKey = (userId) => `history:${userId}`;
// Hash of peer ID -> JSON card details
const detailsKey = (userId) => `history:${userId}:peers`;

async function addEntry(userId, peer, durationSeconds, endedAt) {
  const card = JSON.stringify({
    peerId: peer.id,
    username: peer.username,
    country: peer.country,
    durationSeconds,
    endedAt
  });

  await redis
    .multi()
    .zadd(historyKey(userId), endedAt, peer.id)
    .hset(detailsKey(userId), peer.id, card)
    .expire(historyKey(userId), HISTORY_TTL_SECONDS)
    .expire(detailsKey(userId), HISTORY_TTL_SECONDS)
    .exec();

  // Keep only the newest HISTORY_LIMIT contacts
  const stale = await redis.zrange(historyKey(userId), 0, -(HISTORY_LIMIT + 1));
  if (stale.length > 0) {
    await redis
      .multi()
      .zrem(historyKey(userId), ...stale)
      .hdel(detailsKey(userId), ...stale)
      .exec();
  }
}

/**
 * Records a finished call for both participants if it met the 20-second threshold.
 * Returns true when it was recorded.
 */
async function recordCall(userA, userB, durationSeconds) {
  if (durationSeconds < MIN_CALL_SECONDS) return false;

  const endedAt = Date.now();
  await Promise.all([
    addEntry(userA.id, userB, durationSeconds, endedAt),
    addEntry(userB.id, userA, durationSeconds, endedAt)
  ]);

  try {
    await db.query(
      `INSERT INTO match_history (user_id, peer_id, duration_seconds)
       VALUES ($1, $2, $3), ($2, $1, $3)`,
      [userA.id, userB.id, durationSeconds]
    );
  } catch (err) {
    console.error('[VibeLoop History] Failed to persist match:', err.message);
  }
  return true;
}

async function removeEntry(userId, peerId) {
  await redis
    .multi()
    .zrem(historyKey(userId), peerId)
    .hdel(detailsKey(userId), peerId)
    .exec();
}

async function clearHistory(userId) {
  await redis.del(historyKey(userId), detailsKey(userId));
}

/**
 * Most recent contacts first
 */
async function getHistory(userId) {
  const peerIds = await redis.zrevrange(historyKey(userId), 0, HISTORY_LIMIT - 1);
  if (peerIds.length === 0) return [];

  const cards = await redis.hmget(detailsKey(userId), ...peerIds);
  return cards.filter(Boolean).map((card) => JSON.parse(card));
}

module.exports = { MIN_CALL_SECONDS, recordCall, removeEntry, clearHistory, getHistory };
