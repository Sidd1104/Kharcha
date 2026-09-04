const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const { pool } = require('../src/db');

const BASE_URL = 'http://localhost:4000';
const JWT_SECRET = process.env.JWT_SECRET || 'kharcha_dev_secret';

async function testPhase3() {
  console.log('🧪 Starting Phase 3 Group Creation Verification...');

  // 1. Create test user
  const client = await pool.connect();
  let user;
  try {
    const userRes = await client.query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Creator User', $1, 'dummyhash') RETURNING id, name, email",
      [`creator_${Date.now()}@test.com`]
    );
    user = userRes.rows[0];
  } finally {
    client.release();
  }

  const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET);

  // 2. Call POST /groups with name and guests
  const createRes = await fetch(`${BASE_URL}/groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Weekend Getaway',
      icon: 'car',
      guests: ['Alice', 'Bob'],
      inviteEmails: ['should_be_ignored@test.com'], // confirm this is ignored
    }),
  });

  if (createRes.status !== 201) {
    const errBody = await createRes.text();
    throw new Error(`FAIL: Expected 201, got ${createRes.status}: ${errBody}`);
  }

  const data = await createRes.json();
  const group = data.group;
  console.log('   Group created via API:', group.id, group.name);
  console.log('   Returned join_code:', group.join_code);

  if (!group.join_code || !/^\d{6}$/.test(group.join_code)) {
    throw new Error(`FAIL: Invalid join_code returned: ${group.join_code}`);
  }

  // 3. Verify in database
  const dbGroup = await pool.query('SELECT * FROM groups WHERE id = $1', [group.id]);
  if (dbGroup.rows[0].join_code !== group.join_code) {
    throw new Error('FAIL: DB join_code does not match returned join_code');
  }

  // Verify participants
  const participants = await pool.query('SELECT * FROM group_participants WHERE group_id = $1 ORDER BY id ASC', [group.id]);
  console.log('   Participants count:', participants.rows.length);
  if (participants.rows.length !== 3) {
    throw new Error(`FAIL: Expected 3 participants (creator + 2 guests), got ${participants.rows.length}`);
  }

  // Verify group_invites has 0 records
  const invites = await pool.query('SELECT * FROM group_invites WHERE group_id = $1', [group.id]);
  if (invites.rows.length !== 0) {
    throw new Error(`FAIL: Expected 0 invites, got ${invites.rows.length}`);
  }
  console.log('   Confirmed 0 email invites created (email invite path successfully removed).');

  // Cleanup
  await pool.query('DELETE FROM groups WHERE id = $1', [group.id]);
  await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
  console.log('   Cleaned up test group and user.');

  console.log('🎉 Phase 3 Group Creation Verification PASSED!');
  process.exit(0);
}

testPhase3().catch((err) => {
  console.error('❌ Phase 3 test failed:', err);
  process.exit(1);
});
