const db = require('../config/db');

/**
 * Lifetime likes received, keyed by user ID
 */
async function getCounts(userIds) {
  const { rows } = await db.query(
    'SELECT id, likes_received FROM users WHERE id = ANY($1::bigint[])',
    [userIds]
  );
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.likes_received)]));
}

/**
 * Adds one like and returns the new total (null if the user no longer exists).
 * Each like is also logged with its time, for the weekly leaderboard.
 */
async function addLike(userId, likerId) {
  const { rows } = await db.query(
    `WITH u AS (
       UPDATE users SET likes_received = likes_received + 1 WHERE id = $1 RETURNING id, likes_received
     ), logged AS (
       INSERT INTO like_events (liked_id, liker_id) SELECT id, $2 FROM u
     )
     SELECT likes_received FROM u`,
    [userId, likerId]
  );
  return rows[0] ? Number(rows[0].likes_received) : null;
}

module.exports = { getCounts, addLike };
