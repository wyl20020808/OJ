import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import pg from 'pg';
import { RedisJudgeJobRepository } from '../apps/api/src/modules/judge/repository.ts';

const port = process.env.PHASE1E_API_PORT ?? '3021';
const base = `http://127.0.0.1:${port}`;
const controlKey =
  process.env.OJPLATFORM_PHASE1E_QUALIFICATION_CONTROL_KEY ??
  'phase1er-local-qualification-control';
const qualificationPrefix = 'oj:judge:qualification';
const env = {
  ...process.env,
  OJPLATFORM_PHASE1E_QUALIFICATION: 'true',
  OJPLATFORM_PHASE1E_QUALIFICATION_CONTROL_KEY: controlKey,
  OJPLATFORM_PHASE1E_REDIS_KEY_PREFIX: qualificationPrefix,
  PHASE1E_API_PORT: port,
};
const request = async (path, init = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = response.status === 204 ? undefined : await response.json();
  return { response, body };
};
const assertStatus = (result, status, label) => {
  if (result.response.status !== status)
    throw new Error(
      `${label} expected ${status}, got ${result.response.status}`,
    );
  return result.body;
};
const harness = (command) =>
  execFileSync(
    process.execPath,
    ['scripts/api-lifecycle-harness.mjs', command],
    { cwd: process.cwd(), env, stdio: 'pipe', encoding: 'utf8' },
  ).trim();
const harnessState = async () =>
  JSON.parse(await readFile('.phase1e-api-harness.json', 'utf8'));
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function infraStatus(redis) {
  const client = new pg.Client({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform',
  });
  await client.connect();
  try {
    await client.query('SELECT 1');
    await redis.ping();
    const ready = await fetch(`${base}/ready`);
    return { postgres: true, redis: true, apiReady: ready.ok };
  } finally {
    await client.end();
  }
}

async function createSubmission(auth, suffix, label) {
  const problem = await request('/api/problems', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      slug: `bridge-${label}-${suffix}`,
      title: `Bridge ${label}`,
      statement: 'Qualification-only metadata.',
      inputDescription: 'n',
      outputDescription: 'n',
      examples: [{ input: '1', output: '1' }],
      constraints: 'none',
      timeLimitMs: 1000,
      memoryLimitBytes: 65536,
      visibility: 'public',
      status: 'published',
      testdataVersion: `bridge-${label}-${suffix}`,
    }),
  });
  const problemBody = assertStatus(problem, 201, `${label} problem`);
  const submission = await request('/api/submissions', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      problemId: problemBody.id,
      problemRevisionId: problemBody.currentRevisionId,
      testdataVersionRef: problemBody.testdataVersion,
      languageId: 'javascript',
      source: 'BRIDGE_INERT_SOURCE_MARKER_DO_NOT_EXECUTE',
    }),
  });
  return assertStatus(submission, 201, `${label} submission`);
}

async function fixture(auth, id, action) {
  return request(`/api/qualification/judge/${id}/${action}`, {
    method: 'POST',
    headers: {
      ...auth,
      'x-ojplatform-qualification-control': controlKey,
    },
    body: '{}',
  });
}

await harness('restart');
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const username = `bridge${Date.now().toString().slice(-10)}`;
const password = 'BridgePassword123!';
const registration = await request('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    username,
    email: `${username}@example.test`,
    displayName: 'Bridge',
    password,
  }),
});
assertStatus(registration, 201, 'registration');
const login = await request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ identity: username, password }),
});
assertStatus(login, 200, 'login');
const cookie = login.response.headers.get('set-cookie');
if (!cookie) throw new Error('login did not establish a session');
const auth = { cookie };
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:56379');
const queue = new RedisJudgeJobRepository(redis, qualificationPrefix);

try {
  const priorQualificationKeys = await redis.keys(`${qualificationPrefix}:*`);
  if (priorQualificationKeys.length > 0)
    await redis.del(...priorQualificationKeys);
  const r05Submission = await createSubmission(auth, suffix, 'r05');
  const r05Id = r05Submission.judgeJobId;
  if (!r05Id) throw new Error('R05 Judge job was not projected');
  const r05Before = assertStatus(
    await request(`/api/judge/jobs/${r05Id}`, { headers: auth }),
    200,
    'R05 before restart',
  );
  const r05PidBefore = (await harnessState()).pid;
  const r05InfraBefore = await infraStatus(redis);
  harness('restart');
  const r05PidAfter = (await harnessState()).pid;
  const r05InfraAfter = await infraStatus(redis);
  const r05After = assertStatus(
    await request(`/api/judge/jobs/${r05Id}`, { headers: auth }),
    200,
    'R05 after restart',
  );
  const duplicate = await queue.enqueue({
    submissionId: r05Submission.id,
    ownerUserId: r05Submission.ownerUserId,
    problemId: r05Submission.problemId,
    problemRevisionId: r05Submission.problemRevisionId,
    testdataVersionRef: r05Submission.testdataVersionRef,
    languageId: r05Submission.languageId,
  });
  if (duplicate.created || duplicate.job.id !== r05Id)
    throw new Error('R05 idempotency did not retain the original Judge job');
  assertStatus(await fixture(auth, r05Id, 'claim'), 200, 'R05 fixture claim');
  const r05Done = assertStatus(
    await fixture(auth, r05Id, 'complete'),
    200,
    'R05 fixture completion',
  );

  const r06ValidSubmission = await createSubmission(auth, suffix, 'r06-valid');
  const r06ValidId = r06ValidSubmission.judgeJobId;
  if (!r06ValidId) throw new Error('R06 valid Judge job was not projected');
  const r06ValidClaim = assertStatus(
    await fixture(auth, r06ValidId, 'claim'),
    200,
    'R06 valid fixture claim',
  );
  const r06ValidBefore = (await harnessState()).pid;
  harness('restart');
  const r06ValidAfter = (await harnessState()).pid;
  const r06ValidDone = assertStatus(
    await fixture(auth, r06ValidId, 'complete'),
    200,
    'R06 valid fixture completion',
  );

  const r06ExpirySubmission = await createSubmission(
    auth,
    suffix,
    'r06-expiry',
  );
  const r06ExpiryId = r06ExpirySubmission.judgeJobId;
  if (!r06ExpiryId) throw new Error('R06 expiry Judge job was not projected');
  const oldLease = await queue.claimById(r06ExpiryId, 'bridge-old-worker', 5);
  if (!oldLease) throw new Error('R06 expiry initial claim failed');
  await wait(25);
  harness('restart');
  const recovered = await queue.recoverStale();
  const newLease = await queue.claimById(
    r06ExpiryId,
    'bridge-recovery-worker',
    30_000,
  );
  if (!newLease || recovered !== 1)
    throw new Error('R06 expiry recovery did not create a new lease');
  const oldTokenRejected = await queue
    .complete(r06ExpiryId, oldLease.leaseToken, 'control-pass-v1')
    .then(() => false)
    .catch(() => true);
  if (!oldTokenRejected) throw new Error('R06 stale lease token was accepted');
  const r06ExpiryDone = await queue.complete(
    r06ExpiryId,
    newLease.leaseToken,
    'control-pass-v1',
  );

  const finalPublic = assertStatus(
    await request(`/api/judge/jobs/${r05Id}`, { headers: auth }),
    200,
    'projection audit',
  );
  if (
    /leaseToken|leaseOwner|leaseExpiresAt|ownerUserId|source|redis|password|secret/i.test(
      JSON.stringify(finalPublic),
    )
  )
    throw new Error('public Judge projection leaked an internal field');

  console.log(
    JSON.stringify({
      R05: {
        sameJob: r05Before.id === r05After.id && r05After.id === r05Id,
        noDuplicate: !duplicate.created && duplicate.job.id === r05Id,
        attemptStableBeforeFixture: r05Before.attempt === r05After.attempt,
        syntheticCompleted: r05Done.status === 'SUCCEEDED_FAKE',
        apiPidChanged: r05PidBefore !== r05PidAfter,
        infraBefore: r05InfraBefore,
        infraAfter: r05InfraAfter,
      },
      R06: {
        validLeaseAttempt: r06ValidClaim.attempt,
        validLeaseSurvivedRestart: r06ValidDone.status === 'SUCCEEDED_FAKE',
        validLeaseApiPidChanged: r06ValidBefore !== r06ValidAfter,
        expiryRecovered: recovered === 1,
        newAttempt: newLease.job.attempt,
        oldTokenRejected,
        recoveredCompletion: r06ExpiryDone.status === 'SUCCEEDED_FAKE',
      },
      projection: { forbiddenFieldsAbsent: true },
      sourceExecution: 'not invoked; inert source was stored only',
    }),
  );
} finally {
  await redis.quit();
}
