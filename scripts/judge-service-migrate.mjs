import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrationCommand } from './migration-runner.mjs';
import { judgeMigrationManifest } from './migrations/judge-manifest.mjs';

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

async function assertRoleSeparation(databaseUrl, runtimeRole) {
  if (!runtimeRole) return;
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const currentUser = (await client.query('SELECT current_user')).rows[0]
      .current_user;
    if (currentUser === runtimeRole) {
      throw new Error('JUDGE_MIGRATION_ROLE_MUST_DIFFER_FROM_RUNTIME_ROLE');
    }
  } finally {
    await client.end();
  }
}

async function grantRuntimePrivileges(databaseUrl, runtimeRole) {
  if (!runtimeRole) return;
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const role = quoteIdentifier(runtimeRole);
    await client.query('BEGIN');
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    );
    await client.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    );
    await client.query(`REVOKE CREATE ON SCHEMA public FROM ${role}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

const command = process.argv[2] ?? 'up';
const argumentsAfterCommand = process.argv.slice(3);
const json = argumentsAfterCommand.includes('--json');
const positional = argumentsAfterCommand.filter(
  (argument) => !argument.startsWith('--'),
);
if (positional.length > 1 || (positional.length && command !== 'down')) {
  throw new Error('Only down accepts one explicit latest migration id');
}

const databaseUrl = process.env.JUDGE_DATABASE_URL;
const directory = fileURLToPath(
  new URL('../packages/judge-runtime/migrations/', import.meta.url),
);

try {
  if (command === 'up') {
    await assertRoleSeparation(databaseUrl, process.env.JUDGE_DATABASE_ROLE);
  }
  await runMigrationCommand({
    databaseUrl,
    directory,
    label: 'judge',
    manifest: judgeMigrationManifest,
    command,
    json,
    requestedId: positional[0],
  });
  if (command === 'up') {
    await grantRuntimePrivileges(databaseUrl, process.env.JUDGE_DATABASE_ROLE);
  }
} catch (error) {
  console.error(`Judge migration failed: ${error.message}`);
  process.exitCode = 1;
}
