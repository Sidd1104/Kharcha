const crypto = require('crypto');
const { pool } = require('../db');

const MAX_RETRIES = 10;

/**
 * Generates a unique 6-digit join code that is not currently active in any group.
 * @param {object} [client] - Optional database client for transactional queries; defaults to pool.
 * @returns {Promise<string>} 6-digit unique join code.
 */
async function generateJoinCode(client = pool) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Generate random 6-digit number in [100000, 1000000)
    const code = crypto.randomInt(100000, 1000000).toString().padStart(6, '0');

    const result = await client.query(
      'SELECT 1 FROM groups WHERE join_code = $1 AND join_code_active = true',
      [code]
    );

    if (result.rows.length === 0) {
      return code;
    }
  }

  throw new Error(`Failed to generate a unique join code after ${MAX_RETRIES} attempts`);
}

module.exports = { generateJoinCode };
