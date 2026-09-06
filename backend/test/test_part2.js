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

async function runPart2Tests() {
  console.log('🧪 Starting PART 2 Verification Tests (joined_via)...\n');
  const timestamp = Date.now();

  try {
    await pool.query("SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))");
    await pool.query("SELECT setval('groups_id_seq', (SELECT COALESCE(MAX(id), 1) FROM groups))");
    await pool.query("SELECT setval('group_participants_id_seq', (SELECT COALESCE(MAX(id), 1) FROM group_participants))");
  } catch (e) {}

  // Create users
  const u1Res = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING *",
    [`Host2_${timestamp}`, `host2_${timestamp}@test.com`]
  );
  const host = u1Res.rows[0];
  const hostToken = makeToken(host);

  const u2Res = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING *",
    [`KeyJoiner_${timestamp}`, `keyjoiner_${timestamp}@test.com`]
  );
  const userKeyJoiner = u2Res.rows[0];
  const keyToken = makeToken(userKeyJoiner);

  // 1. Create group with creator and a guest
  console.log('1. Testing group creation: creator and guest rows should have joined_via = "host_added"...');
  const createRes = await request('POST', '/groups', { Authorization: `Bearer ${hostToken}` }, {
    name: `JoinedVia Test ${timestamp}`,
    guests: ['Manual Guest']
  });
  assert.strictEqual(createRes.status, 201);
  const group = createRes.body.group;

  // Check DB directly
  const participantsDb = await pool.query(
    'SELECT * FROM group_participants WHERE group_id = $1 ORDER BY id ASC',
    [group.id]
  );
  assert.strictEqual(participantsDb.rows.length, 2);
  assert.strictEqual(participantsDb.rows[0].joined_via, 'host_added', 'Creator row must default to host_added');
  assert.strictEqual(participantsDb.rows[1].joined_via, 'host_added', 'Guest row must default to host_added');
  console.log('   ✅ DB defaults confirmed: creator and initial guest have joined_via = "host_added".');

  // 2. Add another guest via POST /groups/:id/participants/guest
  console.log('2. Testing POST /groups/:id/participants/guest: should have joined_via = "host_added"...');
  const addGuestRes = await request(
    'POST',
    `/groups/${group.id}/participants/guest`,
    { Authorization: `Bearer ${hostToken}` },
    { name: 'Second Guest' }
  );
  assert.strictEqual(addGuestRes.status, 201);

  const guest2Check = await pool.query(
    'SELECT * FROM group_participants WHERE id = $1',
    [addGuestRes.body.participant.participant_id]
  );
  assert.strictEqual(guest2Check.rows[0].joined_via, 'host_added', 'Host-added guest must have joined_via = "host_added"');
  console.log('   ✅ Added guest confirmed to have joined_via = "host_added".');

  // 3. User joins via key using /join -> /join/confirm
  console.log('3. Testing join by key: new participant row should have joined_via = "join_key"...');
  const joinRes = await request('POST', '/groups/join', { Authorization: `Bearer ${keyToken}` }, {
    joinCode: group.join_code
  });
  // Has unlinked guests, so prompts choice
  assert.strictEqual(joinRes.status, 200);
  assert.strictEqual(joinRes.body.requiresLinkChoice, true);

  const confirmRes = await request(
    'POST',
    `/groups/${group.id}/join/confirm`,
    { Authorization: `Bearer ${keyToken}` },
    { linkToParticipantId: null }
  );
  assert.strictEqual(confirmRes.status, 200);

  const keyJoinerCheck = await pool.query(
    'SELECT * FROM group_participants WHERE group_id = $1 AND user_id = $2',
    [group.id, userKeyJoiner.id]
  );
  assert.strictEqual(keyJoinerCheck.rows[0].joined_via, 'join_key', 'Member joining via key must have joined_via = "join_key"');
  console.log('   ✅ Key-joined member confirmed to have joined_via = "join_key".');

  // 4. Verify GET /groups/:id response includes joined_via
  console.log('4. Testing GET /groups/:id: response must include joined_via for each member...');
  const detailRes = await request(
    'GET',
    `/groups/${group.id}`,
    { Authorization: `Bearer ${hostToken}` }
  );
  assert.strictEqual(detailRes.status, 200);
  const participants = detailRes.body.participants;
  assert(participants.length >= 4);

  const creatorP = participants.find(p => p.user_id === host.id);
  assert.strictEqual(creatorP.joined_via, 'host_added');

  const keyP = participants.find(p => p.user_id === userKeyJoiner.id);
  assert.strictEqual(keyP.joined_via, 'join_key');

  const guestP = participants.find(p => p.name === 'Manual Guest');
  assert.strictEqual(guestP.joined_via, 'host_added');

  console.log('   ✅ GET /groups/:id correctly returned joined_via for all participants.\n');
  console.log('🎉 ALL PART 2 TESTS PASSED SUCCESSFULLY!');
}

runPart2Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Part 2 Test Failure:', err);
    process.exit(1);
  });
