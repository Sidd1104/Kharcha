const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { computeBalances, computeSettlements } = require('../utils/settlement');

const router = express.Router();
router.use(requireAuth);

// GET /groups/:groupId/balances — net balance per member (positive = owed to them)
router.get('/:groupId/balances', async (req, res) => {
  const { groupId } = req.params;
  try {
    const expensesResult = await pool.query(
      'SELECT paid_by, amount FROM expenses WHERE group_id = $1',
      [groupId]
    );
    const splitsResult = await pool.query(
      `SELECT es.user_id, es.share_amount
       FROM expense_splits es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = $1`,
      [groupId]
    );
    const membersResult = await pool.query(
      `SELECT u.id, u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = $1`,
      [groupId]
    );

    const balancesMap = computeBalances(expensesResult.rows, splitsResult.rows);

    const balances = membersResult.rows.map((member) => ({
      userId: member.id,
      name: member.name,
      balance: balancesMap.get(member.id) || 0,
    }));

    res.json({ balances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute balances' });
  }
});

// GET /groups/:groupId/settlements — minimal transaction list to settle the group
router.get('/:groupId/settlements', async (req, res) => {
  const { groupId } = req.params;
  try {
    const expensesResult = await pool.query(
      'SELECT paid_by, amount FROM expenses WHERE group_id = $1',
      [groupId]
    );
    const splitsResult = await pool.query(
      `SELECT es.user_id, es.share_amount
       FROM expense_splits es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = $1`,
      [groupId]
    );
    const membersResult = await pool.query(
      `SELECT u.id, u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = $1`,
      [groupId]
    );
    const nameById = new Map(membersResult.rows.map((m) => [m.id, m.name]));

    const balancesMap = computeBalances(expensesResult.rows, splitsResult.rows);
    const balances = Array.from(balancesMap.entries()).map(([userId, balance]) => ({ userId, balance }));

    const transactions = computeSettlements(balances).map((t) => ({
      from: t.from,
      fromName: nameById.get(t.from),
      to: t.to,
      toName: nameById.get(t.to),
      amount: t.amount,
    }));

    res.json({ transactionCount: transactions.length, transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute settlements' });
  }
});

// POST /groups/:groupId/settlements/confirm — record a settlement as paid
// body: { fromUserId, toUserId, amount }
router.post('/:groupId/settlements/confirm', async (req, res) => {
  const { groupId } = req.params;
  const { fromUserId, toUserId, amount } = req.body;

  if (!fromUserId || !toUserId || !amount) {
    return res.status(400).json({ error: 'fromUserId, toUserId and amount are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO settlements (group_id, from_user, to_user, amount, status, settled_at)
       VALUES ($1, $2, $3, $4, 'done', now()) RETURNING *`,
      [groupId, fromUserId, toUserId, amount]
    );
    res.status(201).json({ settlement: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm settlement' });
  }
});

module.exports = router;
