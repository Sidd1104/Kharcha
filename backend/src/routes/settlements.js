const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireGroupMember } = require('../middleware/membership');
const { computeBalances, computeSettlements } = require('../utils/settlement');

const router = express.Router();
router.use(requireAuth);

// Helper to compute live balances:
// - For split_type = 'custom': use stored expense_splits
// - For split_type = 'equal': ignore stored expense_splits and divide dynamically by CURRENT active/guest participant count
async function getEffectiveSplitsAndBalances(groupId) {
  const expensesResult = await pool.query(
    `SELECT id, paid_by AS participant_id, amount, COALESCE(split_type, 'equal') AS split_type
     FROM expenses WHERE group_id = $1`,
    [groupId]
  );
  const customSplitsResult = await pool.query(
    `SELECT es.expense_id, es.participant_id, es.share_amount
     FROM expense_splits es
     JOIN expenses e ON e.id = es.expense_id
     WHERE e.group_id = $1 AND COALESCE(e.split_type, 'equal') = 'custom'`,
    [groupId]
  );
  const participantsResult = await pool.query(
    `SELECT gp.id AS participant_id, gp.user_id,
            COALESCE(u.name, gp.guest_name) AS name,
            gp.status
     FROM group_participants gp
     LEFT JOIN users u ON u.id = gp.user_id
     WHERE gp.group_id = $1 AND gp.status IN ('active', 'guest')
     ORDER BY gp.id ASC`,
    [groupId]
  );

  const currentParticipants = participantsResult.rows;
  const numCurrent = currentParticipants.length;

  const effectiveSplits = [];

  // 1. For custom split expenses, use stored splits
  for (const cs of customSplitsResult.rows) {
    effectiveSplits.push({
      participant_id: cs.participant_id,
      share_amount: Number(cs.share_amount),
    });
  }

  // 2. For equal split expenses, dynamically divide among CURRENT active/guest participants
  for (const exp of expensesResult.rows) {
    if (exp.split_type === 'equal') {
      if (numCurrent > 0) {
        const totalAmount = Number(exp.amount);
        const baseShare = Math.floor((totalAmount / numCurrent) * 100) / 100;
        const remainder = Math.round((totalAmount - (baseShare * numCurrent)) * 100) / 100;

        for (let i = 0; i < numCurrent; i++) {
          const share = (i === 0) ? Math.round((baseShare + remainder) * 100) / 100 : baseShare;
          effectiveSplits.push({
            participant_id: currentParticipants[i].participant_id,
            share_amount: share,
          });
        }
      }
    }
  }

  const balancesMap = computeBalances(expensesResult.rows, effectiveSplits);

  // 3. Apply confirmed settlements: payer's balance increases (+amount), recipient's balance decreases (-amount)
  const settlementsResult = await pool.query(
    `SELECT from_participant, to_participant, amount
     FROM settlements
     WHERE group_id = $1 AND status = 'done'`,
    [groupId]
  );

  for (const s of settlementsResult.rows) {
    const amt = Number(s.amount);
    const fromId = s.from_participant;
    const toId = s.to_participant;
    balancesMap.set(fromId, Math.round(((balancesMap.get(fromId) || 0) + amt) * 100) / 100);
    balancesMap.set(toId, Math.round(((balancesMap.get(toId) || 0) - amt) * 100) / 100);
  }

  return { expenses: expensesResult.rows, participants: currentParticipants, balancesMap };
}

// GET /groups/:groupId/balances — net balance per participant (positive = owed to them)
router.get('/:groupId/balances', requireGroupMember, async (req, res) => {
  const { groupId } = req.params;
  try {
    const { participants, balancesMap } = await getEffectiveSplitsAndBalances(groupId);

    const balances = participants.map((p) => ({
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
    const { expenses, participants, balancesMap } = await getEffectiveSplitsAndBalances(groupId);
    const nameById = new Map(participants.map((p) => [p.participant_id, p.name]));

    const balances = Array.from(balancesMap.entries()).map(([participantId, balance]) => ({ participantId, balance }));

    const transactions = computeSettlements(balances).map((t) => ({
      from: t.from,
      fromName: nameById.get(t.from),
      to: t.to,
      toName: nameById.get(t.to),
      amount: t.amount,
    }));

    const hasExpenses = expenses.length > 0;
    const isSettled = hasExpenses && transactions.length === 0;

    res.json({
      transactionCount: transactions.length,
      transactions,
      hasExpenses,
      isSettled,
    });
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
    const settlement = result.rows[0];
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('settlement-confirmed', {
        groupId: Number(groupId),
        settlement,
      });
    }

    res.status(201).json({ settlement });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm settlement' });
  }
});

// POST /groups/:groupId/settlements/settle-all — settle all remaining transactions in one atomic step
router.post('/:groupId/settlements/settle-all', requireGroupMember, async (req, res) => {
  const { groupId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { participants, balancesMap } = await getEffectiveSplitsAndBalances(groupId);
    const balances = Array.from(balancesMap.entries()).map(([participantId, balance]) => ({ participantId, balance }));
    const transactions = computeSettlements(balances);

    if (transactions.length === 0) {
      await client.query('COMMIT');
      return res.json({ success: true, count: 0, message: 'All transactions are already settled' });
    }

    const settledRows = [];
    for (const t of transactions) {
      const result = await client.query(
        `INSERT INTO settlements (group_id, from_participant, to_participant, amount, status, settled_at)
         VALUES ($1, $2, $3, $4, 'done', now()) RETURNING *`,
        [groupId, t.from, t.to, t.amount]
      );
      settledRows.push(result.rows[0]);
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('settlement-confirmed', {
        groupId: Number(groupId),
        allSettled: true,
        settledCount: settledRows.length,
      });
    }

    res.status(201).json({ success: true, count: settledRows.length, settlements: settledRows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to settle all transactions' });
  } finally {
    client.release();
  }
});

module.exports = router;
