const { pool } = require('../src/db');

async function testPhase1() {
  console.log('🧪 Starting Phase 1 Schema Verification...');

  // 1. Verify columns in groups table
  const colRes = await pool.query('PRAGMA table_info(groups)');
  const colNames = colRes.rows.map((r) => r.name);
  console.log('   groups columns:', colNames);
  if (!colNames.includes('join_code') || !colNames.includes('join_code_active')) {
    throw new Error('FAIL: groups table is missing join_code or join_code_active');
  }

  // 2. Verify all groups have 6-digit join_code
  const groupRes = await pool.query('SELECT id, name, join_code, join_code_active FROM groups');
  for (const g of groupRes.rows) {
    if (!g.join_code || !/^\d{6}$/.test(g.join_code)) {
      throw new Error(`FAIL: Group ${g.id} has invalid join_code: ${g.join_code}`);
    }
  }
  console.log(`   Verified ${groupRes.rows.length} groups have valid 6-digit join_code`);

  // 3. Verify partial unique index on (group_id, user_id) WHERE user_id IS NOT NULL
  const idxRes = await pool.query('PRAGMA index_list(group_participants)');
  const idxNames = idxRes.rows.map((r) => r.name);
  console.log('   group_participants indices:', idxNames);
  if (!idxNames.includes('idx_group_participants_user_unique')) {
    throw new Error('FAIL: Missing partial unique index idx_group_participants_user_unique');
  }

  // 4. Test constraint enforcement
  const client = await pool.connect();
  let testGroupId;
  try {
    const gInsert = await client.query(
      "INSERT INTO groups (name, created_by) VALUES ('Schema Test Group', 3) RETURNING id"
    );
    testGroupId = gInsert.rows[0].id;

    // First insert for user 3
    await client.query(
      "INSERT INTO group_participants (group_id, user_id, status) VALUES ($1, 3, 'active')",
      [testGroupId]
    );

    // Duplicate insert for user 3 must fail with UNIQUE constraint violation
    let dupCaught = false;
    try {
      await client.query(
        "INSERT INTO group_participants (group_id, user_id, status) VALUES ($1, 3, 'active')",
        [testGroupId]
      );
    } catch (err) {
      dupCaught = true;
      console.log('   Confirmed duplicate (group_id, user_id) rejected:', err.message);
    }
    if (!dupCaught) {
      throw new Error('FAIL: Partial unique index did not reject duplicate user in same group');
    }

    // Multiple guests with user_id NULL must succeed
    await client.query(
      "INSERT INTO group_participants (group_id, guest_name, status) VALUES ($1, 'Guest A', 'guest')",
      [testGroupId]
    );
    await client.query(
      "INSERT INTO group_participants (group_id, guest_name, status) VALUES ($1, 'Guest B', 'guest')",
      [testGroupId]
    );
    console.log('   Confirmed multiple guests with user_id = NULL allowed.');

    // Cleanup
    await client.query('DELETE FROM groups WHERE id = $1', [testGroupId]);
    console.log('   Cleaned up test group.');
  } finally {
    client.release();
  }

  console.log('🎉 Phase 1 Schema Verification PASSED!');
  process.exit(0);
}

testPhase1().catch((err) => {
  console.error('❌ Phase 1 test failed:', err);
  process.exit(1);
});
