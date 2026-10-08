const db = require('../config/db');
const redis = require('../config/redis');
const { M2E, roundVibe } = require('../config/economy');

// Daily counters are keyed by UTC date and kept a little past midnight before expiring
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

const todayUtc = () => new Date().toISOString().slice(0, 10);
const secondsKey = (userId, day) => `m2e:${userId}:${day}`;
const secondsUntilNextReward = (total) => Math.ceil(M2E.CYCLE_SECONDS - (total % M2E.CYCLE_SECONDS));

/**
 * Credits a reward in Postgres, clamped to the daily cap, with a ledger entry.
 * Returns the amount actually credited plus the user's new balances.
 */
async function grantReward(userId, amount, day) {
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT daily_earned_tokens, last_earned_date::text AS last_day
       FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (!rows[0]) return { rewardEarned: 0 };

    const earnedToday = rows[0].last_day === day ? Number(rows[0].daily_earned_tokens) : 0;
    const reward = roundVibe(Math.min(amount, M2E.DAILY_CAP - earnedToday));
    if (reward <= 0) return { rewardEarned: 0, m2eEarnedToday: earnedToday };

    const updated = await client.query(
      `UPDATE users
       SET vibe_balance = vibe_balance + $2, daily_earned_tokens = $3, last_earned_date = $4
       WHERE id = $1
       RETURNING vibe_balance`,
      [userId, reward, roundVibe(earnedToday + reward), day]
    );
    await client.query(
      `INSERT INTO token_transactions (user_id, amount, transaction_type, metadata)
       VALUES ($1, $2, 'EARN_CHAT', $3)`,
      [userId, reward, { day }]
    );

    return {
      rewardEarned: reward,
      balance: Number(updated.rows[0].vibe_balance),
      m2eEarnedToday: roundVibe(earnedToday + reward)
    };
  });
}

/**
 * Adds server-measured call time for a user. Every completed 3-minute cycle
 * earns REWARD_PER_CYCLE VIBE, up to DAILY_CAP per UTC day.
 */
async function creditActiveSeconds(userId, seconds) {
  const day = todayUtc();
  const key = secondsKey(userId, day);

  const [[, totalRaw]] = await redis
    .multi()
    .incrbyfloat(key, seconds)
    .expire(key, COUNTER_TTL_SECONDS)
    .exec();
  const total = Number(totalRaw);

  const cycles = Math.floor(total / M2E.CYCLE_SECONDS) - Math.floor((total - seconds) / M2E.CYCLE_SECONDS);
  const progress = { rewardEarned: 0, secondsUntilNextReward: secondsUntilNextReward(total) };

  if (cycles <= 0) return progress;
  return { ...progress, ...(await grantReward(userId, cycles * M2E.REWARD_PER_CYCLE, day)) };
}

/**
 * Today's Meet-to-Earn state for display
 */
async function getProgress(userId) {
  const total = Number(await redis.get(secondsKey(userId, todayUtc()))) || 0;
  return { activeSecondsToday: Math.floor(total), secondsUntilNextReward: secondsUntilNextReward(total) };
}

module.exports = { creditActiveSeconds, getProgress, todayUtc };
