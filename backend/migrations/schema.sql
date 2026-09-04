-- Kharcha database schema (v2 — participants model)
-- Run this once against your PostgreSQL database (e.g. via Neon, Supabase, or local psql)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  icon VARCHAR(40) DEFAULT 'wallet',
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  join_code VARCHAR(6) UNIQUE,
  join_code_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration for existing databases
ALTER TABLE groups ADD COLUMN IF NOT EXISTS join_code VARCHAR(6) UNIQUE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS join_code_active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS group_participants (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_name VARCHAR(120),
  invite_email VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'invited' | 'guest'
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS group_invites (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  invited_by INTEGER REFERENCES users(id),
  token VARCHAR(128) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'declined'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  paid_by INTEGER NOT NULL REFERENCES group_participants(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description VARCHAR(255) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'Other',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_splits (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES group_participants(id) ON DELETE CASCADE,
  share_amount NUMERIC(12, 2) NOT NULL CHECK (share_amount >= 0),
  UNIQUE (expense_id, participant_id)
);

CREATE TABLE IF NOT EXISTS settlements (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_participant INTEGER NOT NULL REFERENCES group_participants(id) ON DELETE CASCADE,
  to_participant INTEGER NOT NULL REFERENCES group_participants(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | done
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_group_participants_group ON group_participants(group_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_user ON group_participants(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_participants_user_unique ON group_participants(group_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token);
CREATE INDEX IF NOT EXISTS idx_group_invites_email ON group_invites(email);
CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
