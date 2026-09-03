const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /invites/:token — public, no auth required
// Returns invite details so the recipient can see what they're being invited to
router.get('/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      `SELECT gi.id, gi.email, gi.status, gi.created_at,
              g.name AS group_name, g.icon AS group_icon,
              u.name AS inviter_name
       FROM group_invites gi
       JOIN groups g ON g.id = gi.group_id
       LEFT JOIN users u ON u.id = gi.invited_by
       WHERE gi.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invite not found or expired' });
    }

    const invite = result.rows[0];
    res.json({
      groupName: invite.group_name,
      groupIcon: invite.group_icon,
      inviterName: invite.inviter_name,
      email: invite.email,
      status: invite.status,
      createdAt: invite.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch invite details' });
  }
});

// POST /invites/:token/accept — requires auth
// Links the logged-in user to the group participant row
router.post('/:token/accept', requireAuth, async (req, res) => {
  const { token } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find the invite
    const inviteResult = await client.query(
      'SELECT id, group_id, email, status FROM group_invites WHERE token = $1',
      [token]
    );

    if (inviteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invite not found' });
    }

    const invite = inviteResult.rows[0];

    if (invite.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `This invite has already been ${invite.status}` });
    }

    // Find the participant row for this invite (by email + group)
    const participantResult = await client.query(
      `SELECT id FROM group_participants
       WHERE group_id = $1 AND invite_email = $2 AND status = 'invited'`,
      [invite.group_id, invite.email]
    );

    if (participantResult.rows.length > 0) {
      // Update the participant: set user_id, clear invite fields, set active
      await client.query(
        `UPDATE group_participants
         SET user_id = $1, status = 'active', invite_email = NULL
         WHERE id = $2`,
        [req.user.id, participantResult.rows[0].id]
      );
    } else {
      // Participant row was deleted or missing — create a new active one
      await client.query(
        'INSERT INTO group_participants (group_id, user_id, status) VALUES ($1, $2, $3)',
        [invite.group_id, req.user.id, 'active']
      );
    }

    // Mark invite as accepted
    await client.query(
      "UPDATE group_invites SET status = 'accepted' WHERE id = $1",
      [invite.id]
    );

    await client.query('COMMIT');

    // Return the group info so frontend can redirect
    const groupResult = await pool.query('SELECT id, name FROM groups WHERE id = $1', [invite.group_id]);
    res.json({
      message: 'Invite accepted',
      group: groupResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to accept invite' });
  } finally {
    client.release();
  }
});

// POST /invites/:token/decline — requires auth
router.post('/:token/decline', requireAuth, async (req, res) => {
  const { token } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inviteResult = await client.query(
      'SELECT id, group_id, email, status FROM group_invites WHERE token = $1',
      [token]
    );

    if (inviteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invite not found' });
    }

    const invite = inviteResult.rows[0];

    if (invite.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `This invite has already been ${invite.status}` });
    }

    // Remove the invited participant row
    await client.query(
      `DELETE FROM group_participants
       WHERE group_id = $1 AND invite_email = $2 AND status = 'invited'`,
      [invite.group_id, invite.email]
    );

    // Mark invite as declined
    await client.query(
      "UPDATE group_invites SET status = 'declined' WHERE id = $1",
      [invite.id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Invite declined' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to decline invite' });
  } finally {
    client.release();
  }
});

module.exports = router;
