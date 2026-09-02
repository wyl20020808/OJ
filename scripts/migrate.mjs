import { readFile } from 'node:fs/promises';
import pg from 'pg';

const direction = process.argv[2] ?? 'up';
const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ??
    'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform',
  connectionTimeoutMillis: 3000,
});
await client.connect();
try {
  const migrations = [
    '0000_platform_metadata',
    '0001_auth_foundation',
    '0002_problem_foundation',
    '0003_authz_foundation',
    '0004_problem_authoring_revision',
    '0005_submission_intake',
    '0006_submission_evaluation_history',
    '0007_submission_status_lifecycle',
    '0006_auth_identity_verification_social',
    '0007_contest_foundation',
    '0008_social_messaging_foundation',
    '0009_notifications_foundation',
    '0010_guest_auth',
    '0011_profile_favorites',
    '0013_problem_judge_data',
    '0014_problem_judge_data_integrity',
  ];
  const ordered = direction === 'down' ? [...migrations].reverse() : migrations;
  for (const name of ordered) {
    const file = `packages/database/migrations/${name}${direction === 'down' ? '.down' : ''}.sql`;
    await client.query(await readFile(file, 'utf8'));
  }
  console.log(`migration ${direction} PASS`);
} finally {
  await client.end();
}
