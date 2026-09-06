import pg from 'pg';

const ALLOWLIST = ['P0011', 'P0012', 'P0013', 'P0014'];
const apply = process.argv.includes('--apply');
const ids = process.argv.filter((arg) => /^P\d{4}$/.test(arg));
if (ids.length && ids.some((id) => !ALLOWLIST.includes(id))) throw new Error('Only P0011-P0014 are allowed');
const selected = ids.length ? ids : ALLOWLIST;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DB_UNAVAILABLE: DATABASE_URL is not configured');
  process.exitCode = 2;
} else {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT p.id, p.public_number, p.slug, p.title, p.author_id, p.created_at, p.deleted_at, p.source_type,
      (SELECT count(*) FROM problem_revisions r WHERE r.problem_id=p.id) AS revisions,
      (SELECT count(*) FROM problem_tags x WHERE x.problem_id=p.id) AS tags,
      (SELECT count(*) FROM problem_favorites x WHERE x.problem_id=p.id) AS favorites,
      (SELECT count(*) FROM problem_judge_configs x WHERE x.problem_id=p.id) AS judge_configs,
      (SELECT count(*) FROM problem_judge_drafts x WHERE x.problem_id=p.id) AS judge_drafts,
      (SELECT count(*) FROM problem_judge_draft_testcases x JOIN problem_judge_drafts d ON d.id=x.draft_id WHERE d.problem_id=p.id) AS draft_testcases,
      (SELECT count(*) FROM editor_code_drafts x WHERE x.problem_id=p.id) AS editor_drafts,
      (SELECT count(*) FROM contest_problems x WHERE x.problem_id=p.id) AS contests,
      (SELECT count(*) FROM judge_data_versions x WHERE x.problem_id=p.id) AS judge_versions,
      (SELECT count(*) FROM problem_judge_data_objects x WHERE x.problem_id=p.id) AS judge_objects,
      (SELECT count(*) FROM submissions x WHERE x.problem_id=p.id) AS submissions
      ,(SELECT count(*) FROM submission_evaluations e JOIN submissions s ON s.id=e.submission_id WHERE s.problem_id=p.id) AS evaluations
      FROM problems p WHERE p.public_number = ANY($1::bigint[]) ORDER BY p.public_number`,
      [selected.map((id) => Number(id.slice(1))) ]);
    const rows = result.rows;
    console.log('GENERATED CLEANUP PREFLIGHT TABLE');
    for (const row of rows) console.log(JSON.stringify({ candidate: `P${String(row.public_number).padStart(4, '0')}`, evidence: row.source_type === 'CREATOR' && row.author_id == null ? 'direct fixture identity (legacy marker)' : 'IDENTITY_CHANGED', references: row, action: apply ? 'tombstone' : 'dry-run' }));
    if (!apply) process.exitCode = 0;
    else {
      if (rows.length !== selected.length || rows.some((row) => row.source_type !== 'CREATOR' || row.author_id !== null)) throw new Error('IDENTITY_CHANGED / NOT SAFE');
      await client.query('BEGIN');
      try {
        await client.query('UPDATE problems SET deleted_at=COALESCE(deleted_at, now()), deleted_by=COALESCE(deleted_by, $1), delete_reason=COALESCE(delete_reason, $2), updated_at=now() WHERE public_number = ANY($3::bigint[])', ['system:generated-fixture-cleanup-v1', 'generated fixture cleanup V1', selected.map((id) => Number(id.slice(1)))]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally { client.release(); await pool.end(); }
}
