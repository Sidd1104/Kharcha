const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../db');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'kharcha_dev_secret');
    if (!payload.userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const userId = Number(payload.userId);

    // Verify user exists in the database
    let userResult = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    let user = userResult.rows[0];

    // If user record is missing in DB (e.g. database was reset/migrated while client has valid signed JWT),
    // automatically restore user in database using trusted JWT claims so the active session never breaks.
    if (!user) {
      try {
        const dummyPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = await bcrypt.hash(dummyPassword, 10);
        const name = payload.name || 'User';
        const email = (payload.email || `user_${userId}@kharcha.local`).toLowerCase();

        // Check if an existing row with this email exists under a different ID
        const emailCheck = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
        if (emailCheck.rows[0]) {
          user = emailCheck.rows[0];
        } else {
          const insertResult = await pool.query(
            'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
            [userId, name, email, passwordHash]
          );
          user = insertResult.rows[0];
        }
      } catch (restoreErr) {
        console.warn('Could not auto-restore user for valid JWT:', restoreErr.message);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found. Please log in again.' });
    }

    req.user = { id: user.id, email: user.email, name: user.name };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
