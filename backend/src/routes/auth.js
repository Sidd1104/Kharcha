const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET || 'kharcha_dev_secret',
    { expiresIn: '7d' }
  );
}

// POST /auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name, email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// GET /auth/google - Initiates Google OAuth 2.0 Flow (Account Selection Screen)
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const backendUrl = `http://localhost:${process.env.PORT || 4000}`;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL || `${backendUrl}/auth/google/callback`;

  if (!clientId || clientId.trim() === '' || clientId.includes('your_google_client_id')) {
    return res.redirect(
      `${frontendUrl}/?error=${encodeURIComponent('Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env to connect Google Login.')}`
    );
  }

  const state = crypto.randomBytes(16).toString('hex');
  const scope = encodeURIComponent('openid email profile');
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=select_account`;

  res.redirect(googleAuthUrl);
});

// GET /auth/google/callback - Handles Google OAuth 2.0 Authorization Code exchange
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const backendUrl = `http://localhost:${process.env.PORT || 4000}`;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL || `${backendUrl}/auth/google/callback`;

  if (error || !code) {
    return res.redirect(`${frontendUrl}/?error=${encodeURIComponent(error || 'Google login was cancelled')}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Failed to exchange Google OAuth code:', tokenData);
      return res.redirect(`${frontendUrl}/?error=${encodeURIComponent(tokenData.error_description || 'Failed to exchange Google authorization code')}`);
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await userRes.json();

    if (!profile.email) {
      return res.redirect(`${frontendUrl}/?error=${encodeURIComponent('Could not retrieve email from Google')}`);
    }

    const email = profile.email.toLowerCase();
    const name = profile.name || profile.given_name || email.split('@')[0];

    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (existing.rows.length > 0) {
      user = existing.rows[0];
    } else {
      const dummyPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(dummyPassword, 10);
      const inserted = await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
        [name, email, passwordHash]
      );
      user = inserted.rows[0];
    }

    const token = signToken(user);
    res.redirect(
      `${frontendUrl}/?token=${token}&userId=${user.id}&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}`
    );
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${frontendUrl}/?error=${encodeURIComponent('Server error during Google authentication')}`);
  }
});

// POST /auth/google - Handles Google ID token directly from client popup/GIS
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required' });
  }

  try {
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const payload = await googleRes.json();

    if (!googleRes.ok || !payload.email) {
      return res.status(401).json({ error: 'Invalid Google credential' });
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || payload.given_name || email.split('@')[0];

    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (existing.rows.length > 0) {
      user = existing.rows[0];
    } else {
      const dummyPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(dummyPassword, 10);
      const inserted = await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
        [name, email, passwordHash]
      );
      user = inserted.rows[0];
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Google ID token verification error:', err);
    res.status(500).json({ error: 'Failed to verify Google login' });
  }
});

module.exports = router;
