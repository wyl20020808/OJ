import { setTimeout as wait } from 'node:timers/promises';
import pg from 'pg';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

// Transient transport/startup failures only. These mean "the server is not able
// to answer yet", not "the request is wrong".
const TRANSIENT_CONNECTION_PATTERNS = [
  /ECONNREFUSED/,
  /ECONNRESET/,
  /ETIMEDOUT/,
  /EPIPE/,
  /EHOSTUNREACH/,
  /ENETUNREACH/,
  /ENETDOWN/,
  /Connection terminated unexpectedly/i,
  /Connection terminated due to connection timeout/i,
  /server closed the connection unexpectedly/i,
  /the database system is starting up/i,
  /the database system is in recovery mode/i,
  /terminating connection due to administrator command/i,
  /remaining connection slots are reserved/i,
];
// PostgreSQL SQLSTATE classes that only describe a not-yet-usable server.
const TRANSIENT_SQLSTATES = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

// Configuration, credential, schema and migration failures are never transient.
// They must fail immediately: retrying them would hide a real setup problem.
const FATAL_CONNECTION_PATTERNS = [
  /password authentication failed/i,
  /no pg_hba.conf entry/i,
  /authentication failed/i,
  /permission denied/i,
  /must be owner of/i,
  /does not exist/i,
  /already exists/i,
  /syntax error/i,
  /invalid password/i,
  /role .* is not permitted/i,
];
const FATAL_SQLSTATES = new Set([
  '28P01',
  '28000',
  '3D000',
  '42501',
  '42P01',
  '42601',
  '42703',
  '42P06',
  '42P07',
  '42710',
  '22023',
]);

const classifyBootstrapFailure = (error) => {
  const message = String(error?.message ?? error);
  const code = String(error?.code ?? '');
  // Fatal classification always wins over transient classification.
  if (FATAL_SQLSTATES.has(code)) return 'FATAL';
  for (const pattern of FATAL_CONNECTION_PATTERNS)
    if (pattern.test(message)) return 'FATAL';
  if (TRANSIENT_SQLSTATES.has(code)) return 'TRANSIENT';
  for (const pattern of TRANSIENT_CONNECTION_PATTERNS)
    if (pattern.test(message)) return 'TRANSIENT';
  // Unknown failures are not retried: they are reported as they are.
  return 'UNKNOWN';
};

const adminUrl = required('JUDGE_DATABASE_ADMIN_URL');
const databaseName = process.env.JUDGE_DATABASE_NAME ?? 'ojplatform_judge';
const roleName = process.env.JUDGE_DATABASE_ROLE ?? 'oj_judge_service';
const rolePassword = required('JUDGE_DATABASE_PASSWORD');

const targetUrl = (() => {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
})();

// Idempotent: creating only what is missing and re-applying the same grants is
// safe to repeat after a mid-way transient failure.
const bootstrap = async () => {
  const admin = new pg.Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  try {
    const role = quoteIdentifier(roleName);
    const database = quoteIdentifier(databaseName);
    const existingRole = await admin.query(
      'SELECT 1 FROM pg_roles WHERE rolname=$1',
      [roleName],
    );
    if (!existingRole.rowCount)
      await admin.query(
        `CREATE ROLE ${role} LOGIN PASSWORD ${quoteLiteral(rolePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
    else
      await admin.query(
        `ALTER ROLE ${role} LOGIN PASSWORD ${quoteLiteral(rolePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
    const existingDatabase = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname=$1',
      [databaseName],
    );
    if (!existingDatabase.rowCount)
      await admin.query(
        `CREATE DATABASE ${database} OWNER ${quoteIdentifier((await admin.query('SELECT current_user')).rows[0].current_user)}`,
      );
    await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
  } finally {
    await admin.end();
  }

  const target = new pg.Client({
    connectionString: targetUrl,
    connectionTimeoutMillis: 5000,
  });
  await target.connect();
  try {
    const role = quoteIdentifier(roleName);
    await target.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await target.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await target.query(`REVOKE CREATE ON SCHEMA public FROM ${role}`);
    // Repair pre-existing Judge tables as well as objects created after this
    // bootstrap. Default privileges alone only cover one owner's future DDL.
    await target.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    );
    await target.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    );
    await target.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    );
    await target.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    );
  } finally {
    await target.end();
  }
};

// Second defensive layer only: the Runtime Manager already waits for real
// infrastructure readiness, so this covers a connection that is lost after that
// gate (for example a host port forwarder that dropped an established path).
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

let report;
for (let attempt = 1; ; attempt += 1) {
  try {
    await bootstrap();
    report = {
      judgeDatabase: databaseName,
      judgeRole: roleName,
      attempt,
      status: 'BOOTSTRAPPED',
    };
    break;
  } catch (error) {
    const failureClass = classifyBootstrapFailure(error);
    const message = String(error?.message ?? error).split('\n')[0];
    if (failureClass !== 'TRANSIENT' || attempt >= MAX_ATTEMPTS) {
      // Never print the connection URL: it carries the development password.
      console.error(
        JSON.stringify({
          status: 'FAILED',
          judgeDatabase: databaseName,
          judgeRole: roleName,
          attempt,
          failureClass,
          error: message,
        }),
      );
      throw error;
    }
    const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1);
    console.error(
      `Judge DB bootstrap transient failure (attempt ${attempt}/${MAX_ATTEMPTS}, ${failureClass}): ${message}; retrying in ${delayMs}ms`,
    );
    await wait(delayMs);
  }
}

console.log(JSON.stringify(report));
