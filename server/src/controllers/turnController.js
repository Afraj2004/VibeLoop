const crypto = require('crypto');

const CLOUDFLARE_TURN_API = 'https://rtc.live.cloudflare.com/v1/turn/keys';

const stunServers = () => ({
  urls: (
    process.env.STUN_URLS ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'
  ).split(',')
});

/**
 * Cloudflare Realtime TURN: exchanges the long-lived key for short-lived per-request credentials
 */
async function cloudflareIceServers(ttlSeconds) {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const response = await fetch(`${CLOUDFLARE_TURN_API}/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ttl: ttlSeconds }),
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error(`Cloudflare TURN responded ${response.status}`);
  }

  const { iceServers } = await response.json();

  // Browsers block port 53, so those URLs only add ICE timeouts
  return iceServers.map((server) => ({
    ...server,
    urls: [].concat(server.urls).filter((url) => !/:53(\?|$)/.test(url))
  }));
}

/**
 * Self-hosted coturn with use-auth-secret: HMAC-SHA1 over "expiry:userId"
 */
function coturnIceServers(ttlSeconds, userId) {
  const expirationTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expirationTimestamp}:${userId}`;
  const credential = crypto
    .createHmac('sha1', process.env.TURN_SECRET)
    .update(username)
    .digest('base64');

  const turnUrls = (
    process.env.TURN_URLS ||
    'turn:turn.vibeloop.app:3478?transport=udp,turn:turn.vibeloop.app:3478?transport=tcp'
  ).split(',');

  return [stunServers(), { urls: turnUrls, username, credential }];
}

/**
 * GET /api/ice-servers
 * Returns STUN plus short-lived TURN credentials from the first configured provider:
 * Cloudflare Realtime TURN, then self-hosted coturn, otherwise STUN only.
 */
exports.getIceServers = async (req, res) => {
  const ttlSeconds = parseInt(process.env.TURN_TTL || '3600', 10); // 1 hour
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  if (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) {
    try {
      const iceServers = await cloudflareIceServers(ttlSeconds);
      return res.json({ success: true, iceServers, ttl: ttlSeconds, turnProvider: 'cloudflare', expiresAt });
    } catch (err) {
      // Calls still connect on most networks with STUN alone, so degrade instead of failing
      console.error('[VibeLoop TURN] Cloudflare credential request failed:', err.message);
    }
  } else if (process.env.TURN_SECRET) {
    const iceServers = coturnIceServers(ttlSeconds, req.user.id);
    return res.json({ success: true, iceServers, ttl: ttlSeconds, turnProvider: 'coturn', expiresAt });
  }

  return res.json({ success: true, iceServers: [stunServers()], ttl: ttlSeconds, turnProvider: null });
};
