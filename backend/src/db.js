const path = require('path');
const fs = require('fs');

const isPostgres = process.env.DATABASE_URL &&
  (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://')) &&
  !process.env.DATABASE_URL.includes('localhost:9999'); // fallback to SQLite if default unauthenticated localhost:9999

let pool;

if (isPostgres) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle Postgres client', err);
  });
} else {
  // SQLite implementation
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '..', 'kharcha.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Auto-initialize schema for SQLite
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'wallet',
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      guest_name TEXT,
      invite_email TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS group_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      invited_by INTEGER REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      paid_by INTEGER NOT NULL REFERENCES group_participants(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL CHECK (amount > 0),
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES group_participants(id) ON DELETE CASCADE,
      share_amount NUMERIC NOT NULL CHECK (share_amount >= 0),
      UNIQUE (expense_id, participant_id)
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      from_participant INTEGER NOT NULL REFERENCES group_participants(id) ON DELETE CASCADE,
      to_participant INTEGER NOT NULL REFERENCES group_participants(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL CHECK (amount > 0),
      status TEXT NOT NULL DEFAULT 'pending',
      settled_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_group_participants_group ON group_participants(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_participants_user ON group_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token);
    CREATE INDEX IF NOT EXISTS idx_group_invites_email ON group_invites(email);
    CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
    CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
    CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
  `);

  function formatSql(sql) {
    return sql
      .replace(/\$\d+/g, '?')
      .replace(/\bnow\(\)/gi, 'CURRENT_TIMESTAMP');
  }

  function executeSql(sql, params = []) {
    const formatted = formatSql(sql);
    const trimmed = formatted.trim().toUpperCase();

    if (trimmed === 'BEGIN') {
      db.exec('BEGIN');
      return { rows: [], rowCount: 0 };
    }
    if (trimmed === 'COMMIT') {
      db.exec('COMMIT');
      return { rows: [], rowCount: 0 };
    }
    if (trimmed === 'ROLLBACK') {
      try {
        db.exec('ROLLBACK');
      } catch (e) {
        // Ignore rollback error if no transaction is active
      }
      return { rows: [], rowCount: 0 };
    }

    const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA');
    const isReturning = formatted.toUpperCase().includes('RETURNING');

    const stmt = db.prepare(formatted);
    if (isSelect || isReturning) {
      const rows = stmt.all(...params);
      return { rows, rowCount: rows.length };
    } else {
      const info = stmt.run(...params);
      return { rows: [], rowCount: info.changes };
    }
  }

  pool = {
    query: async (sql, params) => {
      return executeSql(sql, params);
    },
    connect: async () => {
      return {
        query: async (sql, params) => executeSql(sql, params),
        release: () => {},
      };
    },
    end: async () => {
      db.close();
    },
  };
  console.log('📦 Using local SQLite database (kharcha.db)');
}

module.exports = { pool };
