const { Client } = require('pg');
require('dotenv').config();

async function testConfirm() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('BEGIN');
  try {
    const id = 1;
    const reqUserId = 3;
    const linkToParticipantId = 4;

    const { rows: groupRows } = await client.query('SELECT * FROM groups WHERE id = $1', [id]);
    const group = groupRows[0];
    console.log('Group found:', group ? group.name : null);

    const { rows: participantRows } = await client.query(
      'SELECT * FROM group_participants WHERE group_id = $1 AND user_id = $2',
      [group.id, reqUserId]
    );
    console.log('Existing membership:', participantRows[0]);

    const targetId = Number(linkToParticipantId);
    const { rows: candidateRows } = await client.query(
      'SELECT * FROM group_participants WHERE id = $1 AND group_id = $2',
      [targetId, group.id]
    );
    const candidate = candidateRows[0];
    console.log('Candidate found:', candidate);

    const updateResult = await client.query(
      "UPDATE group_participants SET user_id = $1, status = 'active' WHERE id = $2 RETURNING *",
      [reqUserId, candidate.id]
    );
    console.log('Updated participant:', updateResult.rows[0]);
    console.log('DRY RUN SUCCESSFUL!');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

testConfirm().catch(console.error);
