const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /groups — list all groups the logged-in user belongs to, with a quick balance summary
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.id, g.name, g.icon, g.created_at,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
              (SELECT COUNT(*) FROM expenses e WHERE e.group_id = g.id) AS expense_count
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json({ groups: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// POST /groups — create a new group (creator is auto-added as a member)
router.post('/', async (req, res) => {
  const { name, icon, memberEmails } = req.body;
  if (!name) return res.status(400).json({ error: 'Group name is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const groupResult = await client.query(
      'INSERT INTO groups (name, icon, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, icon || 'wallet', req.user.id]
    );
    const group = groupResult.rows[0];

    await client.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, req.user.id]
    );

    // Optionally add other members by email (they must already have an account)
    if (Array.isArray(memberEmails)) {
      for (const email of memberEmails) {
        const userResult = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (userResult.rows[0]) {
          await client.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [group.id, userResult.rows[0].id]
          );
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

// POST /groups/:id/members — add a member by email
router.post('/:id/members', async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const userResult = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'No account found with that email' });

    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, user.id]
    );
    res.status(201).json({ member: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// GET /groups/:id — group detail with members
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const groupResult = await pool.query('SELECT * FROM groups WHERE id = $1', [id]);
    const group = groupResult.rows[0];
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const membersResult = await pool.query(
      `SELECT u.id, u.name, u.email
       FROM group_members gm JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1`,
      [id]
    );

    res.json({ group, members: membersResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

module.exports = router;
