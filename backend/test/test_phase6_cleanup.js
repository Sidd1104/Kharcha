const assert = require('assert');
const jwt = require('jsonwebtoken');
const http = require('http');
const path = require('path');
const fs = require('fs');
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
  console.log('--- Running Phase 6 Email Invite Removal Verification Tests ---');

  const testUser = { id: 9101, email: 'p6user@test.com', name: 'Phase6 User' };
  await pool.query('DELETE FROM users WHERE id = $1', [testUser.id]);
  await pool.query('INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)', [
    testUser.id,
    testUser.email,
    'hash',
    testUser.name,
  ]);
  const token = makeToken(testUser);

  // 1. Verify POST /groups/:id/participants/invite returns 404 (route removed)
  const inviteRouteRes = await request(
    'POST',
    '/groups/1/participants/invite',
    { Authorization: `Bearer ${token}` },
    { email: 'test@example.com' }
  );
  assert.strictEqual(inviteRouteRes.status, 404, 'POST /groups/:id/participants/invite should be 404');
  console.log('✓ POST /groups/:id/participants/invite is gone (HTTP 404)');

  // 2. Verify GET /invites/:token returns 404
  const invitesEndpointRes = await request('GET', '/invites/some-token');
  assert.strictEqual(invitesEndpointRes.status, 404, 'GET /invites/:token should be 404');
  console.log('✓ /invites route is unmounted (HTTP 404)');

  // 3. Verify GET /notifications returns 404
  const notificationsRes = await request('GET', '/notifications', {
    Authorization: `Bearer ${token}`,
  });
  assert.strictEqual(notificationsRes.status, 404, 'GET /notifications should be 404');
  console.log('✓ /notifications route is unmounted (HTTP 404)');

  // 4. Verify deprecated files do not exist
  const filesToCheck = [
    path.join(__dirname, '../src/routes/invites.js'),
    path.join(__dirname, '../src/routes/notifications.js'),
    path.join(__dirname, '../src/utils/email.js'),
  ];
  for (const f of filesToCheck) {
    assert.strictEqual(fs.existsSync(f), false, `File ${f} should have been deleted`);
  }
  console.log('✓ invites.js, notifications.js, and email.js files are verified deleted');

  // 5. Verify database backward compatibility (group_invites and invite_email intact)
  const { rows: tableCheck } = await pool.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='group_invites'"
  );
  assert.strictEqual(tableCheck.length, 1, 'group_invites table must still exist in database');

  const { rows: colCheck } = await pool.query('PRAGMA table_info(group_participants)');
  const inviteEmailCol = colCheck.find((c) => c.name === 'invite_email');
  assert.ok(inviteEmailCol, 'invite_email column must still exist on group_participants');
  console.log('✓ Database backward compatibility preserved: group_invites and invite_email untouched');

  // 6. Verify nodemailer is not listed in backend/package.json
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.strictEqual(pkg.dependencies && pkg.dependencies.nodemailer, undefined, 'nodemailer must be removed from dependencies');
  console.log('✓ nodemailer successfully uninstalled from backend');

  console.log('\nALL PHASE 6 TESTS PASSED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('Phase 6 Test Failed:', err);
  process.exit(1);
});
