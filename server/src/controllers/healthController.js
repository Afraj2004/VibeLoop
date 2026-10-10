const db = require('../config/db');
const redis = require('../config/redis');

const CHECK_TIMEOUT_MS = 3000;

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), CHECK_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runCheck(label, probe) {
  try {
    await withTimeout(probe(), label);
    return 'ok';
  } catch (err) {
    console.error(`[VibeLoop Health] ${label} check failed:`, err.message);
    return 'down';
  }
}

/**
 * GET /health
 * Verifies the dependencies every user flow needs. 503 when any is down so
 * uptime monitors (and Render health checks, if enabled) notice outages.
 */
exports.getHealth = async (req, res) => {
  const [database, cache] = await Promise.all([
    runCheck('database', () => db.query('SELECT 1')),
    runCheck('redis', () => redis.ping())
  ]);

  const healthy = database === 'ok' && cache === 'ok';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks: { database, redis: cache },
    timestamp: new Date().toISOString()
  });
};
