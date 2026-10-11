const bcrypt = require('bcryptjs');
const db = require('../config/db');
const redis = require('../config/redis');
const history = require('../services/history');

/**
 * GET /api/account/export
 * Everything VibeLoop stores about the requesting user, as a downloadable JSON file
 */
exports.exportData = async (req, res) => {
  const userId = req.user.id;

  try {
    const [profile, transactions, matches, messages, reportsFiled, blocks, recentContacts] = await Promise.all([
      db.query(
        `SELECT id, username, email, gender, country_code, is_guest, vibe_balance, earned_balance,
                daily_earned_tokens, last_earned_date, age_confirmed_at, terms_accepted_at,
                terms_version, banned_until, created_at
         FROM users WHERE id = $1`,
        [userId]
      ),
      db.query(
        `SELECT amount, transaction_type, metadata, created_at
         FROM token_transactions WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      ),
      db.query(
        `SELECT p.username AS peer_username, mh.duration_seconds, mh.created_at
         FROM match_history mh LEFT JOIN users p ON p.id = mh.peer_id
         WHERE mh.user_id = $1 ORDER BY mh.created_at DESC`,
        [userId]
      ),
      db.query(
        `SELECT m.sender_id = $1 AS sent_by_you, o.username AS other_party, m.body, m.created_at
         FROM messages m
         LEFT JOIN users o ON o.id = CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END
         WHERE m.sender_id = $1 OR m.recipient_id = $1
         ORDER BY m.created_at DESC`,
        [userId]
      ),
      db.query(
        `SELECT ru.username AS reported_username, r.reason, r.details, r.created_at
         FROM reports r LEFT JOIN users ru ON ru.id = r.reported_id
         WHERE r.reporter_id = $1 ORDER BY r.created_at DESC`,
        [userId]
      ),
      db.query(
        `SELECT u.username AS blocked_username, b.created_at
         FROM blocks b LEFT JOIN users u ON u.id = b.blocked_id
         WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
        [userId]
      ),
      history.getHistory(userId)
    ]);

    if (!profile.rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const date = new Date().toISOString().slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="vibeloop-data-${date}.json"`);
    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      notes: 'Video and audio are sent directly between participants and are never recorded or stored by VibeLoop.',
      profile: profile.rows[0],
      transactions: transactions.rows,
      matchHistory: matches.rows,
      recentContacts,
      messages: messages.rows,
      reportsYouFiled: reportsFiled.rows,
      usersYouBlocked: blocks.rows
    });
  } catch (err) {
    console.error('Data Export Error:', err);
    res.status(500).json({ success: false, error: 'Server error exporting your data' });
  }
};

/**
 * DELETE /api/account  { confirm: 'DELETE', password? }
 * Permanently erases the account. Registered accounts must re-enter their password.
 */
exports.deleteAccount = async (req, res) => {
  const userId = req.user.id;
  const { confirm, password } = req.body || {};

  if (confirm !== 'DELETE') {
    return res.status(400).json({ success: false, error: 'Type DELETE to confirm' });
  }

  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const passwordHash = rows[0].password_hash;
    if (passwordHash && !(typeof password === 'string' && await bcrypt.compare(password, passwordHash))) {
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    // End any live call first so nothing new gets recorded against the account
    req.app.get('signaling')?.disconnectUser(userId);

    // Remove this user from other people's recent-contact strips
    const peers = await db.query('SELECT DISTINCT user_id FROM match_history WHERE peer_id = $1', [userId]);
    await Promise.all(peers.rows.map((row) => history.removeEntry(row.user_id, userId)));

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    await history.clearHistory(userId);
    await redis.del(
      `blocks:${userId}`,
      `ban:${userId}`,
      `m2e:${userId}:${today.toISOString().slice(0, 10)}`,
      `m2e:${userId}:${yesterday.toISOString().slice(0, 10)}`
    );

    // Reports this user filed are kept for safety review, but without anything identifying them
    await db.query('UPDATE reports SET reporter_ip = NULL WHERE reporter_id = $1', [userId]);

    // Cascades to wallet ledger, match history, messages and blocks (see schema.sql)
    await db.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Account Deletion Error:', err);
    res.status(500).json({ success: false, error: 'Server error deleting your account' });
  }
};
