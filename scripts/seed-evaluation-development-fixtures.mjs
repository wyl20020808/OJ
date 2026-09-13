/* global console */
import process from 'node:process';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (process.env.OJPLATFORM_DEVELOPMENT_FIXTURES !== 'true')
  throw new Error(
    'Set OJPLATFORM_DEVELOPMENT_FIXTURES=true before changing Evaluation development fixtures.',
  );
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const users = [
  ['00000000-0000-4000-8100-000000000001', 'evaluation_aurora', '追风少年'],
  ['00000000-0000-4000-8100-000000000002', 'evaluation_orbit', '星河旅人'],
  ['00000000-0000-4000-8100-000000000003', 'evaluation_algo', '算法小白'],
  ['00000000-0000-4000-8100-000000000004', 'evaluation_moon', '山间月'],
  ['00000000-0000-4000-8100-000000000005', 'evaluation_poet', '代码诗人'],
  ['00000000-0000-4000-8100-000000000006', 'evaluation_light', '拾光者'],
];
const fixtureIds = users.map(([id]) => id);
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query('BEGIN');
  await client.query(
    "DELETE FROM submissions WHERE id LIKE 'evaluation-history-demo-%'",
  );

  if (process.argv.includes('--clean')) {
    await client.query(
      'DELETE FROM users WHERE id=ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM submissions WHERE owner_user_id=users.id::text)',
      [fixtureIds],
    );
    await client.query('COMMIT');
    console.log('EVALUATION DEVELOPMENT FIXTURES CLEANED');
    process.exitCode = 0;
  } else {
    const problemCount = await client.query(
      `SELECT count(*)::int AS count
       FROM problems
       WHERE current_revision_id IS NOT NULL
         AND provenance->>'kind'='DEVELOPMENT_FIXTURE'`,
    );
    if (Number(problemCount.rows[0]?.count ?? 0) < 12)
      throw new Error(
        'Evaluation fixtures require Problem Library development fixtures. Run seed:problem-library-development first.',
      );

    for (const [id, username, displayName] of users) {
      await client.query(
        `INSERT INTO users(id,username,email,display_name,status)
         VALUES($1,$2,$3,$4,'active')
         ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,display_name=EXCLUDED.display_name,status='active',updated_at=now()`,
        [id, username, `${username}@fixtures.ojplatform.local`, displayName],
      );
    }

    await client.query(
      `WITH fixture_problems AS (
         SELECT id,current_revision_id,row_number() OVER (ORDER BY public_number) AS ordinal
         FROM problems
         WHERE current_revision_id IS NOT NULL
           AND provenance->>'kind'='DEVELOPMENT_FIXTURE'
         ORDER BY public_number
         LIMIT 12
       ), generated AS (
         SELECT series,
           ((series-1)%12)+1 AS problem_ordinal,
           (ARRAY['00000000-0000-4000-8100-000000000001','00000000-0000-4000-8100-000000000002','00000000-0000-4000-8100-000000000003','00000000-0000-4000-8100-000000000004','00000000-0000-4000-8100-000000000005','00000000-0000-4000-8100-000000000006'])[((series-1)%6)+1] AS owner_id,
           CASE WHEN series%10=0 THEN 'python-3.12-v1' WHEN series%10=1 THEN 'java-21-v1' ELSE 'cpp20-gcc-13-v1' END AS language_id,
           (date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai') - make_interval(days => (6-floor((series-1)/1700))::int) + make_interval(secs => ((series-1)%1700)*50) AS created_at
         FROM generate_series(1,11900) AS series
       )
       INSERT INTO submissions(id,owner_user_id,problem_id,problem_revision_id,testdata_version_ref,language_id,source,status,created_at,updated_at)
       SELECT 'evaluation-history-demo-' || lpad(generated.series::text,5,'0'),generated.owner_id,fixture_problems.id,fixture_problems.current_revision_id,'development-fixture-evaluation-v1',generated.language_id,
         '// DEVELOPMENT FIXTURE / DEMO DATA: evaluation history visual coverage' || E'\n' || repeat('x',180+((generated.series*137)%2200)),
         'QUEUED',generated.created_at,generated.created_at
       FROM generated JOIN fixture_problems ON fixture_problems.ordinal=generated.problem_ordinal`,
    );

    await client.query(
      `WITH generated AS (
         SELECT series,
           CASE
             WHEN series%37=0 THEN NULL
             WHEN series%100<52 THEN 'AC'
             WHEN series%100<74 THEN 'WA'
             WHEN series%100<82 THEN 'RE'
             WHEN series%100<89 THEN 'TLE'
             WHEN series%100<94 THEN 'MLE'
             ELSE 'CE'
           END AS verdict
         FROM generate_series(1,11900) AS series
       )
       INSERT INTO submission_evaluations(submission_id,evaluation_generation,attempt_generation,judge_job_id,verdict_record_digest,evaluation_record_digest,status,verdict,current,detail,created_at,updated_at,completed_at)
       SELECT submissions.id,1,0,'development-fixture-' || submissions.id,
         CASE WHEN generated.verdict IS NULL THEN NULL ELSE md5('verdict-' || submissions.id) END,
         md5('evaluation-' || submissions.id),
         CASE WHEN generated.verdict IS NULL THEN 'RUNNING' ELSE 'COMPLETED_WITH_VERDICT' END,
         generated.verdict,TRUE,
         jsonb_build_object(
           'fixture','EVALUATION_HISTORY_V1',
           'dataOrigin','DEVELOPMENT_FIXTURE',
           'localOnly',true,
           'totalTimeMs',8+((generated.series*17)%53),
           'peakMemoryBytes',(1572864+((generated.series*65537)%11010048))
         ),
         submissions.created_at,submissions.updated_at,
         CASE WHEN generated.verdict IS NULL THEN NULL ELSE submissions.updated_at END
       FROM generated
       JOIN submissions ON submissions.id='evaluation-history-demo-' || lpad(generated.series::text,5,'0')`,
    );

    await client.query('COMMIT');
    console.log(
      'EVALUATION DEVELOPMENT FIXTURES SEEDED: 11900 submissions, 7 days, 6 users, 12 problems, 3 display languages, 7 evaluation states.',
    );
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
