const db = require('../config/db');

/**
 * Handles saving messages and enforcing the 30-message ephemeral limit per conversation pair
 */
async function saveAndDeliverMessage(io, socket, data) {
  const { recipientId, messageText } = data;
  const senderId = socket.user?.id;

  if (!senderId || !recipientId || !messageText) {
    return socket.emit('chat_error', { error: 'Invalid message payload' });
  }

  // Truncate message to max 500 chars as per schema
  const trimmedText = messageText.substring(0, 500);

  try {
    // 1. Insert message into PostgreSQL database
    const result = await db.query(
      `INSERT INTO messages (sender_id, recipient_id, body) 
       VALUES ($1, $2, $3) RETURNING id, sender_id, recipient_id, body, created_at`,
      [senderId, recipientId, trimmedText]
    );

    const message = result.rows[0];

    // 2. Enforce ephemeral retention cap (Keep only last 30 messages between these two users)
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

    // 3. Emit message to recipient if online, and echo back to sender
    io.to(recipientId).emit('receive_message', message);
    socket.emit('message_sent', message);

  } catch (err) {
    console.error('[Chat Error] Failed to save/deliver message:', err);
    socket.emit('chat_error', { error: 'Failed to send message' });
  }
}

module.exports = { saveAndDeliverMessage };
