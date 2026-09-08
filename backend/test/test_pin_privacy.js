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
          resolve({ status: res.statusCode, body: parsed });
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

async function main() {
  console.log('=== TEST: PIN PRIVACY & ACCESS CONTROL ===\n');

  // 1. Create Host user in DB
  const hostRes = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING id, name, email",
    [`Host_${Date.now()}`, `host_${Date.now()}@example.com`]
  );
  const host = hostRes.rows[0];
  const hostToken = makeToken(host);

  // 2. Create Joiner user in DB
  const joinerRes = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING id, name, email",
    [`Joiner_${Date.now()}`, `joiner_${Date.now()}@example.com`]
  );
  const joiner = joinerRes.rows[0];
  const joinerToken = makeToken(joiner);

  // 3. Host creates group
  const createRes = await request(
    'POST',
    '/groups',
    { Authorization: `Bearer ${hostToken}` },
    { name: `PIN Test ${Date.now()}`, guests: ['test_guest'] }
  );
  const group = createRes.body.group;
  const joinCode = group.join_code;
  console.log(`1. Host created group "${group.name}" (ID ${group.id}) with join key "${joinCode}"`);
  assert.ok(joinCode, 'Host must receive join_code upon group creation');

  // 4. Host fetches GET /groups/:id
  const hostDetail = await request(
    'GET',
    `/groups/${group.id}`,
    { Authorization: `Bearer ${hostToken}` }
  );
  console.log('2. Host GET /groups/:id join_code:', hostDetail.body.group.join_code);
  assert.strictEqual(hostDetail.body.group.join_code, joinCode, 'Host MUST see join_code in GET /groups/:id');

  // 5. Joiner joins via join code
  const joinRes = await request(
    'POST',
    '/groups/join',
    { Authorization: `Bearer ${joinerToken}` },
    { joinCode }
  );
  console.log('3. Joiner joined group via join code');

  if (joinRes.body.requiresLinkChoice) {
    const confirmRes = await request(
      'POST',
      `/groups/${group.id}/join/confirm`,
      { Authorization: `Bearer ${joinerToken}` },
      { linkToParticipantId: null }
    );
    assert.strictEqual(confirmRes.body.group.join_code, undefined, 'Join confirm must NOT leak join_code to non-host');
  } else {
    assert.strictEqual(joinRes.body.group.join_code, undefined, 'Join response must NOT leak join_code to non-host');
  }

  // 6. Joiner fetches GET /groups/:id
  const joinerDetail = await request(
    'GET',
    `/groups/${group.id}`,
    { Authorization: `Bearer ${joinerToken}` }
  );
  console.log('4. Non-host GET /groups/:id join_code:', joinerDetail.body.group.join_code);
  assert.strictEqual(joinerDetail.body.group.join_code, undefined, 'Non-host member MUST NOT see join_code in GET /groups/:id');

  // 7. Non-host attempts to regenerate key
  const regenRes = await request(
    'POST',
    `/groups/${group.id}/regenerate-key`,
    { Authorization: `Bearer ${joinerToken}` }
  );
  console.log('5. Non-host regenerate-key HTTP status:', regenRes.status);
  assert.strictEqual(regenRes.status, 403, 'Non-host must be rejected with 403 when trying to regenerate key');

  // Cleanup
  await pool.query('DELETE FROM groups WHERE id = $1', [group.id]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [host.id, joiner.id]);

  console.log('\n🎉 ALL PIN PRIVACY & ACCESS CONTROL TESTS PASSED CLEANLY!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
