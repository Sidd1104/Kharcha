const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /notifications — returns pending invites for the logged-in user's email
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT gi.id, gi.token, gi.email, gi.created_at,
              g.name AS group_name, g.icon AS group_icon,
              u.name AS inviter_name
       FROM group_invites gi
       JOIN groups g ON g.id = gi.group_id
       LEFT JOIN users u ON u.id = gi.invited_by
       WHERE gi.email = $1 AND gi.status = 'pending'
       ORDER BY gi.created_at DESC`,
      [req.user.email]
    );

    res.json({ invites: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

module.exports = router;
