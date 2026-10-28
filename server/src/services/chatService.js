const crypto = require('crypto');
const db = require('../config/db');

/**
 * Delivers a chat message in real time, then persists it while enforcing the
 * 30-message ephemeral limit per conversation pair. Persistence happens after
 * delivery so a slow or unavailable database never blocks live chat.
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

  const message = {
    id: crypto.randomUUID(),
    sender_id: senderId,
    recipient_id: recipientId,
    body,
    created_at: new Date().toISOString()
  };

  // 1. Deliver to every socket the recipient has open, and echo back to sender
  if (direct) {
    io.to(`user:${recipientId}`).to(`user:${senderId}`).emit('direct_message', message);
  } else {
    io.to(`user:${recipientId}`).emit('receive_message', message);
    socket.emit('message_sent', message);
  }

  try {
    // 2. Persist message to PostgreSQL
    await db.query(
      `INSERT INTO messages (id, sender_id, recipient_id, body, created_at, is_read)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [message.id, senderId, recipientId, body, message.created_at, !direct]
    );

    // 3. Enforce ephemeral retention cap (Keep only last 30 messages between these two users)
    await db.query(
      `DELETE FROM messages
       WHERE id NOT IN (
         SELECT id FROM messages
         WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
         ORDER BY created_at DESC
         LIMIT 30
       )
       AND ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))`,
      [senderId, recipientId]
    );
  } catch (err) {
    console.error('[Chat Error] Failed to persist message:', err.message);
  }
}

module.exports = { saveAndDeliverMessage };
