import pg from 'pg';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

const adminUrl = required('JUDGE_DATABASE_ADMIN_URL');
const databaseName = process.env.JUDGE_DATABASE_NAME ?? 'ojplatform_judge';
const roleName = process.env.JUDGE_DATABASE_ROLE ?? 'oj_judge_service';
const rolePassword = required('JUDGE_DATABASE_PASSWORD');
const admin = new pg.Client({ connectionString: adminUrl });

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
  connectionString: (() => {
    const url = new URL(adminUrl);
    url.pathname = `/${databaseName}`;
    return url.toString();
  })(),
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
  console.log(
    JSON.stringify({
      judgeDatabase: databaseName,
      judgeRole: roleName,
      status: 'BOOTSTRAPPED',
    }),
  );
} finally {
  await target.end();
}
