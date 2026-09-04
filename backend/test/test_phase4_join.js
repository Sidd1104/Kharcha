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
  console.log('--- Running Phase 4 Join Group Verification Tests ---');

  try {
    // 1. Setup test users
    const creatorUser = { id: 7101, email: 'p4creator@test.com', name: 'Phase4 Creator' };
    const joinerUser = { id: 7102, email: 'p4joiner@test.com', name: 'Phase4 Joiner' };
    const invitedUser = { id: 7103, email: 'p4invited@test.com', name: 'Phase4 Invited' };
    const rateLimitUser = { id: 7104, email: 'p4ratelimit@test.com', name: 'Phase4 RateLimit' };
    const probeUser = { id: 7105, email: 'p4probe@test.com', name: 'Phase4 Probe' };

    for (const u of [creatorUser, joinerUser, invitedUser, rateLimitUser, probeUser]) {
      await pool.query('DELETE FROM users WHERE id = $1', [u.id]);
      await pool.query(
        'INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
        [u.id, u.email, 'hash', u.name]
      );
    }

    const creatorToken = makeToken(creatorUser);
    const joinerToken = makeToken(joinerUser);
    const invitedToken = makeToken(invitedUser);
    const rateLimitToken = makeToken(rateLimitUser);
    const probeToken = makeToken(probeUser);

    // 2. Creator creates a group with a guest named "Phase4 Joiner"
    const createRes = await request(
      'POST',
      '/groups',
      { Authorization: `Bearer ${creatorToken}` },
      { name: 'Phase 4 Test Group', icon: 'zap', guests: ['Phase4 Joiner'] }
    );
    assert.strictEqual(createRes.status, 201);
    const group = createRes.body.group;
    assert.ok(group.join_code, 'Group should have join_code');
    const validCode = group.join_code;
    console.log(`Created group ${group.id} with join code ${validCode}`);

    // 3. Test malformed join codes (400) (using probeUser)
    for (const badCode of ['', '123', '1234567']) {
      const res = await request(
        'POST',
        '/groups/join',
        { Authorization: `Bearer ${probeToken}` },
        { joinCode: badCode }
      );
      assert.strictEqual(res.status, 400, `Expected 400 for bad code: "${badCode}"`);
      assert.strictEqual(res.body.error, 'Join code must be a 6-digit number');
    }
    console.log('✓ Malformed join codes correctly rejected with 400');

    // 4. Test non-existent join code (404) (using probeUser)
    const nonExistentRes = await request(
      'POST',
      '/groups/join',
      { Authorization: `Bearer ${probeToken}` },
      { joinCode: '000000' }
    );
    assert.strictEqual(nonExistentRes.status, 404);
    assert.strictEqual(
      nonExistentRes.body.error,
      'Invalid or expired join code. Ask the group creator for a new one.'
    );
    console.log('✓ Non-existent join code correctly returned 404');

    // 5. Test inactive join code (404)
    // Create an inactive group
    await pool.query(
      "INSERT INTO groups (name, icon, created_by, join_code, join_code_active) VALUES ('Inactive Group', 'wallet', $1, '999999', false)",
      [creatorUser.id]
    );
    const inactiveRes = await request(
      'POST',
      '/groups/join',
      { Authorization: `Bearer ${joinerToken}` },
      { joinCode: '999999' }
    );
    assert.strictEqual(inactiveRes.status, 404);
    assert.strictEqual(
      inactiveRes.body.error,
      'Invalid or expired join code. Ask the group creator for a new one.'
    );
    console.log('✓ Inactive join code correctly returned 404 without leaking state');

    // 6. Test successful join for new member
    const joinRes = await request(
      'POST',
      '/groups/join',
      { Authorization: `Bearer ${joinerToken}` },
      { joinCode: validCode }
    );
    assert.strictEqual(joinRes.status, 200);
    assert.strictEqual(joinRes.body.alreadyMember, false);
    assert.strictEqual(joinRes.body.message, 'Successfully joined the group!');
    assert.strictEqual(joinRes.body.group.id, group.id);
    assert.strictEqual(joinRes.body.participant.user_id, joinerUser.id);
    assert.strictEqual(joinRes.body.participant.status, 'active');

    // Verify DB participant row and verify unlinked guest is untouched (no name merging)
    const { rows: participants } = await pool.query(
      'SELECT * FROM group_participants WHERE group_id = $1 ORDER BY id ASC',
      [group.id]
    );
    // Should have: creator (active), guest "Phase4 Joiner" (guest, user_id NULL), joiner (active, user_id 7102)
    const guestRow = participants.find((p) => p.user_id === null && p.guest_name === 'Phase4 Joiner');
    const joinerRow = participants.find((p) => p.user_id === joinerUser.id);
    assert.ok(guestRow, 'Unlinked guest row should still exist untouched');
    assert.strictEqual(guestRow.status, 'guest');
    assert.ok(joinerRow, 'New joined user row should exist');
    assert.strictEqual(joinerRow.status, 'active');
    console.log('✓ Successful join works & unlinked guest row was not accidentally merged');

    // 7. Test idempotency (already a member re-entering code)
    const reJoinRes = await request(
      'POST',
      '/groups/join',
      { Authorization: `Bearer ${joinerToken}` },
      { joinCode: validCode }
    );
    assert.strictEqual(reJoinRes.status, 200);
    assert.strictEqual(reJoinRes.body.alreadyMember, true);
    assert.strictEqual(reJoinRes.body.message, 'You are already a member of this group');
    assert.strictEqual(reJoinRes.body.participant.user_id, joinerUser.id);
    console.log('✓ Idempotent re-join correctly detected and returned 200 with alreadyMember: true');

    // 8. Test claiming pending invite
    // Add invited user to group
    await pool.query(
      "INSERT INTO group_participants (group_id, user_id, invite_email, status) VALUES ($1, $2, $3, 'invited')",
      [group.id, invitedUser.id, invitedUser.email]
    );
    const inviteJoinRes = await request(
      'POST',
      '/groups/join',
      { Authorization: `Bearer ${invitedToken}` },
      { joinCode: validCode }
    );
    assert.strictEqual(inviteJoinRes.status, 200);
    assert.strictEqual(inviteJoinRes.body.alreadyMember, false);
    assert.strictEqual(inviteJoinRes.body.participant.status, 'active');
    // Check in DB that invite_email was cleared and status is active
    const { rows: updatedInvitedRows } = await pool.query(
      'SELECT * FROM group_participants WHERE group_id = $1 AND user_id = $2',
      [group.id, invitedUser.id]
    );
    assert.strictEqual(updatedInvitedRows[0].status, 'active');
    assert.strictEqual(updatedInvitedRows[0].invite_email, null);
    console.log('✓ Pending invite was claimed and activated');

    // 9. Test Rate Limiting (5 attempts allowed, 6th returns 429)
    console.log('Testing rate limiter (5 allowed, 6th should return 429)...');
    for (let i = 1; i <= 5; i++) {
      const rlRes = await request(
        'POST',
        '/groups/join',
        { Authorization: `Bearer ${rateLimitToken}` },
        { joinCode: '000000' }
      );
      assert.ok(
        rlRes.status === 404 || rlRes.status === 400,
        `Attempt ${i} should not be rate limited (status ${rlRes.status})`
      );
    }
    const blockedRes = await request(
      'POST',
      '/groups/join',
      { Authorization: `Bearer ${rateLimitToken}` },
      { joinCode: '000000' }
    );
    assert.strictEqual(blockedRes.status, 429, '6th attempt should be rate-limited to 429');
    assert.strictEqual(
      blockedRes.body.error,
      'Too many join attempts. Please wait a few minutes before trying again.'
    );
    console.log('✓ Rate limiting caught 6th attempt with 429 Too Many Requests');

    console.log('\nALL PHASE 4 TESTS PASSED SUCCESSFULLY!');
  } finally {
  }
}

run().catch((err) => {
  console.error('Phase 4 Test Failed:', err);
  process.exit(1);
});
