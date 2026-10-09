const Redis = require('ioredis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Dashboards store values literally, so quotes copied from a .env file end up inside the URL
if (!/^rediss?:\/\//.test(redisUrl)) {
  console.error(
    '[VibeLoop Redis] REDIS_URL must start with redis:// or rediss:// (no surrounding quotes or CLI flags)'
  );
}

// Never write credentials to logs: hide anything between "//" and "@"
const redact = (text) => String(text).replace(/\/\/[^\s@/]*@/g, '//***@');

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3
});

redis.on('connect', () => {
  console.log('[VibeLoop Redis] Connected');
});

redis.on('error', (err) => {
  console.error('[VibeLoop Redis] Connection error:', redact(err.message));
});

module.exports = redis;
