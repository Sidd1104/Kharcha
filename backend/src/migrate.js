const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();
const fs = require('fs');
const { pool } = require('./db');

async function migrate() {
  const sqlPath = path.join(__dirname, '..', 'migrations', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Migration complete — all tables created.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
