const assert = require('assert');
const jwt = require('jsonwebtoken');
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { pool } = require('../src/db');

const BASE_URL = 'http://localhost:4000';
const JWT_SECRET = process.env.JWT_SECRET || 'kharcha_super_secret_jwt_key_2026_dev';

function makeToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '1h' });
}

function request(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const req = http.request(
      {
        host: url.hostname,
        port: url.port,
        method,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('--- Running Phase 5 Regenerate Key Verification Tests ---');

  // 1. Setup test users
  const creator = { id: 8101, email: 'p5creator@test.com', name: 'Phase5 Creator' };
  const member = { id: 8102, email: 'p5member@test.com', name: 'Phase5 Member' };
  const outsider = { id: 8103, email: 'p5outsider@test.com', name: 'Phase5 Outsider' };
  const newJoiner = { id: 8104, email: 'p5newjoiner@test.com', name: 'Phase5 NewJoiner' };

  for (const u of [creator, member, outsider, newJoiner]) {
    await pool.query('DELETE FROM users WHERE id = $1', [u.id]);
    await pool.query(
      'INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
      [u.id, u.email, 'hash', u.name]
    );
  }

  const creatorToken = makeToken(creator);
  const memberToken = makeToken(member);
  const outsiderToken = makeToken(outsider);
  const newJoinerToken = makeToken(newJoiner);

  // 2. Creator creates a group
  const createRes = await request(
    'POST',
    '/groups',
    { Authorization: `Bearer ${creatorToken}` },
    { name: 'Phase 5 Test Group', icon: 'shield' }
  );
  assert.strictEqual(createRes.status, 201);
  const group = createRes.body.group;
  const oldCode = group.join_code;
  assert.ok(/^\d{6}$/.test(oldCode), 'Initial join code should be 6 digits');
  console.log(`Created group ${group.id} with initial join code: ${oldCode}`);

  // Add member to group
  await pool.query(
    "INSERT INTO group_participants (group_id, user_id, guest_name, status) VALUES ($1, $2, $3, 'active')",
    [group.id, member.id, member.name]
  );

  // 3. Test: Non-member (outsider) attempting to regenerate key -> 403 Forbidden
  const outsiderRes = await request(
    'POST',
    `/groups/${group.id}/regenerate-key`,
    { Authorization: `Bearer ${outsiderToken}` }
  );
  assert.strictEqual(outsiderRes.status, 403);
  assert.strictEqual(outsiderRes.body.error, 'Access denied: you are not a member of this group');
  console.log('✓ Non-member blocked by requireGroupMember with 403');

  // 4. Test: Non-creator active member attempting to regenerate key -> 403 Forbidden
  const memberRes = await request(
    'POST',
    `/groups/${group.id}/regenerate-key`,
    { Authorization: `Bearer ${memberToken}` }
  );
  assert.strictEqual(memberRes.status, 403);
  assert.strictEqual(memberRes.body.error, 'Only the group creator can regenerate the join key');
  console.log('✓ Non-creator member blocked with 403 "Only the group creator can regenerate the join key"');

  // 5. Test: Creator regenerates key -> 200 OK
  const regenRes = await request(
    'POST',
    `/groups/${group.id}/regenerate-key`,
    { Authorization: `Bearer ${creatorToken}` }
  );
  assert.strictEqual(regenRes.status, 200);
  assert.strictEqual(regenRes.body.groupId, group.id);
  assert.strictEqual(regenRes.body.message, 'New join key generated successfully');
  const newCode = regenRes.body.join_code;
  assert.ok(/^\d{6}$/.test(newCode), 'New join code must be 6 digits');
  assert.notStrictEqual(newCode, oldCode, 'New join code must differ from old code');
  console.log(`✓ Creator successfully regenerated key: ${oldCode} -> ${newCode}`);

  // 6. Verify in DB
  const { rows: dbGroupRows } = await pool.query('SELECT join_code, join_code_active FROM groups WHERE id = $1', [group.id]);
  assert.strictEqual(dbGroupRows[0].join_code, newCode);
  assert.strictEqual(Boolean(dbGroupRows[0].join_code_active), true);
  console.log('✓ Database confirmed updated with new join_code');

  // 7. Test: Old key can no longer be used to join -> 404
  const oldJoinRes = await request(
    'POST',
    '/groups/join',
    { Authorization: `Bearer ${newJoinerToken}` },
    { joinCode: oldCode }
  );
  assert.strictEqual(oldJoinRes.status, 404);
  assert.strictEqual(oldJoinRes.body.error, 'Invalid or expired join code. Ask the group creator for a new one.');
  console.log('✓ Old join code correctly rejected with 404');

  // 8. Test: New key successfully used to join -> 200
  const newJoinRes = await request(
    'POST',
    '/groups/join',
    { Authorization: `Bearer ${newJoinerToken}` },
    { joinCode: newCode }
  );
  assert.strictEqual(newJoinRes.status, 200);
  assert.strictEqual(newJoinRes.body.alreadyMember, false);
  assert.strictEqual(newJoinRes.body.group.id, group.id);
  assert.strictEqual(newJoinRes.body.participant.user_id, newJoiner.id);
  console.log('✓ New join code successfully accepted with 200');

  // Cleanup test group
  await pool.query('DELETE FROM group_participants WHERE group_id = $1', [group.id]);
  await pool.query('DELETE FROM groups WHERE id = $1', [group.id]);

  console.log('\nALL PHASE 5 TESTS PASSED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('Phase 5 Test Failed:', err);
  process.exit(1);
});
