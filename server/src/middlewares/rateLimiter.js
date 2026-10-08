const redis = require('../config/redis');

// Fixed-window counter: INCR and the window's EXPIRE happen atomically, so a key can never be left without a TTL
redis.defineCommand('rateLimitHit', {
  numberOfKeys: 1,
  lua: `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    return { count, redis.call('TTL', KEYS[1]) }
  `,
});

/**
 * Records one hit against `key`. Fails open if Redis is unavailable so an outage
 * degrades protection rather than locking every user out.
 */
async function consume(key, limit, windowSeconds) {
  try {
    const [count, ttl] = await redis.rateLimitHit(`ratelimit:${key}`, windowSeconds);
    return { allowed: count <= limit, retryAfter: Math.max(ttl, 1) };
  } catch (err) {
    console.error('[VibeLoop RateLimit] check failed, allowing request:', err.message);
    return { allowed: true, retryAfter: 0 };
  }
}

/**
 * Express middleware. `by: 'ip'` for unauthenticated routes, `by: 'user'` after the auth middleware.
 */
function rateLimit({ name, limit, windowSeconds, by = 'ip' }) {
  return async (req, res, next) => {
    const subject = by === 'user' ? req.user?.id : req.ip;
    const { allowed, retryAfter } = await consume(`${name}:${subject}`, limit, windowSeconds);

    if (!allowed) {
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: `Too many requests. Try again in ${retryAfter}s.`
      });
    }
    next();
  };
}

module.exports = { consume, rateLimit };
