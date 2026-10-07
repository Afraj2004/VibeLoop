const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3
});

redis.on('connect', () => {
  console.log('[VibeLoop Redis] Connected');
});

redis.on('error', (err) => {
  console.error('[VibeLoop Redis] Connection error:', err.message);
});

module.exports = redis;
