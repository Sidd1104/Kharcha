const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const { pool } = require('../src/db');

const BASE_URL = 'http://localhost:4000';
const JWT_SECRET = process.env.JWT_SECRET || 'kharcha_dev_secret';

async function runRegressionTest() {
  console.log('🧪 Starting Phase 0 Authorization Hole Regression Test...');

  // 1. Ensure test users exist in DB
  const client = await pool.connect();
  let userA, userB, group;

  try {
    await client.query('BEGIN');

    // Create User A
    const resA = await client.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('User A', 'usera_${Date.now()}@test.com', 'dummyhash')
       RETURNING id, name, email`
    );
    userA = resA.rows[0];

    // Create User B (not in group)
    const resB = await client.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('User B', 'userb_${Date.now()}@test.com', 'dummyhash')
       RETURNING id, name, email`
    );
    userB = resB.rows[0];

    // Create Group owned by User A
    const resGroup = await client.query(
      `INSERT INTO groups (name, created_by)
       VALUES ('Secret Group A', $1)
       RETURNING id, name`,
      [userA.id]
    );
    group = resGroup.rows[0];

    // Add User A as active participant
    const resPart = await client.query(
      `INSERT INTO group_participants (group_id, user_id, status)
       VALUES ($1, $2, 'active')
       RETURNING id`,
      [group.id, userA.id]
    );
    const partA = resPart.rows[0];

    // Add a dummy expense in the group
    await client.query(
      `INSERT INTO expenses (group_id, paid_by, amount, description)
       VALUES ($1, $2, 500, 'Confidential Expense')`,
      [group.id, partA.id]
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const tokenA = jwt.sign({ userId: userA.id, email: userA.email, name: userA.name }, JWT_SECRET);
  const tokenB = jwt.sign({ userId: userB.id, email: userB.email, name: userB.name }, JWT_SECRET);

  const endpoints = [
    { name: 'GET group detail', path: `/groups/${group.id}` },
    { name: 'GET expenses', path: `/groups/${group.id}/expenses` },
    { name: 'GET balances', path: `/groups/${group.id}/balances` },
    { name: 'GET settlements', path: `/groups/${group.id}/settlements` },
  ];

  console.log(`\n🔒 Testing User B (non-member) against Group ${group.id}:`);
  for (const ep of endpoints) {
    const res = await fetch(`${BASE_URL}${ep.path}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    console.log(`   ${ep.name} -> HTTP ${res.status}`);
    if (res.status !== 403) {
      throw new Error(`FAIL: Expected HTTP 403 for non-member on ${ep.path}, got ${res.status}`);
    }
  }

  console.log('\n🔍 Testing non-existent group 999999 with User B:');
  const res404 = await fetch(`${BASE_URL}/groups/999999`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  console.log(`   GET /groups/999999 -> HTTP ${res404.status}`);
  if (res404.status !== 404) {
    throw new Error(`FAIL: Expected HTTP 404 for missing group, got ${res404.status}`);
  }

  console.log(`\n✅ Testing User A (active member) against Group ${group.id}:`);
  for (const ep of endpoints) {
    const res = await fetch(`${BASE_URL}${ep.path}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.log(`   ${ep.name} -> HTTP ${res.status}`);
    if (res.status !== 200) {
      throw new Error(`FAIL: Expected HTTP 200 for member on ${ep.path}, got ${res.status}`);
    }
  }

  // Cleanup test group & users
  await pool.query('DELETE FROM groups WHERE id = $1', [group.id]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [userA.id, userB.id]);
  console.log('\n🧹 Test data cleaned up.');
  console.log('🎉 Phase 0 Regression Test PASSED: Authorization hole is fully patched!');
  process.exit(0);
}

runRegressionTest().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
