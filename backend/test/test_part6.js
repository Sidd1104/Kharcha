const assert = require('assert');
const jwt = require('jsonwebtoken');
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool } = require('../src/db');

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set.');
}
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = 'http://localhost:4000';

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
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runPart6RegressionTests() {
  console.log('=== PART 6 REGRESSION TESTS ===\n');

  const timestamp = Date.now();
  const hostEmail = `host_p6_${timestamp}@test.com`;
  const joinerEmail = `joiner_p6_${timestamp}@test.com`;
  const newMemberEmail = `newmem_p6_${timestamp}@test.com`;

  // Resync sequences in case manual inserts desynced identity counters
  await pool.query("SELECT setval('users_id_seq', (SELECT GREATEST(COALESCE(MAX(id), 0), 1) FROM users))");
  await pool.query("SELECT setval('groups_id_seq', (SELECT GREATEST(COALESCE(MAX(id), 0), 1) FROM groups))");
  await pool.query("SELECT setval('group_participants_id_seq', (SELECT GREATEST(COALESCE(MAX(id), 0), 1) FROM group_participants))");
  await pool.query("SELECT setval('expenses_id_seq', (SELECT GREATEST(COALESCE(MAX(id), 0), 1) FROM expenses))");

  // 1. Create test users
  const userHostRes = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ('Aditi Host', $1, 'hashedpass') RETURNING id, name, email",
    [hostEmail]
  );
  const userJoinerRes = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ('Siddhant Joiner', $1, 'hashedpass') RETURNING id, name, email",
    [joinerEmail]
  );
  const userNewRes = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ('Yash New', $1, 'hashedpass') RETURNING id, name, email",
    [newMemberEmail]
  );

  const host = userHostRes.rows[0];
  const joiner = userJoinerRes.rows[0];
  const newMember = userNewRes.rows[0];

  const hostToken = makeToken(host);
  const joinerToken = makeToken(joiner);
  const newMemberToken = makeToken(newMember);

  try {
    // 2. Host creates a group with 2 guest participants (one matching joiner's name 'siddhant')
    const createRes = await request(
      'POST',
      '/groups',
      { Authorization: `Bearer ${hostToken}` },
      { name: `Part 6 Test Group ${timestamp}`, guests: ['yuvi', 'siddhant'] }
    );
    assert.strictEqual(createRes.status, 201, 'Group creation must succeed');
    const group = createRes.body.group;
    assert(group.join_code, 'Group must have a 6-digit join_code');
    console.log(`1. Created group "${group.name}" (ID ${group.id}) with join code ${group.join_code}`);

    // Verify initial participants: Host + 2 guests
    const initialParticipantsRes = await pool.query(
      'SELECT id, guest_name, user_id, status, joined_via FROM group_participants WHERE group_id = $1 ORDER BY id ASC',
      [group.id]
    );
    assert.strictEqual(initialParticipantsRes.rows.length, 3, 'Must have 3 initial participants');
    const siddhantGuest = initialParticipantsRes.rows.find((p) => p.guest_name === 'siddhant');
    assert(siddhantGuest, 'siddhant guest participant must exist');
    assert.strictEqual(siddhantGuest.user_id, null, 'Guest must have user_id null');
    console.log(`   Initial guests: yuvi, siddhant (guest ID: ${siddhantGuest.id})`);

    // 3. Joiner attempts to join using 6-digit key via POST /groups/join
    console.log('\n2. Joiner attempts to join using join code...');
    const joinRes = await request(
      'POST',
      '/groups/join',
      { Authorization: `Bearer ${joinerToken}` },
      { joinCode: group.join_code }
    );
    assert.strictEqual(joinRes.status, 200, 'POST /groups/join must return 200');
    assert.strictEqual(joinRes.body.requiresLinkChoice, true, 'requiresLinkChoice must be true');
    assert(Array.isArray(joinRes.body.candidates), 'candidates must be an array');
    assert.strictEqual(joinRes.body.candidates.length, 2, 'Must return 2 guest candidates');
    const candMatch = joinRes.body.candidates.find((c) => c.guestName === 'siddhant');
    assert(candMatch, 'Guest candidate "siddhant" must be in candidates list');
    console.log('   ✅ Received requiresLinkChoice: true with candidate list');

    // 4. Confirm NO participant row exists for Joiner in database
    console.log('\n3. Verifying NO participant row exists before /join/confirm...');
    const noRowCheck = await pool.query(
      'SELECT * FROM group_participants WHERE group_id = $1 AND user_id = $2',
      [group.id, joiner.id]
    );
    assert.strictEqual(noRowCheck.rows.length, 0, 'Zero participant rows must exist for joiner before confirm');
    console.log('   ✅ Confirmed: 0 participant rows exist for Joiner');

    // 5. Confirm Joiner CANNOT view group or add expenses (strictly 403)
    console.log('\n4. Verifying requireGroupMember enforcement before /join/confirm...');
    const getGroupRes = await request('GET', `/groups/${group.id}`, { Authorization: `Bearer ${joinerToken}` });
    assert.strictEqual(getGroupRes.status, 403, 'GET /groups/:id must return 403 for non-member');

    const addExpenseFailRes = await request(
      'POST',
      `/groups/${group.id}/expenses`,
      { Authorization: `Bearer ${joinerToken}` },
      { description: 'Unauthorized expense', amount: 100, paidBy: siddhantGuest.id }
    );
    assert.strictEqual(addExpenseFailRes.status, 403, 'POST /groups/:groupId/expenses must return 403 before confirm');
    console.log('   ✅ Confirmed: GET and POST expenses strictly reject with 403');

    // 6. Joiner calls POST /groups/:id/join/confirm linking to "siddhant"
    console.log('\n5. Joiner calls POST /groups/:id/join/confirm linking to guest "siddhant"...');
    const confirmRes = await request(
      'POST',
      `/groups/${group.id}/join/confirm`,
      { Authorization: `Bearer ${joinerToken}` },
      { linkToParticipantId: siddhantGuest.id }
    );
    assert.strictEqual(confirmRes.status, 200, 'Confirm must return 200');
    assert.strictEqual(confirmRes.body.alreadyMember, false);
    assert.strictEqual(confirmRes.body.participant.id, siddhantGuest.id);
    assert.strictEqual(confirmRes.body.participant.user_id, joiner.id);

    // 7. Verify DB: participant row is linked, status='active', and joined_via='join_key'
    const linkedRowRes = await pool.query(
      'SELECT * FROM group_participants WHERE id = $1',
      [siddhantGuest.id]
    );
    const linkedRow = linkedRowRes.rows[0];
    assert.strictEqual(linkedRow.user_id, joiner.id, 'user_id must be linked');
    assert.strictEqual(linkedRow.status, 'active', 'status must be active');
    assert.strictEqual(linkedRow.joined_via, 'join_key', 'joined_via must be join_key');
    console.log('   ✅ Confirmed: Participant linked with status="active" and joined_via="join_key"');

    // 8. Joiner CAN now immediately add an expense
    console.log('\n6. Joiner immediately adds an expense...');
    const addExpenseRes = await request(
      'POST',
      `/groups/${group.id}/expenses`,
      { Authorization: `Bearer ${joinerToken}` },
      { description: 'Group Lunch', amount: 900, paidBy: linkedRow.id }
    );
    assert.strictEqual(addExpenseRes.status, 200, 'Adding expense must succeed after confirming join');
    assert.strictEqual(addExpenseRes.body.expense.description, 'Group Lunch');
    assert.strictEqual(Number(addExpenseRes.body.expense.amount), 900);
    console.log('   ✅ Confirmed: Expense added successfully immediately after join confirm');

    // 9. Test branch: New member chooses "No, add me as a new member" (linkToParticipantId: null)
    console.log('\n7. User C joins with linkToParticipantId: null (new member branch)...');
    const joinResC = await request(
      'POST',
      '/groups/join',
      { Authorization: `Bearer ${newMemberToken}` },
      { joinCode: group.join_code }
    );
    assert.strictEqual(joinResC.body.requiresLinkChoice, true, 'Still prompts if other unlinked guests remain');

    const confirmResC = await request(
      'POST',
      `/groups/${group.id}/join/confirm`,
      { Authorization: `Bearer ${newMemberToken}` },
      { linkToParticipantId: null }
    );
    assert.strictEqual(confirmResC.status, 200, 'Confirm as new member must succeed');
    assert.strictEqual(confirmResC.body.participant.user_id, newMember.id);

    // Verify DB for new member
    const newMemberRowRes = await pool.query(
      'SELECT * FROM group_participants WHERE group_id = $1 AND user_id = $2',
      [group.id, newMember.id]
    );
    const newMemberRow = newMemberRowRes.rows[0];
    assert.strictEqual(newMemberRow.status, 'active');
    assert.strictEqual(newMemberRow.joined_via, 'join_key');

    // New member adds an expense
    const addExpenseResC = await request(
      'POST',
      `/groups/${group.id}/expenses`,
      { Authorization: `Bearer ${newMemberToken}` },
      { description: 'Coffee', amount: 150, paidBy: newMemberRow.id }
    );
    assert.strictEqual(addExpenseResC.status, 200, 'New member can add expense immediately');
    console.log('   ✅ Confirmed: New member joined with joined_via="join_key" and added expense');

    console.log('\n🎉 ALL PART 6 REGRESSION TESTS PASSED CLEANLY!\n');
  } finally {
    // Cleanup test data
    await pool.query("DELETE FROM expenses WHERE description IN ('Group Lunch', 'Coffee', 'Unauthorized expense')");
    await pool.query("DELETE FROM group_participants WHERE guest_name IN ('yuvi', 'siddhant', 'Yash New', 'Siddhant Joiner')");
    await pool.query("DELETE FROM groups WHERE name LIKE 'Part 6 Test Group%'");
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [host.id, joiner.id, newMember.id]);
    await pool.end();
  }
}

runPart6RegressionTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
