const crypto = require('crypto');
const db = require('../config/db');

const KEEP_PER_PAIR = 30;

/**
 * Saves a chat message (the database assigns its ID), delivers it in real time, then enforces
 * the 30-message ephemeral limit per conversation pair. If the database is unavailable the
 * message is still delivered, with a temporary ID, so live chat keeps working.
 *
 * `direct`: a message between friends outside a call. It goes out as 'direct_message' to every
 * tab of both people and stays unread until the recipient opens the conversation.
 */
async function saveAndDeliverMessage(io, socket, { recipientId, messageText, direct = false }) {
  const senderId = socket.data.user?.id;
  const body = typeof messageText === 'string' ? messageText.trim().substring(0, 500) : '';

  if (!senderId || !recipientId || !body) {
    return socket.emit('chat_error', { error: 'Invalid message payload' });
  }

  let message;
  let saved = false;
  try {
    // In-call messages are read live; friends' messages wait until the conversation is opened
    const { rows } = await db.query(
      `INSERT INTO messages (sender_id, recipient_id, body, is_read)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [senderId, recipientId, body, !direct]
    );
    message = { id: String(rows[0].id), created_at: new Date(rows[0].created_at).toISOString() };
    saved = true;
  } catch (err) {
    console.error('[Chat Error] Failed to persist message:', err.message);
    message = { id: `tmp-${crypto.randomUUID()}`, created_at: new Date().toISOString() };
  }
  message = { ...message, sender_id: senderId, recipient_id: String(recipientId), body };

  // Deliver to every socket the recipient has open, and echo back to sender
  if (direct) {
    io.to(`user:${recipientId}`).to(`user:${senderId}`).emit('direct_message', message);
  } else {
    io.to(`user:${recipientId}`).emit('receive_message', message);
    socket.emit('message_sent', message);
  }

  if (!saved) return;
  try {
    // Keep only the newest messages between these two users
    await db.query(
      `DELETE FROM messages
       WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
         AND id NOT IN (
           SELECT id FROM messages
           WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
           ORDER BY created_at DESC, id DESC
           LIMIT ${KEEP_PER_PAIR}
         )`,
      [senderId, recipientId]
    );
  } catch (err) {
    console.error('[Chat Error] Failed to trim messages:', err.message);
  }
}

module.exports = { saveAndDeliverMessage };
