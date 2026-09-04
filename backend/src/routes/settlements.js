const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireGroupMember } = require('../middleware/membership');
const { computeBalances, computeSettlements } = require('../utils/settlement');

const router = express.Router();
router.use(requireAuth);

// GET /groups/:groupId/balances — net balance per participant (positive = owed to them)
router.get('/:groupId/balances', requireGroupMember, async (req, res) => {
  const { groupId } = req.params;
  try {
    const expensesResult = await pool.query(
      'SELECT paid_by AS participant_id, amount FROM expenses WHERE group_id = $1',
      [groupId]
    );
    const splitsResult = await pool.query(
      `SELECT es.participant_id, es.share_amount
       FROM expense_splits es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = $1`,
      [groupId]
    );
    const participantsResult = await pool.query(
      `SELECT gp.id AS participant_id, gp.user_id,
              COALESCE(u.name, gp.guest_name) AS name,
              gp.status
       FROM group_participants gp
       LEFT JOIN users u ON u.id = gp.user_id
       WHERE gp.group_id = $1 AND gp.status IN ('active', 'guest')`,
      [groupId]
    );

    const balancesMap = computeBalances(expensesResult.rows, splitsResult.rows);

    const balances = participantsResult.rows.map((p) => ({
      participantId: p.participant_id,
      userId: p.user_id,
      name: p.name,
      balance: balancesMap.get(p.participant_id) || 0,
    }));

    res.json({ balances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute balances' });
  }
});

// GET /groups/:groupId/settlements — minimal transaction list to settle the group
router.get('/:groupId/settlements', requireGroupMember, async (req, res) => {
  const { groupId } = req.params;
  try {
    const expensesResult = await pool.query(
      'SELECT paid_by AS participant_id, amount FROM expenses WHERE group_id = $1',
      [groupId]
    );
    const splitsResult = await pool.query(
      `SELECT es.participant_id, es.share_amount
       FROM expense_splits es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = $1`,
      [groupId]
    );
    const participantsResult = await pool.query(
      `SELECT gp.id AS participant_id,
              COALESCE(u.name, gp.guest_name) AS name
       FROM group_participants gp
       LEFT JOIN users u ON u.id = gp.user_id
       WHERE gp.group_id = $1 AND gp.status IN ('active', 'guest')`,
      [groupId]
    );
    const nameById = new Map(participantsResult.rows.map((p) => [p.participant_id, p.name]));

    const balancesMap = computeBalances(expensesResult.rows, splitsResult.rows);
    const balances = Array.from(balancesMap.entries()).map(([participantId, balance]) => ({ participantId, balance }));

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
// body: { fromParticipantId, toParticipantId, amount }
router.post('/:groupId/settlements/confirm', requireGroupMember, async (req, res) => {
  const { groupId } = req.params;
  const { fromParticipantId, toParticipantId, amount } = req.body;

  if (!fromParticipantId || !toParticipantId || !amount) {
    return res.status(400).json({ error: 'fromParticipantId, toParticipantId and amount are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO settlements (group_id, from_participant, to_participant, amount, status, settled_at)
       VALUES ($1, $2, $3, $4, 'done', now()) RETURNING *`,
      [groupId, fromParticipantId, toParticipantId, amount]
    );
    res.status(201).json({ settlement: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm settlement' });
  }
});

module.exports = router;
