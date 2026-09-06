// Run with: DATABASE_URL="postgresql://...neon..." node kharcha_db_check.js
// Independent sanity check — does not rely on the app's own test suite.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });
const { Client } = require(path.join(__dirname, 'backend/node_modules/pg'));

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log('=== 1. join_code format & uniqueness ===');
  const badCodes = await client.query(
    `SELECT id, join_code, join_code_active FROM groups
     WHERE join_code IS NULL OR join_code !~ '^[0-9]{6}$'`
  );
  console.log(badCodes.rows.length === 0
    ? 'OK — every group has a well-formed 6-digit code'
    : `PROBLEM — ${badCodes.rows.length} groups with malformed codes: ${JSON.stringify(badCodes.rows)}`);

  const dupeActive = await client.query(
    `SELECT join_code, COUNT(*) FROM groups
     WHERE join_code_active = true
     GROUP BY join_code HAVING COUNT(*) > 1`
  );
  console.log(dupeActive.rows.length === 0
    ? 'OK — no two active groups share a join_code'
    : `PROBLEM — duplicate active codes: ${JSON.stringify(dupeActive.rows)}`);

  console.log('\n=== 2. duplicate memberships ===');
  const dupeMembers = await client.query(
    `SELECT group_id, user_id, COUNT(*) FROM group_participants
     WHERE user_id IS NOT NULL
     GROUP BY group_id, user_id HAVING COUNT(*) > 1`
  );
  console.log(dupeMembers.rows.length === 0
    ? 'OK — no user appears twice in the same group'
    : `PROBLEM — duplicate memberships: ${JSON.stringify(dupeMembers.rows)}`);

  console.log('\n=== 3. orphaned expenses / splits ===');
  const orphanExpenses = await client.query(
    `SELECT e.id FROM expenses e
     LEFT JOIN group_participants gp ON gp.id = e.paid_by
     WHERE gp.id IS NULL`
  );
  console.log(orphanExpenses.rows.length === 0
    ? 'OK — every expense has a valid payer'
    : `PROBLEM — orphaned expenses: ${JSON.stringify(orphanExpenses.rows)}`);

  console.log('\n=== 4. splits sum to expense amount ===');
  const badSplits = await client.query(
    `SELECT e.id, e.amount, SUM(es.share_amount) AS split_total
     FROM expenses e
     JOIN expense_splits es ON es.expense_id = e.id
     GROUP BY e.id, e.amount
     HAVING ABS(e.amount - SUM(es.share_amount)) > 0.05`
  );
  console.log(badSplits.rows.length === 0
    ? 'OK — every expense\'s splits sum to its total'
    : `PROBLEM — mismatched splits: ${JSON.stringify(badSplits.rows)}`);

  console.log('\n=== 5. split_type / joined_via value integrity ===');
  const badSplitType = await client.query(
    `SELECT id, split_type FROM expenses WHERE split_type NOT IN ('equal','custom')`
  );
  console.log(badSplitType.rows.length === 0
    ? 'OK — every expense has a valid split_type'
    : `PROBLEM — invalid split_type values: ${JSON.stringify(badSplitType.rows)}`);

  const badJoinedVia = await client.query(
    `SELECT id, joined_via FROM group_participants WHERE joined_via NOT IN ('host_added','join_key')`
  );
  console.log(badJoinedVia.rows.length === 0
    ? 'OK — every participant has a valid joined_via'
    : `PROBLEM — invalid joined_via values: ${JSON.stringify(badJoinedVia.rows)}`);

  console.log('\n=== 6. custom-split expenses still sum to their total (post merge/removal) ===');
  const badCustomSums = await client.query(`
    SELECT e.id, e.amount, SUM(es.share_amount) AS split_total
    FROM expenses e
    JOIN expense_splits es ON es.expense_id = e.id
    WHERE e.split_type = 'custom'
    GROUP BY e.id, e.amount
    HAVING ABS(e.amount - SUM(es.share_amount)) > 0.05
  `);
  console.log(badCustomSums.rows.length === 0
    ? 'OK — every custom-split expense still sums to its total'
    : `PROBLEM — drifted custom splits: ${JSON.stringify(badCustomSums.rows)}`);

  console.log('\n=== 7. join_code reuse works (partial unique index check) ===');
  const globalDupeCodes = await client.query(
    `SELECT join_code, COUNT(*) AS c FROM groups GROUP BY join_code HAVING COUNT(*) > 1`
  );
  console.log(globalDupeCodes.rows.length === 0
    ? 'INFO — no code has been reused yet (nothing to verify either way)'
    : `INFO — ${globalDupeCodes.rows.length} code(s) reused across groups — confirms the partial index allows reuse, as long as none of the duplicates are BOTH active (checked in section 1 above)`);

  console.log('\n=== 8. quick counts ===');
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM groups) AS groups,
      (SELECT COUNT(*) FROM group_participants) AS participants,
      (SELECT COUNT(*) FROM expenses) AS expenses,
      (SELECT COUNT(*) FROM expense_splits) AS splits
  `);
  console.log(counts.rows[0]);

  await client.end();
}

main().catch((err) => {
  console.error('DB check failed:', err.message);
  process.exit(1);
});
