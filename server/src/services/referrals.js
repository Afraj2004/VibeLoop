const crypto = require('crypto');
const db = require('../config/db');
const { REFERRAL } = require('../config/economy');

// Easy to read aloud or type: no 0/O, 1/I/L
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;
const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);
const UNIQUE_VIOLATION = '23505';

function newCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

/**
 * A submitted invite code in canonical form, or null if it can't be one
 */
function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

// SQL for "the registered account that owns invite code $n" (NULL when unknown)
const inviterBy = (param) => `(SELECT r.id FROM users r WHERE r.referral_code = ${param} AND NOT r.is_guest)`;

/**
 * The user's invite code, created on first use. Registered accounts only (null for guests).
 */
async function getOrCreateCode(userId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { rows } = await db.query(
        `UPDATE users SET referral_code = COALESCE(referral_code, $2)
         WHERE id = $1 AND is_guest = FALSE RETURNING referral_code`,
        [userId, newCode()]
      );
      return rows[0]?.referral_code || null;
    } catch (err) {
      // Another account already has that code: try a new one
      if (err.code !== UNIQUE_VIOLATION) throw err;
    }
  }
  throw new Error('Could not create an invite code');
}

/**
 * How the user's invites are doing: accounts that joined with their code, and how many paid out
 */
async function getStats(userId) {
  const { rows } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE is_guest = FALSE AND email_verified_at IS NOT NULL)::int AS joined,
            COUNT(*) FILTER (WHERE referral_rewarded_at IS NOT NULL)::int AS rewarded
     FROM users WHERE referred_by = $1`,
    [userId]
  );
  return rows[0];
}

/**
 * Pays an invite once the invited person has a verified account and has spent REFERRAL.QUALIFY_CALL_SECONDS
 * in calls with people other than their inviter (so two friends can't farm it together). Both sides are
 * credited, each with a ledger row; an inviter is paid for at most REFERRAL.MONTHLY_CAP invites per 30 days.
 * Safe to call any time (e.g. after every call): it pays at most once per invited account.
 * Returns { inviteeId, inviteeBalance, inviterId, inviterBalance, inviteeUsername } when it paid, else null.
 */
async function maybeReward(userId) {
  const { rows } = await db.query(
    `WITH target AS (
       SELECT u.id, u.referred_by FROM users u
       JOIN users inviter ON inviter.id = u.referred_by AND inviter.is_guest = FALSE
       WHERE u.id = $1 AND u.referral_rewarded_at IS NULL
         AND u.is_guest = FALSE AND u.email_verified_at IS NOT NULL
         AND (SELECT COALESCE(SUM(m.duration_seconds), 0) FROM match_history m
              WHERE m.user_id = u.id AND m.peer_id IS DISTINCT FROM u.referred_by) >= $4
         AND (SELECT COUNT(*) FROM users r
              WHERE r.referred_by = u.referred_by AND r.referral_rewarded_at > NOW() - INTERVAL '30 days') < $5
     ), invitee AS (
       UPDATE users SET referral_rewarded_at = NOW(), vibe_balance = vibe_balance + $2
       WHERE id IN (SELECT id FROM target) AND referral_rewarded_at IS NULL
       RETURNING id, referred_by, vibe_balance, username
     ), inviter AS (
       UPDATE users SET vibe_balance = vibe_balance + $3
       WHERE id IN (SELECT referred_by FROM invitee)
       RETURNING id, vibe_balance
     ), ledger AS (
       INSERT INTO token_transactions (user_id, amount, transaction_type, metadata)
       SELECT id, $2, 'REFERRAL_JOINED', jsonb_build_object('inviterId', referred_by) FROM invitee
       UNION ALL
       SELECT referred_by, $3, 'REFERRAL_REWARD', jsonb_build_object('inviteeId', id) FROM invitee
     )
     SELECT i.id AS invitee_id, i.vibe_balance AS invitee_balance, i.username AS invitee_username,
            r.id AS inviter_id, r.vibe_balance AS inviter_balance
     FROM invitee i JOIN inviter r ON r.id = i.referred_by`,
    [userId, REFERRAL.INVITEE, REFERRAL.INVITER, REFERRAL.QUALIFY_CALL_SECONDS, REFERRAL.MONTHLY_CAP]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    inviteeId: String(row.invitee_id),
    inviteeBalance: Number(row.invitee_balance),
    inviteeUsername: row.invitee_username,
    inviterId: String(row.inviter_id),
    inviterBalance: Number(row.inviter_balance)
  };
}

/**
 * Pays any invites that just qualified and tells both people over their sockets
 */
async function rewardAndNotify(io, userIds) {
  for (const userId of userIds) {
    const paid = await maybeReward(userId);
    if (!paid || !io) continue;
    io.to(`user:${paid.inviteeId}`).emit('wallet_updated', { balance: paid.inviteeBalance });
    io.to(`user:${paid.inviteeId}`).emit('referral_reward', { amount: REFERRAL.INVITEE, role: 'invitee' });
    io.to(`user:${paid.inviterId}`).emit('wallet_updated', { balance: paid.inviterBalance });
    io.to(`user:${paid.inviterId}`).emit('referral_reward', {
      amount: REFERRAL.INVITER, role: 'inviter', friend: paid.inviteeUsername
    });
  }
}

module.exports = { normalizeCode, inviterBy, getOrCreateCode, getStats, maybeReward, rewardAndNotify };
