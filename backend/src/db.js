const { Pool } = require('pg');

// DATABASE_URL should look like:
// postgresql://user:password@host:5432/dbname?sslmode=require
// (Neon/Supabase connection strings work directly here)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

module.exports = { pool };
