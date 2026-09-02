const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /groups/:groupId/expenses — list expenses for a group, most recent first
router.get('/:groupId/expenses', async (req, res) => {
  const { groupId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.amount, e.description, e.category, e.created_at,
              u.id AS paid_by_id, u.name AS paid_by_name
       FROM expenses e
       JOIN users u ON u.id = e.paid_by
       WHERE e.group_id = $1
       ORDER BY e.created_at DESC`,
      [groupId]
    );
    res.json({ expenses: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// POST /groups/:groupId/expenses — add an expense with a split
// body: { description, amount, paidBy, category, splits: [{ userId, shareAmount }] }
// If `splits` is omitted, the amount is split equally among all current group members.
router.post('/:groupId/expenses', async (req, res) => {
  const { groupId } = req.params;
  const { description, amount, paidBy, category, splits } = req.body;

  if (!description || !amount || !paidBy) {
    return res.status(400).json({ error: 'description, amount and paidBy are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let finalSplits = splits;
    if (!finalSplits || finalSplits.length === 0) {
      const membersResult = await client.query(
        'SELECT user_id FROM group_members WHERE group_id = $1',
        [groupId]
      );
      const memberIds = membersResult.rows.map((r) => r.user_id);
      const equalShare = Math.round((amount / memberIds.length) * 100) / 100;
      finalSplits = memberIds.map((userId) => ({ userId, shareAmount: equalShare }));
    }

    const totalSplit = finalSplits.reduce((sum, s) => sum + Number(s.shareAmount), 0);
    if (Math.abs(totalSplit - Number(amount)) > 0.05) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Split amounts must add up to the total expense amount' });
    }

    const expenseResult = await client.query(
      `INSERT INTO expenses (group_id, paid_by, amount, description, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [groupId, paidBy, amount, description, category || 'Other']
    );
    const expense = expenseResult.rows[0];

    for (const split of finalSplits) {
      await client.query(
        'INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES ($1, $2, $3)',
        [expense.id, split.userId, split.shareAmount]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ expense, splits: finalSplits });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to add expense' });
  } finally {
    client.release();
  }
});

module.exports = router;
