const db = require('../config/db');

/**
 * Lifetime likes received, keyed by user ID
 */
async function getCounts(userIds) {
  const { rows } = await db.query(
    'SELECT id, likes_received FROM users WHERE id = ANY($1::uuid[])',
    [userIds]
  );
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.likes_received)]));
}

/**
 * Adds one like and returns the new total (null if the user no longer exists)
 */
async function addLike(userId) {
  const { rows } = await db.query(
    'UPDATE users SET likes_received = likes_received + 1 WHERE id = $1 RETURNING likes_received',
    [userId]
  );
  return rows[0] ? Number(rows[0].likes_received) : null;
}

module.exports = { getCounts, addLike };
