import { spawn } from 'node:child_process';
import { once } from 'node:events';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';
const binary = process.env.WORKER_BINARY ?? 'dist/judge-worker.exe';
const prefix = `oj:judge:qualification-${Date.now()}`;
const heartbeatPrefix = 'oj:judge:workers';
const redis = new Redis(redisUrl);
const logs = new Map();
const workers = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const key = (kind, id) => `${prefix}:${kind}:${id}`;

async function waitFor(label, predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(25);
  }
  throw new Error(`${label} timed out`);
}

async function createJob(fixtureId) {
  const id = randomUUID();
  const job = {
    id,
    submissionId: `qualification-submission-${id}`,
    idempotencyKey: `submission:qualification-${id}`,
    ownerUserId: 'qualification-owner',
    problemId: 'qualification-problem',
    problemRevisionId: 'qualification-revision',
    testdataVersionRef: 'qualification-testdata',
    languageId: 'qualification',
    status: 'QUEUED',
    attempt: 0,
    maxAttempts: 3,
    fixtureId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await redis.set(key('job', id), JSON.stringify(job));
  await redis.set(key('submission', job.submissionId), id);
  await redis.lpush(`${prefix}:queue`, id);
  return { id, job };
}

function startWorker(workerId, healthPort) {
  const output = [];
  const child = spawn(binary, [], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      REDIS_URL: redisUrl,
      QUEUE_PREFIX: prefix,
      HEARTBEAT_PREFIX: heartbeatPrefix,
      WORKER_ID: workerId,
      HEALTH_ADDR: `127.0.0.1:${healthPort}`,
      HEARTBEAT_INTERVAL_MS: '100',
      LIVENESS_TIMEOUT_MS: '500',
      LEASE_MS: '3000',
      SHUTDOWN_TIMEOUT_MS: '3000',
    },
  });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  logs.set(workerId, output);
  workers.set(workerId, child);
  return child;
}

async function job(id) {
  return JSON.parse((await redis.get(key('job', id))) ?? 'null');
}

try {
  const first = createJob('FX-SLOW');
  const cancelled = createJob('FX-SUCCESS');
  const [crashJob, beforeClaimJob] = await Promise.all([first, cancelled]);

  // Authoritative cancel before claim: the queue entry remains harmless.
  const cancelledState = {
    ...beforeClaimJob.job,
    status: 'CANCELLED',
    failureReason: 'cancelled',
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await redis.set(
    key('job', beforeClaimJob.id),
    JSON.stringify(cancelledState),
  );
  await redis.set(
    key('cancel', beforeClaimJob.id),
    new Date().toISOString(),
    'PX',
    86400000,
  );

  const workerA = startWorker('worker-a', 28180);
  const crashLease = await waitFor('Worker A/B lease', async () => {
    const current = await job(crashJob.id);
    return current?.status === 'LEASED_FAKE' ? current : null;
  });
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(workerA.pid), '/T', '/F']);
  } else {
    workerA.kill('SIGKILL');
  }
  await once(workerA, 'exit');
  const workerB = startWorker('worker-b', 28181);
  let recovered;
  try {
    recovered = await waitFor(
      'Worker B crash recovery',
      async () => {
        const current = await job(crashJob.id);
        return current?.status === 'SUCCEEDED_FAKE' && current.attempt >= 2
          ? current
          : null;
      },
      8000,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        crashJob: await job(crashJob.id),
        workerBLog: logs.get('worker-b')?.join(''),
      }),
    );
    throw error;
  }

  const duringJob = await createJob('FX-CANCEL');
  const duringLease = await waitFor('FX-CANCEL lease', async () => {
    const current = await job(duringJob.id);
    return current?.status === 'LEASED_FAKE' ? current : null;
  });
  await redis.set(
    key('cancel', duringJob.id),
    new Date().toISOString(),
    'PX',
    86400000,
  );
  const duringCancelled = await waitFor('FX-CANCEL cancellation', async () => {
    const current = await job(duringJob.id);
    return current?.status === 'CANCELLED' ? current : null;
  });
  const beforeClaim = await job(beforeClaimJob.id);
  const heartbeatKeys = await redis.keys(`${heartbeatPrefix}:*`);
  const heartbeatRecords = await Promise.all(
    heartbeatKeys.map(async (k) => JSON.parse((await redis.get(k)) ?? 'null')),
  );
  console.log(
    JSON.stringify({
      prefix,
      crashRecovery: {
        leaseOwner: crashLease.leaseOwner,
        leaseAttempt: crashLease.attempt,
        finalStatus: recovered.status,
        finalAttempt: recovered.attempt,
        workerBAlive: workerB.exitCode === null,
      },
      cancelBeforeClaim: {
        status: beforeClaim.status,
        attempt: beforeClaim.attempt,
      },
      cancelDuringFixture: {
        leaseAttempt: duringLease.attempt,
        finalStatus: duringCancelled.status,
        finalAttempt: duringCancelled.attempt,
      },
      heartbeats: heartbeatRecords.filter(Boolean).map((record) => ({
        worker_id: record.worker_id,
        worker_instance_id: record.worker_instance_id,
        state: record.state,
        safe_fixture: record.safe_fixture,
        real_sandboxed_execution: record.real_sandboxed_execution,
      })),
      logsContainSource: [...logs.values()].some((parts) =>
        /INERT|system\(|eval\(|shell/i.test(parts.join('')),
      ),
    }),
  );
} finally {
  for (const child of workers.values()) {
    if (child.exitCode === null) child.kill();
  }
  await sleep(150);
  await redis.quit();
}
