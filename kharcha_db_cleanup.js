// Run with: node kharcha_db_cleanup.js
// (or: DATABASE_URL="postgresql://neondb_owner:npg_5VLhXzCpvwu3@ep-misty-hall-ae8q6tto-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require" node kharcha_db_cleanup.js)
//
// Wipes ALL rows from every Kharcha table and resets auto-increment IDs
// back to 1. Does NOT drop tables/columns/indexes — schema stays intact.
//
// WARNING: this deletes everything — every test user, group, expense,
// and settlement. Only run this once you're sure you're done testing
// against this database.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });
const readline = require('readline');

let Client;
try {
  Client = require('pg').Client;
} catch (e) {
  Client = require(path.join(__dirname, 'backend/node_modules/pg')).Client;
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_5VLhXzCpvwu3@ep-misty-hall-ae8q6tto-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  if (!DATABASE_URL) {
    console.error('Set DATABASE_URL first.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM groups) AS groups,
      (SELECT COUNT(*) FROM expenses) AS expenses
  `);
  console.log('Current data in this database:', counts.rows[0]);
  const autoConfirm = process.argv.includes('--force') || process.argv.includes('-y');
  if (!autoConfirm) {
    const answer = await confirm(
      `\nThis will PERMANENTLY DELETE all rows above from ${DATABASE_URL.split('@')[1] || 'this database'}.\nType "yes" to continue: `
    );
    if (answer !== 'yes') {
      console.log('Aborted — nothing was deleted.');
      await client.end();
      return;
    }
  }

  // Order doesn't matter with TRUNCATE ... CASCADE, but list every table
  // explicitly so nothing is silently skipped if a table name changed.
  const tables = [
    'settlements',
    'expense_splits',
    'expenses',
    'group_invites',
    'group_participants',
    'groups',
    'users',
  ];

  await client.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
  console.log(`\nDone. Truncated: ${tables.join(', ')}`);

  const after = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM groups) AS groups,
      (SELECT COUNT(*) FROM expenses) AS expenses
  `);
  console.log('Row counts after cleanup:', after.rows[0]);

  await client.end();
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
