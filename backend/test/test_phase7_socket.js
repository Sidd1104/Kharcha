const assert = require('assert');
const jwt = require('jsonwebtoken');
const http = require('http');
const path = require('path');
const { io: ioClient } = require('socket.io-client');
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

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BASE_URL, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

async function run() {
  console.log('--- Running Phase 7 Real-Time Sync (Socket.IO) Verification Tests ---');

  // 1. Setup test users
  const userA = { id: 6201, email: 'p7userA@test.com', name: 'Phase7 UserA' };
  const userB = { id: 6202, email: 'p7userB@test.com', name: 'Phase7 UserB' };
  const userC = { id: 6203, email: 'p7userC@test.com', name: 'Phase7 UserC' };

  for (const u of [userA, userB, userC]) {
    await pool.query('DELETE FROM users WHERE id = $1', [u.id]);
    await pool.query('INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)', [
      u.id,
      u.email,
      'hash',
      u.name,
    ]);
  }

  const tokenA = makeToken(userA);
  const tokenB = makeToken(userB);
  const tokenC = makeToken(userC);

  // 2. Test unauthenticated connection rejection
  try {
    await connectSocket(null);
    assert.fail('Should reject unauthenticated socket connection');
  } catch (err) {
    assert.ok(err.message.includes('Authentication required'), `Expected "Authentication required", got: ${err.message}`);
    console.log('✓ Unauthenticated connection rejected with "Authentication required"');
  }

  // 3. Test invalid token rejection
  try {
    await connectSocket('invalid.jwt.token');
    assert.fail('Should reject invalid token connection');
  } catch (err) {
    assert.ok(err.message.includes('Invalid token'), `Expected "Invalid token", got: ${err.message}`);
    console.log('✓ Invalid token connection rejected with "Invalid token"');
  }

  // 4. Test successful authenticated connections
  const socketA = await connectSocket(tokenA);
  const socketC = await connectSocket(tokenC);
  console.log('✓ Authenticated sockets connected successfully');

  try {
    // 5. User A creates a group
    const createRes = await request(
      'POST',
      '/groups',
      { Authorization: `Bearer ${tokenA}` },
      { name: 'Phase 7 Real-time Group', icon: 'zap' }
    );
    assert.strictEqual(createRes.status, 201);
    const group = createRes.body.group;
    console.log(`Created group ${group.id} with join code ${group.join_code}`);

    // 6. Test unauthorized room join (User C is NOT a member of group)
    const authErrorPromise = new Promise((resolve) => {
      socketC.once('error', (err) => resolve(err));
    });
    socketC.emit('join-group', group.id);
    const roomErr = await authErrorPromise;
    assert.strictEqual(roomErr.message, 'Not authorized for this group room');
    console.log('✓ Non-member prevented from joining group room (received authorization error)');

    // 7. User A joins room `group:${group.id}`
    const joinedPromise = new Promise((resolve) => {
      socketA.once('joined-group', (data) => resolve(data));
    });
    socketA.emit('join-group', group.id);
    const joinConfirm = await joinedPromise;
    assert.strictEqual(joinConfirm.groupId, group.id);
    console.log(`✓ User A successfully joined group:${group.id} room`);

    // 8. Test real-time 'member-joined' event
    // User B joins via POST /groups/join
    const memberJoinedPromise = new Promise((resolve) => {
      socketA.once('member-joined', (payload) => resolve(payload));
    });
    const joinRes = await request(
      'POST',
      '/groups/join',
      { Authorization: `Bearer ${tokenB}` },
      { joinCode: group.join_code }
    );
    assert.strictEqual(joinRes.status, 200);

    const memberJoinedEvent = await memberJoinedPromise;
    assert.strictEqual(memberJoinedEvent.groupId, group.id);
    assert.strictEqual(memberJoinedEvent.participant.userId, userB.id);
    console.log('✓ Real-time "member-joined" event received by room members');

    // 9. Test real-time 'key-regenerated' event
    const keyRegenPromise = new Promise((resolve) => {
      socketA.once('key-regenerated', (payload) => resolve(payload));
    });
    const regenRes = await request(
      'POST',
      `/groups/${group.id}/regenerate-key`,
      { Authorization: `Bearer ${tokenA}` }
    );
    assert.strictEqual(regenRes.status, 200);

    const keyRegenEvent = await keyRegenPromise;
    assert.strictEqual(keyRegenEvent.groupId, group.id);
    assert.strictEqual(keyRegenEvent.newKey, regenRes.body.join_code);
    console.log('✓ Real-time "key-regenerated" event received by room members');

    // 10. Test real-time 'expense-created' event
    // Get participant IDs for group
    const { rows: parts } = await pool.query(
      'SELECT id, user_id FROM group_participants WHERE group_id = $1 ORDER BY id ASC',
      [group.id]
    );
    const partA = parts.find((p) => p.user_id === userA.id);
    const partB = parts.find((p) => p.user_id === userB.id);

    const expenseCreatedPromise = new Promise((resolve) => {
      socketA.once('expense-created', (payload) => resolve(payload));
    });

    const expenseRes = await request(
      'POST',
      `/groups/${group.id}/expenses`,
      { Authorization: `Bearer ${tokenA}` },
      {
        description: 'Dinner at Beach Shack',
        amount: 500,
        paidBy: partA.id,
        category: 'Food',
        splits: [
          { participantId: partA.id, shareAmount: 250 },
          { participantId: partB.id, shareAmount: 250 },
        ],
      }
    );
    assert.strictEqual(expenseRes.status, 201);

    const expenseEvent = await expenseCreatedPromise;
    assert.strictEqual(expenseEvent.groupId, group.id);
    assert.strictEqual(expenseEvent.expense.description, 'Dinner at Beach Shack');
    assert.strictEqual(Number(expenseEvent.expense.amount), 500);
    console.log('✓ Real-time "expense-created" event received by room members');

    // 11. Test real-time 'settlement-confirmed' event
    const settlementPromise = new Promise((resolve) => {
      socketA.once('settlement-confirmed', (payload) => resolve(payload));
    });

    const settleRes = await request(
      'POST',
      `/groups/${group.id}/settlements/confirm`,
      { Authorization: `Bearer ${tokenB}` },
      { fromParticipantId: partB.id, toParticipantId: partA.id, amount: 250 }
    );
    assert.strictEqual(settleRes.status, 201);

    const settleEvent = await settlementPromise;
    assert.strictEqual(settleEvent.groupId, group.id);
    assert.strictEqual(settleEvent.settlement.from_participant, partB.id);
    assert.strictEqual(settleEvent.settlement.to_participant, partA.id);
    console.log('✓ Real-time "settlement-confirmed" event received by room members');

    // Clean up
    await pool.query('DELETE FROM settlements WHERE group_id = $1', [group.id]);
    await pool.query('DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = $1)', [group.id]);
    await pool.query('DELETE FROM expenses WHERE group_id = $1', [group.id]);
    await pool.query('DELETE FROM group_participants WHERE group_id = $1', [group.id]);
    await pool.query('DELETE FROM groups WHERE id = $1', [group.id]);

    console.log('\nALL PHASE 7 TESTS PASSED SUCCESSFULLY!');
  } finally {
    socketA.disconnect();
    socketC.disconnect();
  }
}

run().catch((err) => {
  console.error('Phase 7 Test Failed:', err);
  process.exit(1);
});
