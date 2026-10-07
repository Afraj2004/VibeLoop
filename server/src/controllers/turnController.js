const crypto = require('crypto');

/**
 * GET /api/ice-servers
 * Returns ephemeral STUN & TURN credentials with HMAC-SHA1 verification
 */
exports.getIceServers = (req, res) => {
  const turnSecret = process.env.TURN_SECRET;
  const ttlSeconds = parseInt(process.env.TURN_TTL || '3600', 10); // 1 hour

  const stunUrls = (
    process.env.STUN_URLS ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'
  ).split(',');

  const iceServers = [{ urls: stunUrls }];

  // Without a configured secret, serve STUN only rather than credentials signed with a known default
  if (!turnSecret) {
    return res.json({ success: true, iceServers, ttl: ttlSeconds, turnEnabled: false });
  }

  // Ephemeral username formatted as: UNIX_EXPIRATION_TIMESTAMP:USER_ID
  const expirationTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expirationTimestamp}:${req.user.id}`;

  // HMAC-SHA1 signature using TURN_SECRET
  const hmac = crypto.createHmac('sha1', turnSecret);
  hmac.update(username);
  const credential = hmac.digest('base64');

  const turnUrls = (
    process.env.TURN_URLS ||
    'turn:turn.vibeloop.app:3478?transport=udp,turn:turn.vibeloop.app:3478?transport=tcp'
  ).split(',');

  iceServers.push({
    urls: turnUrls,
    username: username,
    credential: credential
  });

  return res.json({
    success: true,
    iceServers,
    ttl: ttlSeconds,
    turnEnabled: true,
    expiresAt: new Date(expirationTimestamp * 1000).toISOString()
  });
};
