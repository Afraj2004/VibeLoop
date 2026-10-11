const db = require('../config/db');
const moderation = require('../services/moderation');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!UUID_PATTERN.test(req.params.id)) {
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
