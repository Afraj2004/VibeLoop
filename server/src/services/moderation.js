const db = require('../config/db');
const redis = require('../config/redis');
const history = require('./history');

const REPORT_REASONS = ['nudity', 'harassment', 'underage', 'spam', 'violence', 'other'];

// Automatic suspension: this many distinct reporters (from distinct IPs) within the window
const BAN_REPORT_THRESHOLD = 3;
const BAN_SECONDS = 24 * 60 * 60;

const blocksKey = (userId) => `blocks:${userId}`;
const banKey = (userId) => `ban:${userId}`;

/**
 * Loads a user's blocks and any active ban from Postgres into Redis, where the
 * matchmaker reads them. Called on connect so a Redis flush cannot lift either.
 */
async function hydrateSafetyState(userId) {
  const [blocks, user] = await Promise.all([
    db.query('SELECT blocked_id FROM blocks WHERE blocker_id = $1', [userId]),
    db.query('SELECT banned_until FROM users WHERE id = $1', [userId])
  ]);

  if (blocks.rows.length > 0) {
    await redis.sadd(blocksKey(userId), ...blocks.rows.map((r) => r.blocked_id));
  }

  const bannedUntil = user.rows[0]?.banned_until;
  const remainingSeconds = bannedUntil ? Math.floor((new Date(bannedUntil) - Date.now()) / 1000) : 0;
  if (remainingSeconds > 0) {
    await redis.set(banKey(userId), new Date(bannedUntil).toISOString(), 'EX', remainingSeconds);
  }
}

async function blockUser(blockerId, blockedId) {
  await redis.sadd(blocksKey(blockerId), blockedId);
  await history.removeEntry(blockerId, blockedId);
  await db.query(
    'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [blockerId, blockedId]
  );
}

async function banUser(userId) {
  const until = new Date(Date.now() + BAN_SECONDS * 1000);
  await redis.set(banKey(userId), until.toISOString(), 'EX', BAN_SECONDS);
  await db.query('UPDATE users SET banned_until = $2 WHERE id = $1', [userId, until]);
  return until;
}

/**
 * ISO timestamp the user's suspension ends, or null
 */
async function getBanExpiry(userId) {
  return redis.get(banKey(userId));
}

/**
 * Stores a report and applies the automatic suspension rule.
 * Returns the ban expiry Date if this report triggered a suspension, otherwise null.
 */
async function fileReport({ reporterId, reportedId, reason, details, reporterIp }) {
  await db.query(
    `INSERT INTO reports (reporter_id, reported_id, reason, details, reporter_ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [reporterId, reportedId, reason, details || null, reporterIp]
  );

  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT reporter_id)::int AS reporters, COUNT(DISTINCT reporter_ip)::int AS ips
     FROM reports
     WHERE reported_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [reportedId]
  );

  const { reporters, ips } = rows[0];
  if (reporters >= BAN_REPORT_THRESHOLD && ips >= BAN_REPORT_THRESHOLD && !(await getBanExpiry(reportedId))) {
    return banUser(reportedId);
  }
  return null;
}

module.exports = {
  REPORT_REASONS,
  hydrateSafetyState,
  blockUser,
  fileReport,
  getBanExpiry
};
