const test = require('node:test');
const assert = require('node:assert');
const { computeSettlements, computeBalances } = require('./settlement');

test('settles a simple 3-person group with minimum transactions', () => {
  // A paid 900, split equally 3 ways (300 each) -> B and C each owe A 300
  const balances = [
    { userId: 'A', balance: 600 },  // paid 900, owes 300 -> net +600
    { userId: 'B', balance: -300 },
    { userId: 'C', balance: -300 },
  ];

  const result = computeSettlements(balances);

  assert.strictEqual(result.length, 2, 'should need exactly 2 transactions');
  const total = result.reduce((sum, t) => sum + t.amount, 0);
  assert.strictEqual(total, 600, 'total settled amount should match total owed');
});

test('produces fewer transactions than naive pairwise settling for 4 people', () => {
  const balances = [
    { userId: 'A', balance: 1000 },
    { userId: 'B', balance: 500 },
    { userId: 'C', balance: -700 },
    { userId: 'D', balance: -800 },
  ];

  const result = computeSettlements(balances);

  // Naive pairwise (everyone settles with everyone) could take up to n-1 = 3
  // transactions for 4 people in the worst case; greedy should hit that here.
  assert.ok(result.length <= 3, 'should not exceed n-1 transactions');

  // Verify the settlement actually balances everything to zero
  const net = new Map();
  for (const b of balances) net.set(b.userId, b.balance);
  for (const t of result) {
    net.set(t.from, net.get(t.from) + t.amount);
    net.set(t.to, net.get(t.to) - t.amount);
  }
  for (const [, bal] of net) {
    assert.ok(Math.abs(bal) < 0.01, 'every balance should be settled to ~0');
  }
});

test('returns no transactions when everyone is already settled', () => {
  const balances = [
    { userId: 'A', balance: 0 },
    { userId: 'B', balance: 0.001 }, // floating point noise
  ];
  const result = computeSettlements(balances);
  assert.strictEqual(result.length, 0);
});

test('computeBalances derives correct net balances from expenses and splits', () => {
  const expenses = [
    { paid_by: 1, amount: 900 },
  ];
  const splits = [
    { expense_id: 1, user_id: 1, share_amount: 300 },
    { expense_id: 1, user_id: 2, share_amount: 300 },
    { expense_id: 1, user_id: 3, share_amount: 300 },
  ];

  const balances = computeBalances(expenses, splits);

  assert.strictEqual(balances.get(1), 600); // paid 900, owes 300
  assert.strictEqual(balances.get(2), -300);
  assert.strictEqual(balances.get(3), -300);
});
