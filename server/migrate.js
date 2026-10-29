const fs = require('fs');
const path = require('path');
const db = require('./src/config/db');

const DATABASE_DIR = path.join(__dirname, '../database');

async function usersIdType(client) {
  const { rows } = await client.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'`
  );
  return rows[0]?.data_type || null;
}

/**
 * Runs database/migrations/*.sql (one-off conversions, each a no-op once applied) and then
 * schema.sql, all in one transaction: if anything fails, the database is left untouched.
 */
async function runMigration() {
  const migrationsDir = path.join(DATABASE_DIR, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const client = await db.pool.connect();

  try {
    const typeBefore = await usersIdType(client);
    client.on('notice', (msg) => console.log(`[Migration] ${msg.message}`));

    await client.query('BEGIN');
    for (const file of files) {
      console.log(`[Migration] Running migrations/${file}...`);
      await client.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    }
    console.log('[Migration] Running schema.sql...');
    await client.query(fs.readFileSync(path.join(DATABASE_DIR, 'schema.sql'), 'utf8'));
    await client.query('COMMIT');
    console.log('[Migration] ✅ Database schema is up to date');

    // Redis still holds the old UUIDs (queues, recent contacts, rate limits); start it fresh
    if (typeBefore === 'uuid' && (await usersIdType(client)) === 'bigint') {
      const redis = require('./src/config/redis');
      await redis.flushdb();
      console.log('[Migration] Cleared Redis: it held the old UUID keys. Bans, blocks and boosts reload from the database.');
      redis.disconnect();
    }
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Migration] ❌ Failed, nothing was changed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration();
