const db = require('../config/db');
const redis = require('../config/redis');
const { BOOST } = require('../config/economy');

const boostKey = (userId) => `boost:${userId}`;

class BoostError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function cacheBoost(userId, boostUntil) {
  const remainingSeconds = Math.floor((new Date(boostUntil) - Date.now()) / 1000);
  if (remainingSeconds > 0) {
    await redis.set(boostKey(userId), new Date(boostUntil).toISOString(), 'EX', remainingSeconds);
  }
}

/**
 * ISO timestamp the user's boost ends, or null (read from Redis on the matchmaking hot path)
 */
async function getBoostExpiry(userId) {
  return redis.get(boostKey(userId));
}

/**
 * Restores an active boost from Postgres after a Redis flush (called on connect)
 */
async function hydrateBoost(userId) {
  if (await redis.exists(boostKey(userId))) return;
  const { rows } = await db.query('SELECT boost_until FROM users WHERE id = $1', [userId]);
  if (rows[0]?.boost_until) await cacheBoost(userId, rows[0].boost_until);
}

/**
 * Charges BOOST.PRICE and adds BOOST.DURATION_SECONDS of boost, stacking onto any active boost
 */
async function purchaseBoost(userId) {
  const result = await db.withTransaction(async (client) => {
    const debited = await client.query(
      `UPDATE users
       SET vibe_balance = vibe_balance - $2,
           boost_until = GREATEST(COALESCE(boost_until, NOW()), NOW()) + make_interval(secs => $3)
       WHERE id = $1 AND vibe_balance >= $2
       RETURNING vibe_balance, boost_until`,
      [userId, BOOST.PRICE, BOOST.DURATION_SECONDS]
    );

    if (!debited.rows[0]) {
      const { rows } = await client.query('SELECT vibe_balance FROM users WHERE id = $1', [userId]);
      if (!rows[0]) throw new BoostError(404, 'User not found');
      throw new BoostError(400, 'Insufficient VIBE tokens', {
        required: BOOST.PRICE,
        currentBalance: Number(rows[0].vibe_balance)
      });
    }

    await client.query(
      `INSERT INTO token_transactions (user_id, amount, transaction_type, metadata)
       VALUES ($1, $2, 'PURCHASE_BOOST', $3)`,
      [userId, -BOOST.PRICE, { durationSeconds: BOOST.DURATION_SECONDS }]
    );

    return {
      balance: Number(debited.rows[0].vibe_balance),
      boostUntil: new Date(debited.rows[0].boost_until).toISOString()
    };
  });

  await cacheBoost(userId, result.boostUntil);
  return result;
}

module.exports = { BoostError, getBoostExpiry, hydrateBoost, purchaseBoost };
