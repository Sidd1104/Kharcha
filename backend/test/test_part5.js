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

async function runPart5Tests() {
  console.log('🧪 Starting PART 5 Verification Tests (Custom split proportional rebalance & equal split skip)...\n');
  const timestamp = Date.now();

  try {
    await pool.query("SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))");
    await pool.query("SELECT setval('groups_id_seq', (SELECT COALESCE(MAX(id), 1) FROM groups))");
    await pool.query("SELECT setval('group_participants_id_seq', (SELECT COALESCE(MAX(id), 1) FROM group_participants))");
    await pool.query("SELECT setval('expenses_id_seq', (SELECT COALESCE(MAX(id), 1) FROM expenses))");
  } catch (e) {}

  // 1. Create 4 test users (A: creator, B, C, D: members)
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

  const u3Res = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING *",
    [`UserC_${timestamp}`, `userc_${timestamp}@test.com`]
  );
  const userC = u3Res.rows[0];

  const u4Res = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'dummy') RETURNING *",
    [`UserD_${timestamp}`, `userd_${timestamp}@test.com`]
  );
  const userD = u4Res.rows[0];

  // 2. User A creates group with guests B, C, D
  const createRes = await request('POST', '/groups', { Authorization: `Bearer ${tokenA}` }, {
    name: `Custom Rebalance Group ${timestamp}`,
    guests: ['MemberB', 'MemberC', 'MemberD']
  });
  assert.strictEqual(createRes.status, 201);
  const group = createRes.body.group;

  const participants = (await pool.query(
    'SELECT * FROM group_participants WHERE group_id = $1 ORDER BY id ASC',
    [group.id]
  )).rows;
  const pA = participants[0];
  const pB = participants[1];
  const pC = participants[2];
  const pD = participants[3];

  // =========================================================================
  // Test 1: Custom-split expense with 3 participants in an uneven ratio
  // =========================================================================
  console.log('1. Creating custom-split expense of $1200 split among B (200), C (600), D (400)...');
  // Ratio between B and C is 200 : 600 = 1 : 3
  const expRes = await request('POST', `/groups/${group.id}/expenses`, { Authorization: `Bearer ${tokenA}` }, {
    amount: 1200,
    description: 'Uneven Custom Expense',
    category: 'Food',
    paidBy: pA.id,
    splits: [
      { participantId: pB.id, shareAmount: 200 },
      { participantId: pC.id, shareAmount: 600 },
      { participantId: pD.id, shareAmount: 400 },
    ],
  });
  assert.strictEqual(expRes.status, 201);
  const customExpense = expRes.body.expense;
  assert.strictEqual(customExpense.split_type, 'custom');
  console.log('   ✅ Expense created with split_type = "custom".');

  // Verify initial splits
  const initialSplits = (await pool.query(
    'SELECT participant_id, share_amount FROM expense_splits WHERE expense_id = $1 ORDER BY participant_id ASC',
    [customExpense.id]
  )).rows;
  assert.strictEqual(initialSplits.length, 3);
  console.log('   Initial splits:', initialSplits.map(s => `${s.participant_id}: ${s.share_amount}`).join(', '));

  // Now remove participant D
  console.log('\n2. Removing participant D (share 400)...');
  const removeRes = await request('POST', `/groups/${group.id}/participants/remove`, { Authorization: `Bearer ${tokenA}` }, {
    participantId: pD.id,
  });
  assert.strictEqual(removeRes.status, 200);
  console.log('   ✅ Participant D removed successfully.');

  // Fetch updated splits
  const updatedSplits = (await pool.query(
    'SELECT participant_id, share_amount FROM expense_splits WHERE expense_id = $1 ORDER BY participant_id ASC',
    [customExpense.id]
  )).rows;

  console.log('   Updated splits:', updatedSplits.map(s => `${s.participant_id}: ${s.share_amount}`).join(', '));
  assert.strictEqual(updatedSplits.length, 2, 'Should have exactly 2 remaining splits');

  const bSplit = updatedSplits.find(s => s.participant_id === pB.id);
  const cSplit = updatedSplits.find(s => s.participant_id === pC.id);
  assert.ok(bSplit && cSplit, 'Both B and C must have remaining splits');

  const bShare = Number(bSplit.share_amount);
  const cShare = Number(cSplit.share_amount);

  // Assert sum to full expense amount
  const sumShares = Math.round((bShare + cShare) * 100) / 100;
  console.log(`   Sum of remaining shares: ${bShare} + ${cShare} = ${sumShares}`);
  assert.strictEqual(sumShares, 1200, 'Sum of remaining shares must equal full expense amount (1200)');

  // Assert NOT equal
  assert.notStrictEqual(bShare, cShare, 'Remaining shares must NOT be flattened to equal');

  // Assert SAME ratio as before: B/C was 200/600 = 1/3 (0.333333...)
  // B new should be 1200 * (200 / 800) = 300
  // C new should be 1200 * (600 / 800) = 900
  assert.strictEqual(bShare, 300, 'B share should be proportionally rebalanced to 300');
  assert.strictEqual(cShare, 900, 'C share should be proportionally rebalanced to 900');
  const ratio = Math.round((bShare / cShare) * 1000) / 1000;
  assert.strictEqual(ratio, Math.round((200 / 600) * 1000) / 1000, 'Ratio between B and C must be preserved (1:3)');
  console.log('   ✅ Proportional reallocation verified: B = 300, C = 900 (ratio 1:3 preserved, sum = 1200).');

  // =========================================================================
  // Test 2: Equal split expense — verify stored splits rebalancing is skipped
  // =========================================================================
  console.log('\n3. Testing equal-split expense when a member is removed...');
  const equalExpRes = await request('POST', `/groups/${group.id}/expenses`, { Authorization: `Bearer ${tokenA}` }, {
    amount: 300,
    description: 'Equal Split Expense',
    category: 'Travel',
    paidBy: pA.id,
  });
  assert.strictEqual(equalExpRes.status, 201);
  const equalExpense = equalExpRes.body.expense;
  assert.strictEqual(equalExpense.split_type, 'equal');

  // Balances with 3 members (A, B, C):
  // A paid 1200 (custom) + 300 (equal).
  // Custom: B owes 300, C owes 900.
  // Equal (300 across 3): each owes 100.
  // Total B owes: 300 + 100 = 400.
  // Total C owes: 900 + 100 = 1000.
  // Total A net: +1400.
  const balRes1 = await request('GET', `/groups/${group.id}/balances`, { Authorization: `Bearer ${tokenA}` });
  assert.strictEqual(balRes1.status, 200);
  const balMap1 = new Map(balRes1.body.balances.map(b => [b.participantId, Number(b.balance)]));
  console.log('   Balances with 3 members:', Object.fromEntries(balMap1));
  assert.strictEqual(balMap1.get(pA.id), 1400);
  assert.strictEqual(balMap1.get(pB.id), -400);
  assert.strictEqual(balMap1.get(pC.id), -1000);

  // Remove member C
  console.log('\n4. Removing member C...');
  const removeCRes = await request('POST', `/groups/${group.id}/participants/remove`, { Authorization: `Bearer ${tokenA}` }, {
    participantId: pC.id,
  });
  assert.strictEqual(removeCRes.status, 200);
  console.log('   ✅ Member C removed.');

  // For custom expense: C was holding 900. Now B is the ONLY remaining split on the custom expense!
  // B must receive 100% of the 1200.
  const finalCustomSplits = (await pool.query(
    'SELECT participant_id, share_amount FROM expense_splits WHERE expense_id = $1',
    [customExpense.id]
  )).rows;
  assert.strictEqual(finalCustomSplits.length, 1);
  assert.strictEqual(Number(finalCustomSplits[0].share_amount), 1200);
  console.log('   ✅ Custom expense 100% allocated to sole remaining participant B (1200).');

  // Balances with 2 members (A, B):
  // Equal expense (300 across 2 members A, B): each owes 150.
  // Custom expense (1200): B owes 1200.
  // Net B: -1200 - 150 = -1350.
  // Net A: +1350.
  const balRes2 = await request('GET', `/groups/${group.id}/balances`, { Authorization: `Bearer ${tokenA}` });
  assert.strictEqual(balRes2.status, 200);
  const balMap2 = new Map(balRes2.body.balances.map(b => [b.participantId, Number(b.balance)]));
  console.log('   Balances with 2 members:', Object.fromEntries(balMap2));
  assert.strictEqual(balMap2.get(pA.id), 1350);
  assert.strictEqual(balMap2.get(pB.id), -1350);
  console.log('   ✅ Equal split dynamically recomputed to 150 each, total net matches perfectly.');

  // =========================================================================
  // Test 3: Edge case: departing participant was sole split on custom expense
  // =========================================================================
  console.log('\n5. Testing edge case: departing participant was the sole split on custom expense...');
  // Create another guest
  const guestRes = await request('POST', `/groups/${group.id}/participants/guest`, { Authorization: `Bearer ${tokenA}` }, {
    name: 'TemporaryGuest'
  });
  assert.strictEqual(guestRes.status, 201);
  const tempGuestId = guestRes.body.participant.participant_id;

  // Create custom expense split ONLY on tempGuest
  const soleExpRes = await request('POST', `/groups/${group.id}/expenses`, { Authorization: `Bearer ${tokenA}` }, {
    amount: 50,
    description: 'Sole split expense',
    category: 'Other',
    paidBy: pA.id,
    splits: [{ participantId: tempGuestId, shareAmount: 50 }],
  });
  assert.strictEqual(soleExpRes.status, 201);
  const soleExpId = soleExpRes.body.expense.id;

  // Remove tempGuest
  const removeGuestRes = await request('POST', `/groups/${group.id}/participants/remove`, { Authorization: `Bearer ${tokenA}` }, {
    participantId: tempGuestId,
  });
  assert.strictEqual(removeGuestRes.status, 200);

  // Confirm empty expense was deleted
  const checkExp = await pool.query('SELECT * FROM expenses WHERE id = $1', [soleExpId]);
  assert.strictEqual(checkExp.rows.length, 0, 'Expense with 0 remaining splits should be deleted');
  console.log('   ✅ Empty custom expense cleanly deleted.');

  // Cleanup test group
  await pool.query('DELETE FROM groups WHERE id = $1', [group.id]);

  console.log('\n🎉 ALL PART 5 TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runPart5Tests().catch((err) => {
  console.error('\n❌ PART 5 TEST FAILED:', err);
  process.exit(1);
});
