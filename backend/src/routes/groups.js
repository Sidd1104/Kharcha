const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireGroupMember } = require('../middleware/membership');
const { generateJoinCode } = require('../utils/joinCode');

const router = express.Router();
router.use(requireAuth);

const joinLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => String(req.user.id),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many join attempts. Please wait a few minutes before trying again.'
    });
  }
});

// GET /groups — list all groups the logged-in user belongs to (as active participant)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.id, g.name, g.icon, g.created_at,
              (SELECT COUNT(*) FROM group_participants gp2 WHERE gp2.group_id = g.id AND gp2.status IN ('active', 'guest')) AS member_count,
              (SELECT COUNT(*) FROM expenses e WHERE e.group_id = g.id) AS expense_count
       FROM groups g
       JOIN group_participants gp ON gp.group_id = g.id
       WHERE gp.user_id = $1 AND gp.status = 'active'
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json({ groups: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// POST /groups — create a new group (creator is auto-added as participant)
// body: { name, icon?, guests?: string[] }
router.post('/', async (req, res) => {
  const { name, icon, guests } = req.body;
  if (!name) return res.status(400).json({ error: 'Group name is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const groupResult = await client.query(
      'INSERT INTO groups (name, icon, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, icon || 'wallet', req.user.id]
    );
    const group = groupResult.rows[0];

    // Add creator as active participant
    await client.query(
      'INSERT INTO group_participants (group_id, user_id, guest_name, status) VALUES ($1, $2, $3, $4)',
      [group.id, req.user.id, req.user.name || null, 'active']
    );

    // Add guest participants
    if (Array.isArray(guests)) {
      for (const guestName of guests) {
        if (guestName && guestName.trim()) {
          await client.query(
            'INSERT INTO group_participants (group_id, guest_name, status) VALUES ($1, $2, $3)',
            [group.id, guestName.trim(), 'guest']
          );
        }
      }
    }

    // Generate unique 6-digit join code and update group row before commit
    const joinCode = await generateJoinCode(client);
    await client.query(
      'UPDATE groups SET join_code = $1, join_code_active = true WHERE id = $2',
      [joinCode, group.id]
    );
    group.join_code = joinCode;
    group.join_code_active = true;

    await client.query('COMMIT');
    res.status(201).json({ group });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Group creation error:', err);
    res.status(500).json({ error: err.message || 'Failed to create group' });
  } finally {
    client.release();
  }
});

// POST /groups/join — join group via 6-digit join key
router.post('/join', joinLimiter, async (req, res) => {
  const { joinCode } = req.body;

  // 1. Input validation
  const sanitizedCode = typeof joinCode === 'string' ? joinCode.trim() : (joinCode ? String(joinCode).trim() : '');
  if (!/^\d{6}$/.test(sanitizedCode)) {
    return res.status(400).json({ error: 'Join code must be a 6-digit number' });
  }

  console.log(`[Join] User ${req.user.id} (${req.user.email}) attempting to join with code "${sanitizedCode}"`);

  try {
    // 2. Lookup group
    const { rows: groupRows } = await pool.query(
      'SELECT * FROM groups WHERE join_code = $1 AND join_code_active = true',
      [sanitizedCode]
    );
    const group = groupRows[0];
    if (!group) {
      return res.status(404).json({
        error: 'Invalid or expired join code. Ask the group creator for a new one.'
      });
    }

    // 3. Check existing membership
    const { rows: participantRows } = await pool.query(
      'SELECT * FROM group_participants WHERE group_id = $1 AND user_id = $2',
      [group.id, req.user.id]
    );
    const existing = participantRows[0];

    if (existing) {
      if (existing.status === 'active') {
        return res.status(200).json({
          group: {
            id: group.id,
            name: group.name,
            icon: group.icon,
            join_code: group.join_code
          },
          participant: {
            id: existing.id,
            group_id: existing.group_id,
            user_id: existing.user_id,
            status: existing.status
          },
          alreadyMember: true,
          message: 'You are already a member of this group'
        });
      }

      if (existing.status === 'invited') {
        const updateResult = await pool.query(
          "UPDATE group_participants SET status = 'active', invite_email = NULL WHERE id = $1 RETURNING *",
          [existing.id]
        );
        const participant = updateResult.rows[0];

        // Audit log / event prep for Phase 7
        const io = req.app.get('io');
        if (io) {
          io.to(`group:${group.id}`).emit('member-joined', {
            groupId: group.id,
            participant: {
              id: participant.id,
              userId: req.user.id,
              name: req.user.name,
              email: req.user.email
            }
          });
        }

        return res.status(200).json({
          group: {
            id: group.id,
            name: group.name,
            icon: group.icon,
            join_code: group.join_code
          },
          participant: {
            id: participant.id,
            group_id: participant.group_id,
            user_id: participant.user_id,
            status: participant.status
          },
          alreadyMember: false,
          message: 'Successfully joined the group!'
        });
      }

      // If status is guest/inactive/other, activate
      const updateResult = await pool.query(
        "UPDATE group_participants SET status = 'active' WHERE id = $1 RETURNING *",
        [existing.id]
      );
      const participant = updateResult.rows[0];

      const io = req.app.get('io');
      if (io) {
        io.to(`group:${group.id}`).emit('member-joined', {
          groupId: group.id,
          participant: {
            id: participant.id,
            userId: req.user.id,
            name: req.user.name,
            email: req.user.email
          }
        });
      }

      return res.status(200).json({
        group: {
          id: group.id,
          name: group.name,
          icon: group.icon,
          join_code: group.join_code
        },
        participant: {
          id: participant.id,
          group_id: participant.group_id,
          user_id: participant.user_id,
          status: participant.status
        },
        alreadyMember: false,
        message: 'Successfully joined the group!'
      });
    }

    // 3.5 Check for unlinked guest candidates
    const { rows: candidates } = await pool.query(
      "SELECT id, guest_name FROM group_participants WHERE group_id = $1 AND user_id IS NULL AND status = 'guest' ORDER BY id ASC",
      [group.id]
    );

    if (candidates.length > 0) {
      console.log(`[Join] Group ${group.id} ("${group.name}") has ${candidates.length} unlinked candidate(s). Returning requiresLinkChoice: true`);
      return res.status(200).json({
        requiresLinkChoice: true,
        group: {
          id: group.id,
          name: group.name,
          icon: group.icon,
          join_code: group.join_code,
        },
        candidates: candidates.map((c) => ({
          participantId: c.id,
          guestName: c.guest_name,
        })),
      });
    }

    // 4. New participant insertion (no unlinked candidates)
    const insertResult = await pool.query(
      "INSERT INTO group_participants (group_id, user_id, guest_name, status, joined_via) VALUES ($1, $2, $3, 'active', 'join_key') RETURNING *",
      [group.id, req.user.id, req.user.name || null]
    );
    const participant = insertResult.rows[0];

    // 5. Audit log / event prep for Phase 7
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${group.id}`).emit('member-joined', {
        groupId: group.id,
        participant: {
          id: participant.id,
          userId: req.user.id,
          name: req.user.name,
          email: req.user.email
        }
      });
    }

    // 6. Response
    return res.status(200).json({
      group: {
        id: group.id,
        name: group.name,
        icon: group.icon,
        join_code: group.join_code
      },
      participant: {
        id: participant.id,
        group_id: participant.group_id,
        user_id: participant.user_id,
        status: participant.status
      },
      alreadyMember: false,
      message: 'Successfully joined the group!'
    });
  } catch (err) {
    console.error('Join group error:', err);
    return res.status(500).json({ error: 'Failed to join group' });
  }
});

// POST /groups/:id/join/confirm — confirm joining group with account linking choice
router.post('/:id/join/confirm', joinLimiter, async (req, res) => {
  const { id } = req.params;
  const { linkToParticipantId } = req.body;

  console.log(`[Join Confirm] User ${req.user.id} (${req.user.email}) confirming join for group ${id} (linkToParticipantId: ${linkToParticipantId})`);

  try {
    const { rows: groupRows } = await pool.query('SELECT * FROM groups WHERE id = $1', [id]);
    const group = groupRows[0];
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check existing active membership
    const { rows: participantRows } = await pool.query(
      'SELECT * FROM group_participants WHERE group_id = $1 AND user_id = $2',
      [group.id, req.user.id]
    );
    const existing = participantRows[0];

    if (existing && existing.status === 'active') {
      return res.status(200).json({
        group: {
          id: group.id,
          name: group.name,
          icon: group.icon,
          join_code: group.join_code,
        },
        participant: {
          id: existing.id,
          group_id: existing.group_id,
          user_id: existing.user_id,
          status: existing.status,
        },
        alreadyMember: true,
        message: 'You are already a member of this group',
      });
    }

    let participant;

    if (linkToParticipantId !== undefined && linkToParticipantId !== null) {
      // User chose to link to an unlinked guest candidate
      const targetId = Number(linkToParticipantId);
      const { rows: candidateRows } = await pool.query(
        'SELECT * FROM group_participants WHERE id = $1 AND group_id = $2',
        [targetId, group.id]
      );
      const candidate = candidateRows[0];

      if (!candidate) {
        return res.status(404).json({ error: 'Selected participant not found in this group' });
      }
      if (candidate.user_id !== null) {
        return res.status(400).json({ error: 'This participant is already linked to another user account' });
      }

      // If user had an invited or inactive record, clean it up before linking
      if (existing) {
        await pool.query('DELETE FROM group_participants WHERE id = $1', [existing.id]);
      }

      // Update participant to link user_id and set status = 'active', joined_via = 'join_key'
      // Keep guest_name intact as display fallback
      const updateResult = await pool.query(
        "UPDATE group_participants SET user_id = $1, status = 'active', joined_via = 'join_key' WHERE id = $2 RETURNING *",
        [req.user.id, candidate.id]
      );
      participant = updateResult.rows[0];
    } else {
      // User chose "No, add me as a new member"
      const insertResult = await pool.query(
        "INSERT INTO group_participants (group_id, user_id, guest_name, status, joined_via) VALUES ($1, $2, $3, 'active', 'join_key') RETURNING *",
        [group.id, req.user.id, req.user.name || null]
      );
      participant = insertResult.rows[0];
    }

    // Audit log / event prep
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${group.id}`).emit('member-joined', {
        groupId: group.id,
        participant: {
          id: participant.id,
          userId: req.user.id,
          name: req.user.name,
          email: req.user.email,
        },
      });
    }

    return res.status(200).json({
      group: {
        id: group.id,
        name: group.name,
        icon: group.icon,
        join_code: group.join_code,
      },
      participant: {
        id: participant.id,
        group_id: participant.group_id,
        user_id: participant.user_id,
        status: participant.status,
      },
      alreadyMember: false,
      message: 'Successfully joined the group!',
    });
  } catch (err) {
    console.error('Confirm join error:', err);
    return res.status(500).json({ error: 'Failed to confirm group join' });
  }
});

// POST /groups/:id/participants/merge — host-only manual merge of an unlinked guest into an active member
router.post('/:id/participants/merge', requireGroupMember, async (req, res) => {
  const { id } = req.params;
  const { unlinkedParticipantId, targetParticipantId } = req.body;

  if (!unlinkedParticipantId || !targetParticipantId) {
    return res.status(400).json({ error: 'Both unlinkedParticipantId and targetParticipantId are required' });
  }

  const unlinkedId = Number(unlinkedParticipantId);
  const targetId = Number(targetParticipantId);

  if (unlinkedId === targetId) {
    return res.status(400).json({ error: 'Cannot merge a participant into itself' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify group and authorization: caller must be group.created_by
    const groupResult = await client.query('SELECT * FROM groups WHERE id = $1', [id]);
    const group = groupResult.rows[0];
    if (!group) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.created_by !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the group host can merge participants' });
    }

    // 2. Validate unlinked participant: must belong to this group and user_id IS NULL
    const unlinkedRes = await client.query(
      'SELECT * FROM group_participants WHERE id = $1 AND group_id = $2',
      [unlinkedId, id]
    );
    const unlinked = unlinkedRes.rows[0];
    if (!unlinked) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Unlinked participant not found in this group' });
    }
    if (unlinked.user_id !== null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'unlinkedParticipantId is already linked to a user account' });
    }

    // 3. Validate target participant: must belong to this group and user_id IS NOT NULL
    const targetRes = await client.query(
      'SELECT * FROM group_participants WHERE id = $1 AND group_id = $2',
      [targetId, id]
    );
    const target = targetRes.rows[0];
    if (!target) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Target participant not found in this group' });
    }
    if (target.user_id === null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'targetParticipantId must be a registered linked member' });
    }

    // 4. Update expenses paid by unlinked participant to target participant
    await client.query(
      'UPDATE expenses SET paid_by = $1 WHERE paid_by = $2 AND group_id = $3',
      [targetId, unlinkedId, id]
    );

    // 5. Handle expense_splits with collision detection for UNIQUE(expense_id, participant_id)
    const collisionRes = await client.query(
      `SELECT es_unlinked.id AS unlinked_split_id,
              es_unlinked.share_amount AS unlinked_share,
              es_target.id AS target_split_id,
              es_target.share_amount AS target_share
       FROM expense_splits es_unlinked
       JOIN expense_splits es_target
         ON es_target.expense_id = es_unlinked.expense_id
        AND es_target.participant_id = $1
       WHERE es_unlinked.participant_id = $2`,
      [targetId, unlinkedId]
    );

    for (const col of collisionRes.rows) {
      const combinedShare = Math.round((Number(col.target_share) + Number(col.unlinked_share)) * 100) / 100;
      await client.query(
        'UPDATE expense_splits SET share_amount = $1 WHERE id = $2',
        [combinedShare, col.target_split_id]
      );
      await client.query(
        'DELETE FROM expense_splits WHERE id = $1',
        [col.unlinked_split_id]
      );
    }

    // Update remaining splits of unlinked participant (where no collision existed)
    await client.query(
      'UPDATE expense_splits SET participant_id = $1 WHERE participant_id = $2',
      [targetId, unlinkedId]
    );

    // 6. Update settlements involving unlinked participant
    await client.query(
      'UPDATE settlements SET from_participant = $1 WHERE from_participant = $2 AND group_id = $3',
      [targetId, unlinkedId, id]
    );
    await client.query(
      'UPDATE settlements SET to_participant = $1 WHERE to_participant = $2 AND group_id = $3',
      [targetId, unlinkedId, id]
    );
    await client.query(
      'DELETE FROM settlements WHERE from_participant = to_participant AND group_id = $1',
      [id]
    );

    // 7. Delete the now-empty unlinked participant row
    await client.query(
      'DELETE FROM group_participants WHERE id = $1 AND group_id = $2',
      [unlinkedId, id]
    );

    await client.query('COMMIT');

    // 8. Real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${id}`).emit('members-merged', {
        groupId: Number(id),
        unlinkedParticipantId: unlinkedId,
        targetParticipantId: targetId,
      });
      // Also emit member-joined for backward compatibility
      io.to(`group:${id}`).emit('member-joined', {
        groupId: Number(id),
        participant: {
          id: target.id,
          userId: target.user_id,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Participants merged successfully',
      unlinkedParticipantId: unlinkedId,
      targetParticipantId: targetId,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Participant merge error:', err);
    return res.status(500).json({ error: err.message || 'Failed to merge participants' });
  } finally {
    client.release();
  }
});

// GET /groups/:id — group detail with participants
router.get('/:id', requireGroupMember, async (req, res) => {
  const { id } = req.params;
  try {
    const groupResult = await pool.query('SELECT * FROM groups WHERE id = $1', [id]);
    const group = groupResult.rows[0];
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const participantsResult = await pool.query(
      `SELECT gp.id AS participant_id,
              gp.user_id,
              COALESCE(u.name, gp.guest_name) AS name,
              COALESCE(u.email, gp.invite_email) AS email,
              gp.status,
              gp.joined_via,
              CASE
                WHEN gp.user_id IS NOT NULL AND gp.status = 'active' THEN 'user'
                WHEN gp.status = 'invited' THEN 'invited'
                ELSE 'guest'
              END AS type,
              CASE WHEN gp.user_id = g.created_by THEN 1 ELSE 0 END AS is_creator,
              (SELECT COUNT(*) FROM expenses e WHERE e.paid_by = gp.id) AS expense_paid_count,
              (SELECT COUNT(*) FROM expense_splits es WHERE es.participant_id = gp.id) AS split_count
       FROM group_participants gp
       JOIN groups g ON g.id = gp.group_id
       LEFT JOIN users u ON u.id = gp.user_id
       WHERE gp.group_id = $1
       ORDER BY gp.added_at ASC`,
      [id]
    );

    const participants = participantsResult.rows.map((p) => ({
      ...p,
      is_creator: Boolean(p.is_creator),
      expense_paid_count: Number(p.expense_paid_count || 0),
      split_count: Number(p.split_count || 0),
    }));

    res.json({ group, participants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// POST /groups/:id/participants/guest — add a guest participant (no account needed)
router.post('/:id/participants/guest', requireGroupMember, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Guest name is required' });

  try {
    const result = await pool.query(
      'INSERT INTO group_participants (group_id, guest_name, status) VALUES ($1, $2, $3) RETURNING *',
      [id, name.trim(), 'guest']
    );
    const participant = result.rows[0];
    res.status(201).json({
      participant: {
        participant_id: participant.id,
        user_id: null,
        name: participant.guest_name,
        email: null,
        status: 'guest',
        type: 'guest',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add guest' });
  }
});

// Helper function to remove participants from a group
async function handleRemoveParticipants(req, res) {
  const { id } = req.params;
  const rawIds = req.params.participantId
    ? [Number(req.params.participantId)]
    : Array.isArray(req.body.participantIds)
    ? req.body.participantIds.map(Number)
    : req.body.participantId
    ? [Number(req.body.participantId)]
    : [];

  const uniqueIds = Array.from(new Set(rawIds.filter((pid) => !isNaN(pid) && pid > 0)));
  if (uniqueIds.length === 0) {
    return res.status(400).json({ error: 'No valid members specified to remove' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify group exists
    const groupResult = await client.query('SELECT * FROM groups WHERE id = $1', [id]);
    const group = groupResult.rows[0];
    if (!group) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group not found' });
    }

    // 2. Check authorization: caller must be creator or active member of this group
    const callerParticipant = await client.query(
      'SELECT id FROM group_participants WHERE group_id = $1 AND user_id = $2 AND status = $3',
      [id, req.user.id, 'active']
    );
    if (!callerParticipant.rows[0] && group.created_by !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You are not authorized to manage members of this group' });
    }

    // 3. Fetch the participants to remove
    const placeholders = uniqueIds.map((_, i) => `$${i + 2}`).join(', ');
    const toRemoveResult = await client.query(
      `SELECT gp.id, gp.user_id, gp.guest_name, gp.invite_email, gp.status, u.name AS user_name
       FROM group_participants gp
       LEFT JOIN users u ON u.id = gp.user_id
       WHERE gp.group_id = $1 AND gp.id IN (${placeholders})`,
      [id, ...uniqueIds]
    );

    const toRemove = toRemoveResult.rows;
    if (toRemove.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Selected members were not found in this group' });
    }

    // 4. Guard against removing the group creator
    for (const p of toRemove) {
      const memberName = p.user_name || p.guest_name || 'Member';
      if (p.user_id && p.user_id === group.created_by) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Cannot remove the group creator (${memberName}). The creator must remain in the group.`,
        });
      }
    }

    // 5. Remove each participant and handle cleanup
    for (const p of toRemove) {
      const pId = p.id;

      // a. Delete all expenses paid by this participant
      await client.query('DELETE FROM expenses WHERE group_id = $1 AND paid_by = $2', [id, pId]);

      // b. Find any other expenses in this group where this participant had a split
      const affectedSplits = await client.query(
        `SELECT DISTINCT es.expense_id
         FROM expense_splits es
         JOIN expenses e ON e.id = es.expense_id
         WHERE e.group_id = $1 AND es.participant_id = $2`,
        [id, pId]
      );

      // c. Delete this participant's splits
      await client.query('DELETE FROM expense_splits WHERE participant_id = $1', [pId]);

      // d. For each affected expense, rebalance the remaining splits
      for (const row of affectedSplits.rows) {
        const expRes = await client.query(
          "SELECT id, amount, COALESCE(split_type, 'equal') AS split_type FROM expenses WHERE id = $1",
          [row.expense_id]
        );
        if (expRes.rows.length === 0) continue; // Expense was deleted in step a
        const expense = expRes.rows[0];

        // 1. Equal-split expenses: skip rebalancing entirely.
        // Part 3 dynamically computes equal shares at read time based on current participant count.
        if (expense.split_type === 'equal') {
          continue;
        }

        // 2. Custom-split expenses: redistribute departed share proportionally to existing shares
        const totalAmount = Number(expense.amount);
        const remSplits = await client.query(
          'SELECT id, participant_id, share_amount FROM expense_splits WHERE expense_id = $1 ORDER BY id ASC',
          [row.expense_id]
        );

        if (remSplits.rows.length === 0) {
          // Edge case: if departing participant was the only split on this expense, delete the empty expense
          await client.query('DELETE FROM expenses WHERE id = $1', [row.expense_id]);
          continue;
        }

        const n = remSplits.rows.length;
        const currentRemSum = remSplits.rows.reduce((sum, r) => sum + Number(r.share_amount), 0);

        if (currentRemSum > 0) {
          let allocatedSum = 0;
          const newShares = [];
          for (let i = 0; i < n; i++) {
            const s = Number(remSplits.rows[i].share_amount);
            // Redistribute proportionally to existing relative shares, rounded to 2 decimal places (paise/cents)
            const rawShare = Math.round((totalAmount * (s / currentRemSum)) * 100) / 100;
            newShares.push(rawShare);
            allocatedSum += rawShare;
          }

          // Edge case rounding: assign any leftover remainder to the first remaining split
          const remainder = Math.round((totalAmount - allocatedSum) * 100) / 100;
          newShares[0] = Math.round((newShares[0] + remainder) * 100) / 100;

          for (let i = 0; i < n; i++) {
            await client.query('UPDATE expense_splits SET share_amount = $1 WHERE id = $2', [
              newShares[i],
              remSplits.rows[i].id,
            ]);
          }
        } else {
          // Fallback if all remaining shares were 0: distribute equally
          const baseShare = Math.floor((totalAmount / n) * 100) / 100;
          const remainder = Math.round((totalAmount - (baseShare * n)) * 100) / 100;

          for (let i = 0; i < n; i++) {
            const share = (i === 0) ? Math.round((baseShare + remainder) * 100) / 100 : baseShare;
            await client.query('UPDATE expense_splits SET share_amount = $1 WHERE id = $2', [
              share,
              remSplits.rows[i].id,
            ]);
          }
        }
      }

      // e. Delete any settlements involving this participant
      await client.query(
        'DELETE FROM settlements WHERE group_id = $1 AND (from_participant = $2 OR to_participant = $2)',
        [id, pId]
      );

      // f. Delete any pending invites if this participant was an invited email
      if (p.invite_email) {
        await client.query(
          'DELETE FROM group_invites WHERE group_id = $1 AND email = $2',
          [id, p.invite_email.toLowerCase()]
        );
      }

      // g. Delete the participant record
      await client.query('DELETE FROM group_participants WHERE id = $1 AND group_id = $2', [pId, id]);
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${id}`).emit('member-removed', {
        groupId: Number(id),
        removedIds: toRemove.map((p) => p.id),
      });
    }

    res.json({
      success: true,
      removedCount: toRemove.length,
      removedIds: toRemove.map((p) => p.id),
      message: `${toRemove.length} ${toRemove.length === 1 ? 'member' : 'members'} removed successfully`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error removing participant:', err);
    res.status(500).json({ error: err.message || 'Failed to remove member(s)' });
  } finally {
    client.release();
  }
}

// POST /groups/:id/participants/remove — batch remove members
router.post('/:id/participants/remove', requireGroupMember, handleRemoveParticipants);

// DELETE /groups/:id/participants — batch remove members via DELETE
router.delete('/:id/participants', requireGroupMember, handleRemoveParticipants);

// DELETE /groups/:id/participants/:participantId — remove single member
router.delete('/:id/participants/:participantId', requireGroupMember, handleRemoveParticipants);

// POST /groups/:id/regenerate-key — creator-only join key regeneration
router.post('/:id/regenerate-key', requireGroupMember, async (req, res) => {
  const { id } = req.params;

  try {
    const groupResult = await pool.query('SELECT * FROM groups WHERE id = $1', [id]);
    const group = groupResult.rows[0];
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the group creator can regenerate the join key' });
    }

    const newCode = await generateJoinCode(pool);
    await pool.query(
      'UPDATE groups SET join_code = $1, join_code_active = true WHERE id = $2',
      [newCode, id]
    );

    // Real-time hook for Phase 7
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${id}`).emit('key-regenerated', {
        groupId: Number(id),
        newKey: newCode,
      });
    }

    return res.status(200).json({
      groupId: Number(id),
      join_code: newCode,
      message: 'New join key generated successfully',
    });
  } catch (err) {
    console.error('Regenerate key error:', err);
    return res.status(500).json({ error: 'Failed to regenerate join key' });
  }
});

module.exports = router;

