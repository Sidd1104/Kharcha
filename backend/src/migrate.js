const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();
const fs = require('fs');
const { pool } = require('./db');

async function migrate() {
  const sqlPath = path.join(__dirname, '..', 'migrations', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    // Pre-migration validation: verify no active duplicate join codes exist
    try {
      const activeDupes = await pool.query(`
        SELECT join_code, COUNT(*) as count 
        FROM groups 
        WHERE (join_code_active = true OR join_code_active = 1) AND join_code IS NOT NULL 
        GROUP BY join_code 
        HAVING COUNT(*) > 1
      `);
      if (activeDupes.rows && activeDupes.rows.length > 0) {
        throw new Error(`Migration blocked: Found duplicate active join codes: ${JSON.stringify(activeDupes.rows)}`);
      }

      const inactiveDupes = await pool.query(`
        SELECT join_code, COUNT(*) as count 
        FROM groups 
        WHERE (join_code_active = false OR join_code_active = 0) AND join_code IS NOT NULL 
        GROUP BY join_code 
        HAVING COUNT(*) > 1
      `);
      if (inactiveDupes.rows && inactiveDupes.rows.length > 0) {
        console.log(`ℹ Notice: Found ${inactiveDupes.rows.length} join code(s) shared across inactive groups (permitted by partial index).`);
      }
    } catch (checkErr) {
      // Table may not exist yet on a fresh database
      if (!checkErr.message.includes('relation "groups" does not exist') && !checkErr.message.includes('no such table')) {
        throw checkErr;
      }
    }

    await pool.query(sql);
    console.log('✅ Migration complete — all tables and partial indexes created.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
