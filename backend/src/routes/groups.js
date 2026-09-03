const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendInviteEmail } = require('../utils/email');

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
// body: { name, icon?, guests?: string[], inviteEmails?: string[] }
router.post('/', async (req, res) => {
  const { name, icon, guests, inviteEmails } = req.body;
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
      'INSERT INTO group_participants (group_id, user_id, status) VALUES ($1, $2, $3)',
      [group.id, req.user.id, 'active']
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

    // Add invited participants + create invites
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (Array.isArray(inviteEmails)) {
      for (const email of inviteEmails) {
        const trimmedEmail = (email || '').trim().toLowerCase();
        if (!trimmedEmail) continue;

        // Check if this email already has an account
        const existingUser = await client.query('SELECT id, name FROM users WHERE email = $1', [trimmedEmail]);

        if (existingUser.rows.length > 0) {
          // User exists — add them directly as active participant
          const userId = existingUser.rows[0].id;
          await client.query(
            'INSERT INTO group_participants (group_id, user_id, status) VALUES ($1, $2, $3)',
            [group.id, userId, 'active']
          );
        } else {
          // User doesn't exist — create invited participant + invite
          const token = crypto.randomBytes(32).toString('hex');
          const emailName = trimmedEmail.split('@')[0];

          await client.query(
            'INSERT INTO group_participants (group_id, guest_name, invite_email, status) VALUES ($1, $2, $3, $4)',
            [group.id, emailName, trimmedEmail, 'invited']
          );

          await client.query(
            'INSERT INTO group_invites (group_id, email, invited_by, token, status) VALUES ($1, $2, $3, $4, $5)',
            [group.id, trimmedEmail, req.user.id, token, 'pending']
          );

          // Send email (async, don't block)
          sendInviteEmail(trimmedEmail, name, req.user.name, token, frontendUrl).catch(() => {});
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ group });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create group' });
  } finally {
    client.release();
  }
});

// GET /groups/:id — group detail with participants
router.get('/:id', async (req, res) => {
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
              END AS type
       FROM group_participants gp
       LEFT JOIN users u ON u.id = gp.user_id
       WHERE gp.group_id = $1
       ORDER BY gp.added_at ASC`,
      [id]
    );

    res.json({ group, participants: participantsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// POST /groups/:id/participants/guest — add a guest participant (no account needed)
router.post('/:id/participants/guest', async (req, res) => {
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
router.post('/:id/participants/invite', async (req, res) => {
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

module.exports = router;
