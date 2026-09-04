const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireGroupMember } = require('../middleware/membership');
const { sendInviteEmail } = require('../utils/email');
const { generateJoinCode } = require('../utils/joinCode');

const router = express.Router();
router.use(requireAuth);

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

// POST /groups/:id/participants/invite — invite a person by email
router.post('/:id/participants/invite', requireGroupMember, async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required' });

  const trimmedEmail = email.trim().toLowerCase();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get group name for the email
    const groupResult = await client.query('SELECT name FROM groups WHERE id = $1', [id]);
    if (!groupResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group not found' });
    }
    const groupName = groupResult.rows[0].name;

    // Check if already a participant
    const existingParticipant = await client.query(
      `SELECT gp.id FROM group_participants gp
       LEFT JOIN users u ON u.id = gp.user_id
       WHERE gp.group_id = $1 AND (u.email = $2 OR gp.invite_email = $2)`,
      [id, trimmedEmail]
    );
    if (existingParticipant.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This person is already in the group' });
    }

    // Check if this email already has an account
    const existingUser = await client.query('SELECT id, name FROM users WHERE email = $1', [trimmedEmail]);

    if (existingUser.rows.length > 0) {
      // User exists — add directly as active participant
      const userId = existingUser.rows[0].id;
      const result = await client.query(
        'INSERT INTO group_participants (group_id, user_id, status) VALUES ($1, $2, $3) RETURNING *',
        [id, userId, 'active']
      );
      await client.query('COMMIT');
      return res.status(201).json({
        participant: {
          participant_id: result.rows[0].id,
          user_id: userId,
          name: existingUser.rows[0].name,
          email: trimmedEmail,
          status: 'active',
          type: 'user',
        },
      });
    }

    // User doesn't exist — create invited participant + invite
    const token = crypto.randomBytes(32).toString('hex');
    const emailName = trimmedEmail.split('@')[0];

    const participantResult = await client.query(
      'INSERT INTO group_participants (group_id, guest_name, invite_email, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, emailName, trimmedEmail, 'invited']
    );

    await client.query(
      'INSERT INTO group_invites (group_id, email, invited_by, token, status) VALUES ($1, $2, $3, $4, $5)',
      [id, trimmedEmail, req.user.id, token, 'pending']
    );

    await client.query('COMMIT');

    // Send email (async, don't block response)
    sendInviteEmail(trimmedEmail, groupName, req.user.name, token, frontendUrl).catch(() => {});

    res.status(201).json({
      participant: {
        participant_id: participantResult.rows[0].id,
        user_id: null,
        name: emailName,
        email: trimmedEmail,
        status: 'invited',
        type: 'invited',
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to send invite' });
  } finally {
    client.release();
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
        const expRes = await client.query('SELECT id, amount FROM expenses WHERE id = $1', [row.expense_id]);
        if (expRes.rows.length === 0) continue; // Expense was deleted in step a
        const totalAmount = Number(expRes.rows[0].amount);

        const remSplits = await client.query(
          'SELECT id FROM expense_splits WHERE expense_id = $1 ORDER BY id ASC',
          [row.expense_id]
        );

        if (remSplits.rows.length === 0) {
          // If no splits remain, remove the empty expense
          await client.query('DELETE FROM expenses WHERE id = $1', [row.expense_id]);
        } else {
          // Rebalance splits equally among remaining participants
          const n = remSplits.rows.length;
          const baseShare = Math.floor((totalAmount / n) * 100) / 100;
          let remainder = Math.round((totalAmount - (baseShare * n)) * 100) / 100;

          for (let i = 0; i < n; i++) {
            const share = (i === 0) ? Math.round((baseShare + remainder) * 100) / 100 : baseShare;
            await client.query('UPDATE expense_splits SET share_amount = $1 WHERE id = $2', [share, remSplits.rows[i].id]);
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

module.exports = router;
