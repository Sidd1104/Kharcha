const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireGroupMember } = require('../middleware/membership');

const router = express.Router();
router.use(requireAuth);

// GET /groups/:groupId/expenses — list expenses for a group, most recent first
router.get('/:groupId/expenses', requireGroupMember, async (req, res) => {
  const { groupId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.amount, e.description, e.category,
              COALESCE(e.split_type, 'equal') AS split_type,
              e.created_at,
              gp.id AS paid_by_id,
              COALESCE(u.name, gp.guest_name) AS paid_by_name
       FROM expenses e
       JOIN group_participants gp ON gp.id = e.paid_by
       LEFT JOIN users u ON u.id = gp.user_id
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
// body: { description, amount, paidBy (participant_id), category, splits: [{ participantId, shareAmount }] }
// If `splits` is omitted, the amount is split equally among all active/guest participants.
router.post('/:groupId/expenses', requireGroupMember, async (req, res) => {
  const { groupId } = req.params;
  const { description, amount, paidBy, category, splits } = req.body;

  if (!description || !amount || !paidBy) {
    return res.status(400).json({ error: 'description, amount and paidBy are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const splitType = (splits && Array.isArray(splits) && splits.length > 0) ? 'custom' : 'equal';
    let finalSplits = splits;
    if (!finalSplits || finalSplits.length === 0) {
      // Equal split among all active & guest participants (not invited)
      const participantsResult = await client.query(
        "SELECT id AS participant_id FROM group_participants WHERE group_id = $1 AND status IN ('active', 'guest')",
        [groupId]
      );
      const participantIds = participantsResult.rows.map((r) => r.participant_id);
      const n = participantIds.length;
      const baseShare = Math.floor((amount / n) * 100) / 100;
      const remainder = Math.round((amount - (baseShare * n)) * 100) / 100;
      finalSplits = participantIds.map((participantId, idx) => ({
        participantId,
        shareAmount: (idx === 0) ? Math.round((baseShare + remainder) * 100) / 100 : baseShare,
      }));
    }

    const totalSplit = finalSplits.reduce((sum, s) => sum + Number(s.shareAmount), 0);
    if (Math.abs(totalSplit - Number(amount)) > 0.05) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Split amounts must add up to the total expense amount' });
    }

    const expenseResult = await client.query(
      `INSERT INTO expenses (group_id, paid_by, amount, description, category, split_type)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [groupId, paidBy, amount, description, category || 'Other', splitType]
    );
    const expense = expenseResult.rows[0];

    for (const split of finalSplits) {
      await client.query(
        'INSERT INTO expense_splits (expense_id, participant_id, share_amount) VALUES ($1, $2, $3)',
        [expense.id, split.participantId, split.shareAmount]
      );
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('expense-created', {
        groupId: Number(groupId),
        expense,
        splits: finalSplits,
      });
    }

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
