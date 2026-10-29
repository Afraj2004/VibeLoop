const db = require('../config/db');
const friends = require('../services/friends');

const { isId } = require('../config/ids');
const MESSAGE_LIMIT = 30;


// Tells every open tab of a user that their friends list changed
function notify(req, userId, payload = {}) {
  req.app?.get?.('io')?.to(`user:${userId}`).emit('friends_updated', payload);
}

function isOnline(req, userId) {
  return Boolean(req.app?.get?.('signaling')?.isOnline(userId));
}

function requireAccount(req, res) {
  if (req.user.isGuest) {
    res.status(403).json({ success: false, error: 'Create an account to add friends' });
    return false;
  }
  return true;
}

function requireUuid(req, res) {
  if (!isId(req.params.id)) {
    res.status(404).json({ success: false, error: 'Not found' });
    return false;
  }
  return true;
}

/**
 * GET /api/friends
 * Accepted friends (with presence and unread counts) plus incoming and outgoing requests
 */
exports.list = async (req, res) => {
  const me = req.user.id;
  try {
    const { rows } = await db.query(
      `SELECT f.status, f.requester_id = $1 AS outgoing, COALESCE(f.accepted_at, f.created_at) AS since,
              u.id, u.username, u.country_code, u.avatar_key,
              (SELECT COUNT(*) FROM messages m
               WHERE m.sender_id = u.id AND m.recipient_id = $1 AND NOT m.is_read)::int AS unread
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       WHERE f.requester_id = $1 OR f.addressee_id = $1
       ORDER BY since DESC`,
      [me]
    );

    const toCard = (row) => ({
      id: row.id,
      username: row.username,
      country: row.country_code,
      avatarKey: row.avatar_key,
      since: row.since
    });

    res.json({
      success: true,
      friends: rows
        .filter((r) => r.status === 'accepted')
        .map((r) => ({ ...toCard(r), online: isOnline(req, r.id), unread: r.unread })),
      incoming: rows.filter((r) => r.status === 'pending' && !r.outgoing).map(toCard),
      outgoing: rows.filter((r) => r.status === 'pending' && r.outgoing).map(toCard)
    });
  } catch (err) {
    console.error('Friends List Error:', err);
    res.status(500).json({ success: false, error: 'Server error fetching friends' });
  }
};

/**
 * POST /api/friends/requests  { userId } or { username }
 * If they already asked you, this accepts their request instead.
 */
exports.sendRequest = async (req, res) => {
  if (!requireAccount(req, res)) return;
  const me = req.user.id;
  const { userId, username } = req.body || {};

  let lookup;
  if (isId(userId)) {
    lookup = ['SELECT id, username, is_guest FROM users WHERE id = $1', [String(userId)]];
  } else if (typeof username === 'string' && username.trim()) {
    lookup = ['SELECT id, username, is_guest FROM users WHERE LOWER(username) = LOWER($1)', [username.trim().slice(0, 32)]];
  } else {
    return res.status(400).json({ success: false, error: 'Enter a username' });
  }

  try {
    const target = (await db.query(...lookup)).rows[0];
    if (!target) {
      return res.status(404).json({ success: false, error: 'No one has that username' });
    }
    if (String(target.id) === String(me)) {
      return res.status(400).json({ success: false, error: "You can't add yourself" });
    }
    if (target.is_guest) {
      return res.status(400).json({ success: false, error: `${target.username} needs to create an account before you can add them` });
    }

    const blocked = await db.query(
      `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [me, target.id]
    );
    if (blocked.rows.length > 0) {
      return res.status(403).json({ success: false, error: "You can't add this user" });
    }

    const existing = await friends.getFriendship(me, target.id);
    if (existing?.status === 'accepted') {
      return res.status(409).json({ success: false, error: `You and ${target.username} are already friends` });
    }
    if (existing && String(existing.requester_id) === String(me)) {
      return res.status(409).json({ success: false, error: `You already sent ${target.username} a request` });
    }

    if (existing) {
      await db.query(
        `UPDATE friendships SET status = 'accepted', accepted_at = NOW()
         WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`,
        [target.id, me]
      );
      notify(req, target.id, { type: 'accepted', by: { id: me, username: req.user.username } });
      notify(req, me);
      return res.json({ success: true, status: 'accepted', friend: { id: target.id, username: target.username } });
    }

    // The pair index rejects a request racing one in the other direction
    const inserted = await db.query(
      `INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [me, target.id]
    );
    if (inserted.rowCount === 0) {
      return res.status(409).json({ success: false, error: 'A request between you already exists' });
    }

    notify(req, target.id, { type: 'request', from: { id: me, username: req.user.username } });
    notify(req, me);
    res.status(201).json({ success: true, status: 'pending', friend: { id: target.id, username: target.username } });
  } catch (err) {
    console.error('Friend Request Error:', err);
    res.status(500).json({ success: false, error: 'Server error sending friend request' });
  }
};

/**
 * POST /api/friends/:id/accept  (accept the request :id sent you)
 */
exports.accept = async (req, res) => {
  if (!requireAccount(req, res) || !requireUuid(req, res)) return;
  const me = req.user.id;
  try {
    const { rowCount } = await db.query(
      `UPDATE friendships SET status = 'accepted', accepted_at = NOW()
       WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`,
      [req.params.id, me]
    );
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'That request no longer exists' });
    }
    notify(req, req.params.id, { type: 'accepted', by: { id: me, username: req.user.username } });
    notify(req, me);
    res.json({ success: true });
  } catch (err) {
    console.error('Friend Accept Error:', err);
    res.status(500).json({ success: false, error: 'Server error accepting request' });
  }
};

/**
 * DELETE /api/friends/:id  (unfriend, decline their request, or cancel yours)
 */
exports.remove = async (req, res) => {
  if (!requireUuid(req, res)) return;
  try {
    const removed = await friends.removeFriendship(req.user.id, req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    notify(req, req.params.id);
    notify(req, req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Friend Remove Error:', err);
    res.status(500).json({ success: false, error: 'Server error removing friend' });
  }
};

/**
 * GET /api/friends/:id/messages
 * The conversation so far (the newest 30 are kept), oldest first. Marks their messages read.
 */
exports.messages = async (req, res) => {
  if (!requireUuid(req, res)) return;
  const me = req.user.id;
  try {
    if (!(await friends.areFriends(me, req.params.id))) {
      return res.status(403).json({ success: false, error: 'You can only message friends' });
    }

    const { rows } = await db.query(
      `SELECT id, sender_id, recipient_id, body, created_at FROM messages
       WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
       ORDER BY created_at DESC LIMIT ${MESSAGE_LIMIT}`,
      [me, req.params.id]
    );
    await db.query(
      'UPDATE messages SET is_read = TRUE WHERE sender_id = $1 AND recipient_id = $2 AND NOT is_read',
      [req.params.id, me]
    );

    res.json({ success: true, messages: rows.reverse() });
  } catch (err) {
    console.error('Friend Messages Error:', err);
    res.status(500).json({ success: false, error: 'Server error fetching messages' });
  }
};

/**
 * POST /api/friends/:id/read  (a message arrived while the conversation was open)
 */
exports.markRead = async (req, res) => {
  if (!requireUuid(req, res)) return;
  try {
    await db.query(
      'UPDATE messages SET is_read = TRUE WHERE sender_id = $1 AND recipient_id = $2 AND NOT is_read',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Friend Read Error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
