const db = require('../config/db');

// Matches the friendship row for a pair whichever of them sent the request
const PAIR = '((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))';

async function areFriends(userA, userB) {
  const { rows } = await db.query(
    `SELECT 1 FROM friendships WHERE status = 'accepted' AND ${PAIR}`,
    [userA, userB]
  );
  return rows.length > 0;
}

async function getFriendship(userA, userB) {
  const { rows } = await db.query(
    `SELECT requester_id, addressee_id, status FROM friendships WHERE ${PAIR}`,
    [userA, userB]
  );
  return rows[0] || null;
}

async function listFriendIds(userId) {
  const { rows } = await db.query(
    `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
     FROM friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
    [userId]
  );
  return rows.map((r) => r.id);
}

/**
 * Deletes the pair's friendship or pending request. Returns true if there was one.
 */
async function removeFriendship(userA, userB) {
  const { rowCount } = await db.query(`DELETE FROM friendships WHERE ${PAIR}`, [userA, userB]);
  return rowCount > 0;
}

module.exports = { areFriends, getFriendship, listFriendIds, removeFriendship };
