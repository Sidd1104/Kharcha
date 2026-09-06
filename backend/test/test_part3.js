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

async function runPart3Tests() {
  console.log('🧪 Starting PART 3 Verification Tests (split_type & live equal splits)...\n');
  const timestamp = Date.now();

  try {
    await pool.query("SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))");
    await pool.query("SELECT setval('groups_id_seq', (SELECT COALESCE(MAX(id), 1) FROM groups))");
    await pool.query("SELECT setval('group_participants_id_seq', (SELECT COALESCE(MAX(id), 1) FROM group_participants))");
    await pool.query("SELECT setval('expenses_id_seq', (SELECT COALESCE(MAX(id), 1) FROM expenses))");
  } catch (e) {}

  // 1. Create 3 test users
  const u1Res = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING *",
    [`UserA_${timestamp}`, `usera_${timestamp}@test.com`]
  );
  const userA = u1Res.rows[0];
  const tokenA = makeToken(userA);

  const u2Res = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING *",
    [`UserB_${timestamp}`, `userb_${timestamp}@test.com`]
  );
  const userB = u2Res.rows[0];
  const tokenB = makeToken(userB);

  const u3Res = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING *",
    [`UserC_${timestamp}`, `userc_${timestamp}@test.com`]
  );
  const userC = u3Res.rows[0];
  const tokenC = makeToken(userC);

  // 2. User A creates group with User B as a guest initially
  const createRes = await request('POST', '/groups', { Authorization: `Bearer ${tokenA}` }, {
    name: `Live Splits Group ${timestamp}`,
    guests: ['GuestB']
  });
  assert.strictEqual(createRes.status, 201);
  const group = createRes.body.group;

  const participants1 = (await pool.query(
    'SELECT * FROM group_participants WHERE group_id = $1 ORDER BY id ASC',
    [group.id]
  )).rows;
  const pA = participants1[0];
  const pB = participants1[1];

  // 3. User A adds an equal expense (splits omitted)
  console.log('1. Testing expense creation without splits: should have split_type = "equal"...');
  const expEqualRes = await request(
    'POST',
    `/groups/${group.id}/expenses`,
    { Authorization: `Bearer ${tokenA}` },
    {
      description: 'Dinner 200',
      amount: 200,
      paidBy: pA.id,
      category: 'Food',
    }
  );
  assert.strictEqual(expEqualRes.status, 201);
  assert.strictEqual(expEqualRes.body.expense.split_type, 'equal');
  console.log('   ✅ Expense created with split_type = "equal".');

  // 4. User A adds a custom expense (splits provided)
  console.log('2. Testing expense creation with explicit splits: should have split_type = "custom"...');
  const expCustomRes = await request(
    'POST',
    `/groups/${group.id}/expenses`,
    { Authorization: `Bearer ${tokenA}` },
    {
      description: 'Custom Snacks 90',
      amount: 90,
      paidBy: pA.id,
      category: 'Food',
      splits: [
        { participantId: pA.id, shareAmount: 30 },
        { participantId: pB.id, shareAmount: 60 },
      ],
    }
  );
  assert.strictEqual(expCustomRes.status, 201);
  assert.strictEqual(expCustomRes.body.expense.split_type, 'custom');
  console.log('   ✅ Expense created with split_type = "custom".');

  // 5. Verify GET /groups/:id/expenses returns split_type
  console.log('3. Testing GET /groups/:id/expenses: should return split_type for all items...');
  const getExpenses = await request(
    'GET',
    `/groups/${group.id}/expenses`,
    { Authorization: `Bearer ${tokenA}` }
  );
  assert.strictEqual(getExpenses.status, 200);
  const expList = getExpenses.body.expenses;
  assert.strictEqual(expList.find(e => e.description === 'Dinner 200').split_type, 'equal');
  assert.strictEqual(expList.find(e => e.description === 'Custom Snacks 90').split_type, 'custom');
  console.log('   ✅ Verified GET /groups/:id/expenses returns split_type.');

  // 6. Check initial balances with 2 members
  console.log('4. Checking initial balances with 2 members...');
  // Dinner 200 equal split across 2 members: A owes 100, B owes 100.
  // Custom Snacks 90: A owes 30, B owes 60.
  // Payer: A paid 200 + 90 = 290.
  // A owes: 100 + 30 = 130 -> Net balance for A = +160.
  // B owes: 100 + 60 = 160 -> Net balance for B = -160.
  const balRes1 = await request(
    'GET',
    `/groups/${group.id}/balances`,
    { Authorization: `Bearer ${tokenA}` }
  );
  assert.strictEqual(balRes1.status, 200);
  const balA1 = balRes1.body.balances.find(b => b.participantId === pA.id);
  const balB1 = balRes1.body.balances.find(b => b.participantId === pB.id);
  assert.strictEqual(balA1.balance, 160);
  assert.strictEqual(balB1.balance, -160);
  console.log(`   ✅ Initial balances (2 members): A = +${balA1.balance}, B = ${balB1.balance}`);

  // 7. Now a 3rd member User C joins the group via join_key!
  console.log('5. Testing LIVE recompute when 3rd member joins...');
  const joinC = await request(
    'POST',
    '/groups/join',
    { Authorization: `Bearer ${tokenC}` },
    { joinCode: group.join_code }
  );
  // Prompts candidate because of GuestB
  assert.strictEqual(joinC.status, 200);
  const confirmC = await request(
    'POST',
    `/groups/${group.id}/join/confirm`,
    { Authorization: `Bearer ${tokenC}` },
    { linkToParticipantId: null }
  );
  assert.strictEqual(confirmC.status, 200);
  const pCId = confirmC.body.participant.id;

  // 8. Fetch balances with 3 members:
  // - Dinner 200 is split EQUALLY among 3 members:
  //   200 / 3 -> 66.68 (first), 66.66, 66.66 (total = 200.00).
  // - Custom Snacks 90 REMAINS FIXED: A owes 30, B owes 60, C owes 0!
  // - A paid 290 total.
  //   A owes: 66.68 (or 66.66) + 30 = 96.68 -> Net A = +193.32 (or +193.34)
  //   B owes: 66.66 + 60 = 126.66 -> Net B = -126.66
  //   C owes: 66.66 + 0 = 66.66 -> Net C = -66.66
  // Sum of all net balances must equal 0.00!
  const balRes2 = await request(
    'GET',
    `/groups/${group.id}/balances`,
    { Authorization: `Bearer ${tokenA}` }
  );
  assert.strictEqual(balRes2.status, 200);
  const balA2 = balRes2.body.balances.find(b => b.participantId === pA.id);
  const balB2 = balRes2.body.balances.find(b => b.participantId === pB.id);
  const balC2 = balRes2.body.balances.find(b => b.participantId === pCId);

  console.log(`   ✅ Live recalculated balances (3 members):`);
  console.log(`      A = ${balA2.balance}, B = ${balB2.balance}, C = ${balC2.balance}`);

  const totalSum = Math.round((balA2.balance + balB2.balance + balC2.balance) * 100) / 100;
  assert.strictEqual(totalSum, 0, 'Total net balance must sum to 0');
  assert.strictEqual(balC2.balance, -66.66, 'New member C dynamically owes 1/3rd of equal expense without touching custom expense');
  assert.strictEqual(balB2.balance, -126.66, 'Member B owes 1/3rd of equal expense + 60 of custom expense');

  // 9. Verify settlements also reflect the live recompute
  console.log('6. Testing settlements with live recompute...');
  const settleRes = await request(
    'GET',
    `/groups/${group.id}/settlements`,
    { Authorization: `Bearer ${tokenA}` }
  );
  assert.strictEqual(settleRes.status, 200);
  const totalSettlementAmount = settleRes.body.transactions.reduce((sum, t) => sum + t.amount, 0);
  assert(Math.abs(totalSettlementAmount - balA2.balance) < 0.02, 'Total settlement transactions must square up the debtor amounts to creditor');
  console.log('   ✅ Settlements successfully derived from live equal splits.\n');

  console.log('🎉 ALL PART 3 TESTS PASSED SUCCESSFULLY!');
}

runPart3Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Part 3 Test Failure:', err);
    process.exit(1);
  });
