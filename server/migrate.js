const fs = require('fs');
const path = require('path');
const db = require('./src/config/db');

async function runMigration() {
  try {
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('[Migration] Running database schema setup...');
    await db.query(schemaSql);
    console.log('[Migration] ✅ All tables created successfully in Supabase!');
    process.exit(0);
  } catch (err) {
    console.error('[Migration] ❌ Failed to run migration:', err);
    process.exit(1);
  }
}

runMigration();