import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  MIGRATION_LEDGER,
  migrationChecksum,
  runMigrationCommand,
} from './migration-runner.mjs';
import { judgeMigrationManifest } from './migrations/judge-manifest.mjs';
import { productMigrationManifest } from './migrations/product-manifest.mjs';

if (process.env.MIGRATION_QUALIFICATION_DISPOSABLE !== 'YES') {
  throw new Error('MIGRATION_QUALIFICATION_DISPOSABLE=YES is required');
}
const configuredAdminUrl = process.env.MIGRATION_QUALIFICATION_ADMIN_URL;
if (!configuredAdminUrl) {
  throw new Error('MIGRATION_QUALIFICATION_ADMIN_URL is required');
}

let tunnelServer;
const tunnelChildren = new Set();
async function resolveAdminUrl(urlValue) {
  const container = process.env.MIGRATION_QUALIFICATION_TUNNEL_CONTAINER;
  if (!container) return urlValue;
  const distribution =
    process.env.MIGRATION_QUALIFICATION_WSL_DISTRO ?? 'Ubuntu-24.04';
  tunnelServer = createServer((socket) => {
    const child = spawn(
      'wsl.exe',
      [
        '-d',
        distribution,
        '--',
        'docker',
        'exec',
        '-i',
        container,
        'nc',
        '127.0.0.1',
        '5432',
      ],
      { stdio: ['pipe', 'pipe', 'ignore'] },
    );
    tunnelChildren.add(child);
    socket.pipe(child.stdin);
    child.stdout.pipe(socket);
    socket.on('error', () => child.kill());
    socket.on('close', () => child.kill());
    child.on('close', () => {
      tunnelChildren.delete(child);
      socket.end();
    });
  });
  await new Promise((resolve, reject) => {
    tunnelServer.once('error', reject);
    tunnelServer.listen(0, '127.0.0.1', resolve);
  });
  const address = tunnelServer.address();
  const url = new URL(urlValue);
  url.hostname = '127.0.0.1';
  url.port = String(address.port);
  return url.toString();
}

const adminUrl = await resolveAdminUrl(configuredAdminUrl);

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const productDirectory = join(root, 'packages/database/migrations');
const judgeDirectory = join(root, 'packages/judge-runtime/migrations');
const suffix = randomBytes(5).toString('hex');
const databasePrefix = `ojp_migration_q_${suffix}`;
const createdDatabases = [];
const createdRoles = [];
const temporaryDirectories = [];
const quiet = () => {};
const results = {};

const assert = (condition, message) => {
  if (!condition) throw new Error(`QUALIFICATION_ASSERTION_FAILED:${message}`);
};
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const databaseUrl = (name, source = adminUrl) => {
  const url = new URL(source);
  url.pathname = `/${name}`;
  return url.toString();
};

async function withClient(url, callback) {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function createDatabase(name) {
  await withClient(adminUrl, async (client) => {
    const existing = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    assert(
      existing.rowCount === 0,
      `disposable database already exists:${name}`,
    );
    await client.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
  });
  createdDatabases.push(name);
  return databaseUrl(name);
}

async function runScript(script, environment, argumentsAfterScript = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...argumentsAfterScript], {
      cwd: root,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(`QUALIFICATION_CHILD_FAILED:${script}:${stderr.trim()}`),
        );
    });
  });
}

async function assertLedger(url, label, manifest) {
  await withClient(url, async (client) => {
    const rows = await client.query(
      `SELECT version, checksum, count(*) OVER (PARTITION BY version) AS copies
       FROM public.${MIGRATION_LEDGER}
       WHERE label = $1`,
      [label],
    );
    assert(rows.rowCount === manifest.length, `${label} ledger count`);
    const byId = new Map(rows.rows.map((row) => [row.version, row]));
    for (const migration of manifest) {
      assert(
        byId.get(migration.id)?.checksum === migration.checksum,
        `${label} checksum:${migration.id}`,
      );
      assert(
        Number(byId.get(migration.id)?.copies) === 1,
        `${label} duplicate:${migration.id}`,
      );
    }
  });
}

async function qualifyFreshProduct() {
  const url = await createDatabase(`${databasePrefix}_product`);
  await runScript('scripts/migrate.mjs', { DATABASE_URL: url }, ['up']);
  const first = await runMigrationCommand({
    databaseUrl: url,
    directory: productDirectory,
    label: 'product',
    manifest: productMigrationManifest,
    log: quiet,
  });
  assert(
    first.appliedCount === productMigrationManifest.length,
    'fresh Product applied count',
  );
  assert(first.pendingCount === 0, 'fresh Product pending count');
  await assertLedger(url, 'product', productMigrationManifest);
  await runScript('scripts/migrate.mjs', { DATABASE_URL: url }, ['up']);
  const second = await runMigrationCommand({
    databaseUrl: url,
    directory: productDirectory,
    label: 'product',
    manifest: productMigrationManifest,
    command: 'status',
    log: quiet,
  });
  assert(second.pendingCount === 0, 'Product second run no-op');
  let crossDatabaseRefused = false;
  try {
    await runMigrationCommand({
      databaseUrl: url,
      directory: judgeDirectory,
      label: 'judge',
      manifest: judgeMigrationManifest,
      log: quiet,
    });
  } catch (error) {
    crossDatabaseRefused = error.message.startsWith(
      'MIGRATION_DATABASE_LABEL_CONFLICT:judge:found=product',
    );
  }
  assert(crossDatabaseRefused, 'Judge migration must refuse Product database');
  await withClient(url, async (client) => {
    assert(
      (
        await client.query(
          "SELECT to_regclass('public.judge_artifacts') IS NOT NULL AS ok",
        )
      ).rows[0].ok,
      'Product expected judge_artifacts table',
    );
    assert(
      !(
        await client.query(
          "SELECT to_regclass('public.judge_service_jobs') IS NOT NULL AS ok",
        )
      ).rows[0].ok,
      'Product must not contain Judge DB tables',
    );
  });
  results.productFresh = 'PASS';
  results.productSecondRun = 'PASS';
  return url;
}

async function qualifyHistoricalUpgradeAndRootCause() {
  const url = await createDatabase(`${databasePrefix}_upgrade`);
  const through = await runMigrationCommand({
    databaseUrl: url,
    directory: productDirectory,
    label: 'product',
    manifest: productMigrationManifest,
    toId: '0019_editor_code_drafts',
    log: quiet,
  });
  assert(
    through.pending[0] === '0020_judge_artifacts',
    '0019 boundary pending migration',
  );
  await withClient(url, async (client) => {
    assert(
      !(
        await client.query(
          "SELECT to_regclass('public.judge_artifacts') IS NOT NULL AS ok",
        )
      ).rows[0].ok,
      '0020 must not exist at 0019',
    );
  });
  const latest = await runMigrationCommand({
    databaseUrl: url,
    directory: productDirectory,
    label: 'product',
    manifest: productMigrationManifest,
    log: quiet,
  });
  assert(latest.pendingCount === 0, '0019 to latest');
  await assertLedger(url, 'product', productMigrationManifest);
  const migration0020 = await readFile(
    join(productDirectory, '0020_judge_artifacts.sql'),
    'utf8',
  );
  let replayError;
  await withClient(url, async (client) => {
    try {
      await client.query(migration0020);
    } catch (error) {
      replayError = error;
    }
  });
  assert(
    replayError?.code === '42P07',
    '0020 replay must reproduce duplicate relation',
  );
  assert(
    replayError?.message.includes('judge_artifacts'),
    '0020 conflicting relation name',
  );
  const second = await runMigrationCommand({
    databaseUrl: url,
    directory: productDirectory,
    label: 'product',
    manifest: productMigrationManifest,
    log: quiet,
  });
  assert(second.pendingCount === 0, 'upgrade second run no-op');
  results.product0019ToLatest = 'PASS';
  results.rootCause0020 = `${replayError.code}:judge_artifacts`;
}

async function qualifyAdoption() {
  const url = await createDatabase(`${databasePrefix}_adoption`);
  await withClient(url, async (client) => {
    for (const migration of productMigrationManifest) {
      await client.query(
        await readFile(join(productDirectory, `${migration.id}.sql`), 'utf8'),
      );
    }
  });
  let refused = false;
  try {
    await runMigrationCommand({
      databaseUrl: url,
      directory: productDirectory,
      label: 'product',
      manifest: productMigrationManifest,
      command: 'status',
      log: quiet,
    });
  } catch (error) {
    refused = error.message === 'MIGRATION_ADOPTION_REQUIRED:product';
  }
  assert(
    refused,
    'ledgerless existing Product schema must require explicit adoption',
  );
  const adopted = await runMigrationCommand({
    databaseUrl: url,
    directory: productDirectory,
    label: 'product',
    manifest: productMigrationManifest,
    command: 'adopt',
    log: quiet,
  });
  assert(
    adopted.appliedCount === productMigrationManifest.length,
    'adoption ledger count',
  );
  await assertLedger(url, 'product', productMigrationManifest);
  results.existingDatabaseAdoption = 'PASS';
}

async function qualifyAdoptionFailure() {
  const url = await createDatabase(`${databasePrefix}_adoption_refusal`);
  await withClient(url, async (client) => {
    await client.query(
      await readFile(
        join(productDirectory, '0000_platform_metadata.sql'),
        'utf8',
      ),
    );
  });
  let refused = false;
  try {
    await runMigrationCommand({
      databaseUrl: url,
      directory: productDirectory,
      label: 'product',
      manifest: productMigrationManifest,
      command: 'adopt',
      log: quiet,
    });
  } catch (error) {
    refused = error.message.startsWith(
      'MIGRATION_ADOPTION_EVIDENCE_FAILED:product:',
    );
  }
  assert(refused, 'partial Product schema adoption must fail closed');
  await withClient(url, async (client) => {
    const ledger = await client.query(
      `SELECT to_regclass('public.${MIGRATION_LEDGER}') IS NOT NULL AS ok`,
    );
    assert(!ledger.rows[0].ok, 'refused adoption must not create ledger');
  });
  results.adoptionFailClosed = 'PASS';
}

async function qualifyLegacyLedgerCompatibility() {
  const url = await createDatabase(`${databasePrefix}_legacy_ledger`);
  await withClient(url, async (client) => {
    for (const migration of productMigrationManifest) {
      await client.query(
        await readFile(join(productDirectory, `${migration.id}.sql`), 'utf8'),
      );
    }
    await client.query(`
      CREATE TABLE public.${MIGRATION_LEDGER} (
        label text NOT NULL,
        version text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (label, version)
      )
    `);
    for (const migration of productMigrationManifest) {
      await client.query(
        `INSERT INTO public.${MIGRATION_LEDGER}(label, version, checksum)
         VALUES ('product', $1, $2)`,
        [migration.id, migration.checksum],
      );
    }
  });
  const status = await runMigrationCommand({
    databaseUrl: url,
    directory: productDirectory,
    label: 'product',
    manifest: productMigrationManifest,
    log: quiet,
  });
  assert(status.pendingCount === 0, 'legacy Runtime Manager ledger reuse');
  results.legacyRuntimeLedgerCompatibility = 'PASS';
}

async function qualifyFreshJudge() {
  const databaseName = `${databasePrefix}_judge`;
  const roleName = `${databasePrefix}_runtime`;
  const password = randomBytes(24).toString('hex');
  await withClient(adminUrl, async (client) => {
    assert(
      (
        await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
          databaseName,
        ])
      ).rowCount === 0,
      'disposable Judge database must not pre-exist',
    );
    assert(
      (
        await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
          roleName,
        ])
      ).rowCount === 0,
      'disposable Judge role must not pre-exist',
    );
  });
  await runScript('scripts/judge-service-bootstrap.mjs', {
    JUDGE_DATABASE_ADMIN_URL: adminUrl,
    JUDGE_DATABASE_NAME: databaseName,
    JUDGE_DATABASE_ROLE: roleName,
    JUDGE_DATABASE_PASSWORD: password,
  });
  createdDatabases.push(databaseName);
  createdRoles.push(roleName);
  const url = databaseUrl(databaseName);
  await runScript(
    'scripts/judge-service-migrate.mjs',
    { JUDGE_DATABASE_URL: url, JUDGE_DATABASE_ROLE: roleName },
    ['up'],
  );
  const first = await runMigrationCommand({
    databaseUrl: url,
    directory: judgeDirectory,
    label: 'judge',
    manifest: judgeMigrationManifest,
    command: 'status',
    log: quiet,
  });
  assert(first.pendingCount === 0, 'fresh Judge pending count');
  await assertLedger(url, 'judge', judgeMigrationManifest);
  await runScript(
    'scripts/judge-service-migrate.mjs',
    { JUDGE_DATABASE_URL: url, JUDGE_DATABASE_ROLE: roleName },
    ['up'],
  );
  const second = await runMigrationCommand({
    databaseUrl: url,
    directory: judgeDirectory,
    label: 'judge',
    manifest: judgeMigrationManifest,
    command: 'status',
    log: quiet,
  });
  assert(second.pendingCount === 0, 'Judge second run no-op');
  await withClient(url, async (client) => {
    assert(
      !(
        await client.query(
          "SELECT to_regclass('public.users') IS NOT NULL AS ok",
        )
      ).rows[0].ok,
      'Judge must not contain Product tables',
    );
  });
  const runtimeUrl = new URL(url);
  runtimeUrl.username = roleName;
  runtimeUrl.password = password;
  await withClient(runtimeUrl.toString(), async (client) => {
    let createDenied = false;
    try {
      await client.query('CREATE TABLE forbidden_runtime_ddl(id integer)');
    } catch (error) {
      createDenied = error.code === '42501';
    }
    assert(createDenied, 'Judge runtime role must not create schema objects');
  });
  await withClient(adminUrl, async (client) => {
    const role = await client.query(
      'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1',
      [roleName],
    );
    assert(role.rowCount === 1, 'Judge runtime role exists');
    assert(
      !role.rows[0].rolsuper &&
        !role.rows[0].rolcreatedb &&
        !role.rows[0].rolcreaterole,
      'Judge runtime role flags',
    );
  });
  results.judgeFresh = 'PASS';
  results.judgeSecondRun = 'PASS';
  results.productJudgeIsolation = 'PASS';
  results.judgeRuntimePrivilegeBoundary = 'PASS';
}

async function qualifyRuntimeManagerWrapper() {
  const productUrl = await createDatabase(`${databasePrefix}_runtime_product`);
  const judgeUrl = await createDatabase(`${databasePrefix}_runtime_judge`);
  const cases = [
    {
      url: productUrl,
      directory: productDirectory,
      label: 'product',
      manifest: productMigrationManifest,
    },
    {
      url: judgeUrl,
      directory: judgeDirectory,
      label: 'judge',
      manifest: judgeMigrationManifest,
    },
  ];
  for (const item of cases) {
    const environment = {
      RUNTIME_MIGRATION_DATABASE_URL: item.url,
      RUNTIME_MIGRATION_DIRECTORY: item.directory,
      RUNTIME_MIGRATION_LABEL: item.label,
    };
    await runScript('scripts/dev-runtime-migrate.mjs', environment);
    await runScript('scripts/dev-runtime-migrate.mjs', environment);
    await assertLedger(item.url, item.label, item.manifest);
  }
  results.runtimeManagerCompatibility = 'PASS';
}

function syntheticManifest(id, sql, evidenceName) {
  return [
    {
      id,
      ordinal: 0,
      checksum: migrationChecksum(sql),
      transaction: 'transactional',
      sideEffects: 'Disposable qualification fixture.',
      evidence: [{ kind: 'table', name: evidenceName }],
    },
  ];
}

async function qualifyFailureRetryAndChecksum() {
  const url = await createDatabase(`${databasePrefix}_retry`);
  const directory = await mkdtemp(
    join(tmpdir(), 'ojplatform-migration-retry-'),
  );
  temporaryDirectories.push(directory);
  const id = '0000_failure_retry';
  const file = join(directory, `${id}.sql`);
  const failingSql =
    'CREATE TABLE retry_probe(id integer PRIMARY KEY); SELECT missing_function();\n';
  await writeFile(file, failingSql);
  let failed = false;
  try {
    await runMigrationCommand({
      databaseUrl: url,
      directory,
      label: 'retry',
      manifest: syntheticManifest(id, failingSql, 'retry_probe'),
      log: quiet,
    });
  } catch (error) {
    failed = error.message.startsWith(
      'MIGRATION_APPLY_FAILED:retry:0000_failure_retry:',
    );
  }
  assert(failed, 'synthetic migration must fail');
  await withClient(url, async (client) => {
    assert(
      !(
        await client.query(
          "SELECT to_regclass('public.retry_probe') IS NOT NULL AS ok",
        )
      ).rows[0].ok,
      'failed migration table rollback',
    );
    assert(
      !(
        await client.query(
          `SELECT to_regclass('public.${MIGRATION_LEDGER}') IS NOT NULL AS ok`,
        )
      ).rows[0].ok,
      'failed first migration ledger rollback',
    );
  });
  const passingSql = 'CREATE TABLE retry_probe(id integer PRIMARY KEY);\n';
  await writeFile(file, passingSql);
  await runMigrationCommand({
    databaseUrl: url,
    directory,
    label: 'retry',
    manifest: syntheticManifest(id, passingSql, 'retry_probe'),
    log: quiet,
  });
  const mutatedSql = `${passingSql}ALTER TABLE retry_probe ADD COLUMN forbidden_mutation boolean;\n`;
  await writeFile(file, mutatedSql);
  let mismatch = false;
  try {
    await runMigrationCommand({
      databaseUrl: url,
      directory,
      label: 'retry',
      manifest: syntheticManifest(id, mutatedSql, 'retry_probe'),
      log: quiet,
    });
  } catch (error) {
    mismatch =
      error.message === 'MIGRATION_CHECKSUM_MISMATCH:retry:0000_failure_retry';
  }
  assert(mismatch, 'applied checksum mutation must fail closed');
  await withClient(url, async (client) => {
    const column = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'retry_probe'
           AND column_name = 'forbidden_mutation'
       ) AS ok`,
    );
    assert(!column.rows[0].ok, 'checksum mismatch must execute no SQL');
  });
  results.failureRollback = 'PASS';
  results.retrySafety = 'PASS';
  results.checksumMutation = 'PASS';
}

async function qualifyConcurrency() {
  const url = await createDatabase(`${databasePrefix}_concurrency`);
  const directory = await mkdtemp(
    join(tmpdir(), 'ojplatform-migration-concurrency-'),
  );
  temporaryDirectories.push(directory);
  const id = '0000_concurrency_probe';
  const sql =
    'SELECT pg_sleep(1); CREATE TABLE concurrency_probe(id integer PRIMARY KEY);\n';
  await writeFile(join(directory, `${id}.sql`), sql);
  const manifest = syntheticManifest(id, sql, 'concurrency_probe');
  const logs = [[], []];
  await Promise.all(
    logs.map((target) =>
      runMigrationCommand({
        databaseUrl: url,
        directory,
        label: 'concurrency',
        manifest,
        log: (message) => target.push(message),
      }),
    ),
  );
  await assertLedger(url, 'concurrency', manifest);
  assert(
    logs.flat().filter((message) => message === `Applying ${id}...`).length ===
      1,
    'only one concurrent runner applies migration',
  );
  assert(
    logs
      .flat()
      .filter((message) => message === 'Migration concurrency up to date')
      .length === 1,
    'waiting concurrent runner exits up to date',
  );
  results.concurrentMigrators = 'PASS (WAIT)';
}

async function cleanup() {
  for (const name of createdDatabases.reverse()) {
    await withClient(adminUrl, async (client) => {
      await client.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`,
      );
    });
  }
  for (const name of createdRoles.reverse()) {
    await withClient(adminUrl, async (client) => {
      await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(name)}`);
    });
  }
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  for (const child of tunnelChildren) child.kill();
  if (tunnelServer) {
    await new Promise((resolve) => tunnelServer.close(resolve));
  }
}

try {
  await qualifyFreshProduct();
  await qualifyHistoricalUpgradeAndRootCause();
  await qualifyAdoption();
  await qualifyAdoptionFailure();
  await qualifyLegacyLedgerCompatibility();
  await qualifyFreshJudge();
  await qualifyRuntimeManagerWrapper();
  await qualifyFailureRetryAndChecksum();
  await qualifyConcurrency();
  console.log(JSON.stringify({ status: 'PASS', ...results }, null, 2));
} finally {
  await cleanup();
}
