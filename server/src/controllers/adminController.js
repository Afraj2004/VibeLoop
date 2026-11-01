const db = require('../config/db');
const moderation = require('../services/moderation');

const { isId } = require('../config/ids');

const BAN_DURATIONS = {
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  permanent: 100 * 365 * 24 * 60 * 60
};

async function closeOpenReports(userId, adminId) {
  await db.query(
    'UPDATE reports SET reviewed_at = NOW(), reviewed_by = $2 WHERE reported_id = $1 AND reviewed_at IS NULL',
    [userId, adminId]
  );
}

async function logAction(adminId, userId, action, details = {}) {
  await db.query(
    'INSERT INTO moderation_actions (admin_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
    [adminId, userId, action, details]
  );
}

function validUserId(req, res) {
  if (!isId(req.params.id)) {
    res.status(400).json({ success: false, error: 'Invalid user id' });
    return false;
  }
  return true;
}

/**
 * GET /api/admin/reports
 * Users with unreviewed reports, most recently reported first, with every open report
 */
exports.listReportedUsers = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.is_guest, u.banned_until, u.created_at,
              COUNT(r.id)::int AS open_reports,
              COUNT(DISTINCT r.reporter_id)::int AS distinct_reporters,
              MAX(r.created_at) AS last_reported_at,
              json_agg(json_build_object(
                'reason', r.reason,
                'details', r.details,
                'createdAt', r.created_at,
                'reporter', rep.username
              ) ORDER BY r.created_at DESC) AS reports
       FROM reports r
       JOIN users u ON u.id = r.reported_id
       LEFT JOIN users rep ON rep.id = r.reporter_id
       WHERE r.reviewed_at IS NULL
       GROUP BY u.id
       ORDER BY MAX(r.created_at) DESC
       LIMIT 50`
    );
    res.json({ success: true, users: rows });
  } catch (err) {
    console.error('Admin Reports Error:', err);
    res.status(500).json({ success: false, error: 'Server error loading reports' });
  }
};

/**
 * POST /api/admin/users/:id/ban  { duration: '24h' | '7d' | '30d' | 'permanent' }
 */
exports.banUser = async (req, res) => {
  if (!validUserId(req, res)) return;
  const seconds = BAN_DURATIONS[req.body.duration];
  if (!seconds) {
    return res.status(400).json({ success: false, error: 'Invalid ban duration' });
  }

  try {
    const bannedUntil = await moderation.banUser(req.params.id, seconds);
    req.app.get('signaling')?.enforceSuspension(req.params.id, bannedUntil);
    await closeOpenReports(req.params.id, req.user.id);
    await logAction(req.user.id, req.params.id, 'ban', { duration: req.body.duration });
    res.json({ success: true, bannedUntil });
  } catch (err) {
    console.error('Admin Ban Error:', err);
    res.status(500).json({ success: false, error: 'Server error banning user' });
  }
};

/**
 * POST /api/admin/users/:id/unban
 */
exports.unbanUser = async (req, res) => {
  if (!validUserId(req, res)) return;
  try {
    await moderation.unbanUser(req.params.id);
    await logAction(req.user.id, req.params.id, 'unban');
    res.json({ success: true });
  } catch (err) {
    console.error('Admin Unban Error:', err);
    res.status(500).json({ success: false, error: 'Server error unbanning user' });
  }
};

/**
 * POST /api/admin/users/:id/dismiss — reviewed, no action needed
 */
exports.dismissReports = async (req, res) => {
  if (!validUserId(req, res)) return;
  try {
    await closeOpenReports(req.params.id, req.user.id);
    await logAction(req.user.id, req.params.id, 'dismiss');
    res.json({ success: true });
  } catch (err) {
    console.error('Admin Dismiss Error:', err);
    res.status(500).json({ success: false, error: 'Server error dismissing reports' });
  }
};

// Growth numbers are grouped by India calendar day
const DAY = (column) => `(${column} AT TIME ZONE 'Asia/Kolkata')::date`;
const STATS_DAYS = 14;

/**
 * GET /api/admin/stats
 * Daily growth numbers for the last STATS_DAYS days (newest first) plus all-time totals.
 * match_history has one row per person per call, so calls are rows / 2.
 */
exports.getStats = async (req, res) => {
  try {
    const [daily, totals] = await Promise.all([
      db.query(
        `WITH days AS (
           SELECT generate_series(${DAY('NOW()')} - ($1::int - 1), ${DAY('NOW()')}, INTERVAL '1 day')::date AS day
         )
         SELECT d.day,
           (SELECT COUNT(*) FROM users u WHERE ${DAY('u.created_at')} = d.day)::int AS new_visitors,
           (SELECT COUNT(*) FROM users u WHERE ${DAY('u.email_verified_at')} = d.day)::int AS new_accounts,
           (SELECT COUNT(DISTINCT m.user_id) FROM match_history m WHERE ${DAY('m.created_at')} = d.day)::int AS active_users,
           (SELECT COUNT(*) / 2 FROM match_history m WHERE ${DAY('m.created_at')} = d.day)::int AS calls,
           (SELECT ROUND(AVG(m.duration_seconds)) FROM match_history m WHERE ${DAY('m.created_at')} = d.day)::int AS avg_call_seconds,
           (SELECT COUNT(DISTINCT a.user_id) FROM match_history a
            WHERE ${DAY('a.created_at')} = d.day AND EXISTS (
              SELECT 1 FROM match_history b WHERE b.user_id = a.user_id AND ${DAY('b.created_at')} = d.day + 1
            ))::int AS returned_next_day,
           (SELECT COUNT(*) FROM like_events l WHERE ${DAY('l.created_at')} = d.day)::int AS likes,
           (SELECT COUNT(*) FROM users u WHERE ${DAY('u.referral_rewarded_at')} = d.day)::int AS invites_paid,
           (SELECT COALESCE(SUM(p.amount_paise), 0) FROM payments p
            WHERE p.status = 'paid' AND ${DAY('p.paid_at')} = d.day)::int AS revenue_paise
         FROM days d ORDER BY d.day DESC`,
        [STATS_DAYS]
      ),
      db.query(
        `SELECT COUNT(*) FILTER (WHERE NOT is_guest AND email_verified_at IS NOT NULL)::int AS accounts,
                COUNT(*) FILTER (WHERE is_guest)::int AS guests,
                COUNT(*) FILTER (WHERE referred_by IS NOT NULL AND email_verified_at IS NOT NULL)::int AS invited_accounts,
                (SELECT COUNT(*) / 2 FROM match_history)::int AS calls,
                (SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE status = 'paid')::int AS revenue_paise
         FROM users`
      )
    ]);
    res.json({ success: true, days: daily.rows, totals: totals.rows[0] });
  } catch (err) {
    console.error('Admin Stats Error:', err);
    res.status(500).json({ success: false, error: 'Server error loading stats' });
  }
};
