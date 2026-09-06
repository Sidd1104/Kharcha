const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool } = require('../src/db');
const bcrypt = require('bcryptjs');

async function main() {
  const hash = await bcrypt.hash('password123', 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ('Alice Host', 'alice_demo@example.com', $1)
     ON CONFLICT (email) DO UPDATE SET password_hash = $1`,
    [hash]
  );
  await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ('Bob KeyUser', 'bob_demo@example.com', $1)
     ON CONFLICT (email) DO UPDATE SET password_hash = $1`,
    [hash]
  );
  console.log('Demo users ready:');
  console.log('User 1: alice_demo@example.com / password123');
  console.log('User 2: bob_demo@example.com / password123');
  await pool.end();
}

main().catch(console.error);
