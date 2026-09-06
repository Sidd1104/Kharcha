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

async function runPart1Tests() {
  console.log('🧪 Starting PART 1 Verification Tests...\n');
  const timestamp = Date.now();

  // Create test users in DB
  const u1Res = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING *",
    [`Host_${timestamp}`, `host_${timestamp}@test.com`]
  );
  const host = u1Res.rows[0];
  const hostToken = makeToken(host);

  const u2Res = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING *",
    [`Aditi_User_${timestamp}`, `aditi_${timestamp}@test.com`]
  );
  const userAditi = u2Res.rows[0];
  const aditiToken = makeToken(userAditi);

  const u3Res = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING *",
    [`Bob_User_${timestamp}`, `bob_${timestamp}@test.com`]
  );
  const userBob = u3Res.rows[0];
  const bobToken = makeToken(userBob);

  // -------------------------------------------------------------
  // Test 1: Group creation with unlinked guest & candidate detection on join
  // -------------------------------------------------------------
  console.log('1. Testing candidate detection in POST /groups/join...');
  const createRes = await request('POST', '/groups', { Authorization: `Bearer ${hostToken}` }, {
    name: `Trip ${timestamp}`,
    guests: ['Aditi Guest', 'Sidd Guest']
  });
  assert.strictEqual(createRes.status, 201);
  const group = createRes.body.group;
  const joinCode = group.join_code;
  assert(joinCode, 'Group must have join_code');

  // Aditi User tries to join with key -> should return requiresLinkChoice = true with candidates
  const joinAttempt = await request('POST', '/groups/join', { Authorization: `Bearer ${aditiToken}` }, {
    joinCode
  });

  assert.strictEqual(joinAttempt.status, 200);
  assert.strictEqual(joinAttempt.body.requiresLinkChoice, true);
  assert.strictEqual(joinAttempt.body.candidates.length, 2);
  const candNames = joinAttempt.body.candidates.map(c => c.guestName);
  assert(candNames.includes('Aditi Guest'));
  assert(candNames.includes('Sidd Guest'));
  console.log('   ✅ POST /groups/join returned candidates without auto-inserting.');

  // Verify Aditi User is NOT yet in group_participants
  const checkMember = await pool.query(
    'SELECT * FROM group_participants WHERE group_id = $1 AND user_id = $2',
    [group.id, userAditi.id]
  );
  assert.strictEqual(checkMember.rows.length, 0, 'User must not be inserted before choice confirmation');
  console.log('   ✅ Verified user was not auto-inserted.');

  // -------------------------------------------------------------
  // Test 2: Confirm linking to an unlinked guest row
  // -------------------------------------------------------------
  console.log('2. Testing POST /groups/:id/join/confirm with linkToParticipantId...');
  const aditiCand = joinAttempt.body.candidates.find(c => c.guestName === 'Aditi Guest');

  // Record an expense paid by Aditi Guest prior to linking
  const expRes = await pool.query(
    'INSERT INTO expenses (group_id, paid_by, amount, description) VALUES ($1, $2, $3, $4) RETURNING *',
    [group.id, aditiCand.participantId, 250, 'Groceries by Guest']
  );
  const guestExpense = expRes.rows[0];

  const confirmRes = await request(
    'POST',
    `/groups/${group.id}/join/confirm`,
    { Authorization: `Bearer ${aditiToken}` },
    { linkToParticipantId: aditiCand.participantId }
  );

  assert.strictEqual(confirmRes.status, 200);
  assert.strictEqual(confirmRes.body.alreadyMember, false);
  assert.strictEqual(confirmRes.body.participant.id, aditiCand.participantId);
  assert.strictEqual(confirmRes.body.participant.user_id, userAditi.id);
  assert.strictEqual(confirmRes.body.participant.status, 'active');

  // Verify DB state: row updated, guest_name preserved, expense preserved
  const updatedAditi = await pool.query(
    'SELECT * FROM group_participants WHERE id = $1',
    [aditiCand.participantId]
  );
  assert.strictEqual(updatedAditi.rows[0].user_id, userAditi.id);
  assert.strictEqual(updatedAditi.rows[0].status, 'active');
  assert.strictEqual(updatedAditi.rows[0].guest_name, 'Aditi Guest');

  const expCheck = await pool.query(
    'SELECT paid_by FROM expenses WHERE id = $1',
    [guestExpense.id]
  );
  assert.strictEqual(expCheck.rows[0].paid_by, aditiCand.participantId);
  console.log('   ✅ Successfully linked guest account; preserved participant ID, guest_name, and expenses.');

  // -------------------------------------------------------------
  // Test 3: Confirm with linkToParticipantId: null ("No, add me as a new member")
  // -------------------------------------------------------------
  console.log('3. Testing POST /groups/:id/join/confirm with linkToParticipantId: null...');
  const joinAttemptBob = await request('POST', '/groups/join', { Authorization: `Bearer ${bobToken}` }, {
    joinCode
  });
  // 'Sidd Guest' is still unlinked, so it prompts candidates
  assert.strictEqual(joinAttemptBob.status, 200);
  assert.strictEqual(joinAttemptBob.body.requiresLinkChoice, true);

  const confirmBobRes = await request(
    'POST',
    `/groups/${group.id}/join/confirm`,
    { Authorization: `Bearer ${bobToken}` },
    { linkToParticipantId: null }
  );
  assert.strictEqual(confirmBobRes.status, 200);
  assert.strictEqual(confirmBobRes.body.participant.user_id, userBob.id);
  assert.strictEqual(confirmBobRes.body.participant.status, 'active');

  // Sidd Guest must still be unlinked
  const siddGuest = await pool.query(
    "SELECT * FROM group_participants WHERE group_id = $1 AND guest_name = 'Sidd Guest'",
    [group.id]
  );
  assert.strictEqual(siddGuest.rows[0].user_id, null);
  assert.strictEqual(siddGuest.rows[0].status, 'guest');
  console.log('   ✅ Fresh member created; unlinked guest remains intact.');

  // -------------------------------------------------------------
  // Test 4: Host-only manual merge with split collision resolution
  // -------------------------------------------------------------
  console.log('4. Testing POST /groups/:id/participants/merge with split collisions...');
  const unlinkedSiddId = siddGuest.rows[0].id;
  const targetBobId = confirmBobRes.body.participant.id;

  // Add an expense paid by Sidd Guest
  const siddPaidExp = await pool.query(
    'INSERT INTO expenses (group_id, paid_by, amount, description) VALUES ($1, $2, $3, $4) RETURNING *',
    [group.id, unlinkedSiddId, 150, 'Dinner']
  );

  // Add an expense paid by host, with splits for BOTH Sidd Guest (₹40) and Bob (₹60)
  // This triggers a collision on UNIQUE(expense_id, participant_id) when Sidd Guest is merged into Bob!
  const hostExp = await pool.query(
    'INSERT INTO expenses (group_id, paid_by, amount, description) VALUES ($1, $2, $3, $4) RETURNING *',
    [group.id, (await pool.query('SELECT id FROM group_participants WHERE group_id = $1 AND user_id = $2', [group.id, host.id])).rows[0].id, 100, 'Collision test expense']
  );
  await pool.query(
    'INSERT INTO expense_splits (expense_id, participant_id, share_amount) VALUES ($1, $2, $3), ($1, $4, $5)',
    [hostExp.rows[0].id, unlinkedSiddId, 40, targetBobId, 60]
  );

  // Non-host attempt should be rejected (403)
  const nonHostMerge = await request(
    'POST',
    `/groups/${group.id}/participants/merge`,
    { Authorization: `Bearer ${bobToken}` },
    { unlinkedParticipantId: unlinkedSiddId, targetParticipantId: targetBobId }
  );
  assert.strictEqual(nonHostMerge.status, 403, 'Non-host must receive 403');
  console.log('   ✅ Non-host merge was correctly denied with 403.');

  // Host executes merge
  const hostMerge = await request(
    'POST',
    `/groups/${group.id}/participants/merge`,
    { Authorization: `Bearer ${hostToken}` },
    { unlinkedParticipantId: unlinkedSiddId, targetParticipantId: targetBobId }
  );
  assert.strictEqual(hostMerge.status, 200);
  assert.strictEqual(hostMerge.body.success, true);

  // Verify expenses paid by Sidd are now paid by Bob
  const checkExpPaid = await pool.query(
    'SELECT paid_by FROM expenses WHERE id = $1',
    [siddPaidExp.rows[0].id]
  );
  assert.strictEqual(checkExpPaid.rows[0].paid_by, targetBobId);

  // Verify colliding splits were summed and duplicate deleted
  const splitsCheck = await pool.query(
    'SELECT * FROM expense_splits WHERE expense_id = $1',
    [hostExp.rows[0].id]
  );
  assert.strictEqual(splitsCheck.rows.length, 1, 'Only one split row should remain after collision merge');
  assert.strictEqual(splitsCheck.rows[0].participant_id, targetBobId);
  assert.strictEqual(Number(splitsCheck.rows[0].share_amount), 100, 'Split amount should be 40 + 60 = 100');

  // Verify Sidd Guest row was deleted
  const siddRowCheck = await pool.query(
    'SELECT * FROM group_participants WHERE id = $1',
    [unlinkedSiddId]
  );
  assert.strictEqual(siddRowCheck.rows.length, 0, 'Unlinked guest row must be deleted after merge');

  console.log('   ✅ Host merge executed cleanly: paid_by updated, splits merged, duplicate deleted, guest row removed.\n');
  console.log('🎉 ALL PART 1 TESTS PASSED SUCCESSFULLY!');
}

runPart1Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Part 1 Test Failure:', err);
    process.exit(1);
  });
