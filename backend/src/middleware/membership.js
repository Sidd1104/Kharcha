const { pool } = require('../db');

async function requireGroupMember(req, res, next) {
  const groupId = req.params.groupId || req.params.id;
  if (!groupId) {
    return res.status(400).json({ error: 'Group ID is required' });
  }

  try {
    // 1. Verify group exists (404 if not found)
    const groupResult = await pool.query('SELECT id FROM groups WHERE id = $1', [groupId]);
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // 2. Verify requesting user is an active participant of this group (403 if not active member)
    const membershipResult = await pool.query(
      "SELECT 1 FROM group_participants WHERE group_id = $1 AND user_id = $2 AND status = 'active'",
      [groupId, req.user.id]
    );

    if (membershipResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: you are not a member of this group' });
    }

    next();
  } catch (err) {
    console.error('requireGroupMember error:', err);
    res.status(500).json({ error: 'Server error verifying group membership' });
  }
}

module.exports = { requireGroupMember };
