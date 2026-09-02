const { pool } = require('./src/db');

(async () => {
  try {
    const userRes = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      ['Test User', 'test@example.com', 'hashedpassword']
    );
    console.log('User created:', userRes.rows[0]);

    const client = await pool.connect();
    await client.query('BEGIN');
    const groupRes = await client.query(
      'INSERT INTO groups (name, icon, created_by) VALUES ($1, $2, $3) RETURNING *',
      ['Test Group', 'trip', userRes.rows[0].id]
    );
    await client.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [groupRes.rows[0].id, userRes.rows[0].id]
    );
    await client.query('COMMIT');
    client.release();
    console.log('Group created:', groupRes.rows[0]);

    const groupsList = await pool.query(
      `SELECT g.id, g.name, g.icon,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1`,
      [userRes.rows[0].id]
    );
    console.log('Groups list:', groupsList.rows);

    // Clean up test data
    await pool.query('DELETE FROM users WHERE email = $1', ['test@example.com']);
    console.log('Cleaned up test data.');
    console.log('✅ ALL DB TESTS PASSED!');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await pool.end();
  }
})();
