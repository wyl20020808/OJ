import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:56385';
const prefix = process.env.PHASE2C5_QUEUE_PREFIX ?? 'oj:judge:phase2c5';
const timeoutMs = 90_000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const checkerConfig = (type) => hash(`${type}\0builtin-v1`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

const echo = `#include <iostream>
#include <string>
int main(){std::string s; std::getline(std::cin,s); std::cout<<s<<"\\n";}
`;
const compileError = 'int main( { return 0; }\n';
const runtimeError = 'int main(){return 7;}\n';
const timeLimit = 'int main(){for(;;){} }\n';
const memoryLimit = '#include <vector>\nint main(){std::vector<char> x(256*1024*1024, 1); return x[0];}\n';

function manifest(label, cases, type = 'EXACT_BYTES') {
  const entries = cases.map(({ input, expected }, index) => ({
    index,
    testcaseId: `${label}-case-${index}`,
    testdataVersionId: 'phase2c5-testdata-v1',
    input,
    inputSha256: hash(input),
    executionProfileId: 'cpp20-gcc-13-v1',
    expectedOutput: expected,
    expectedOutputSha256: hash(expected),
    checkerType: type,
    checkerVersion: 'builtin-v1',
    checkerConfigSha256: checkerConfig(type),
  }));
  const fields = [
    '2C.4', 'phase2c5-problem', 'phase2c5-revision-v1',
    'phase2c5-testdata-v1', `${label}-set`, 'cpp20-gcc-13-v1', String(entries.length),
    ...entries.flatMap((entry) => [
      String(entry.index), entry.testcaseId, entry.testdataVersionId,
      entry.inputSha256, entry.executionProfileId, entry.expectedOutputSha256,
      '2C.5', entry.checkerType, entry.checkerVersion, entry.checkerConfigSha256,
    ]),
  ];
  return { problemId: 'phase2c5-problem', problemRevisionId: 'phase2c5-revision-v1', testdataVersionId: 'phase2c5-testdata-v1', testcaseSetId: `${label}-set`, executionProfileId: 'cpp20-gcc-13-v1', entries, manifestHash: hash(fields.join('\0')) };
}

async function enqueue(label, source, cases, type = 'EXACT_BYTES') {
  const id = `phase2c5-${label}-${randomUUID()}`;
  const m = manifest(label, cases, type);
  const now = new Date().toISOString();
  const job = {
    id, submissionId: `submission-${id}`, idempotencyKey: `submission:submission-${id}`,
    ownerUserId: 'phase2c5-owner', problemId: m.problemId, problemRevisionId: m.problemRevisionId,
    testdataVersionRef: m.testdataVersionId, languageId: 'cpp20', executionMode: 'REAL_SANDBOXED_EXECUTION',
    languageProfileId: 'cpp20-gcc-13-v1', sourceSnapshotRef: `submission:${id}`,
    sourceBytes: source, sourceSha256: hash(source), controlledInputId: 'stdin-empty-v1',
    testcaseSet: m, executionSetPolicy: 'RUN_ALL', status: 'QUEUED', attempt: 0, maxAttempts: 3,
    createdAt: now, updatedAt: now,
  };
  await redis.set(`${prefix}:job:${id}`, JSON.stringify(job));
  await redis.set(`${prefix}:submission:${job.submissionId}`, id);
  await redis.lpush(`${prefix}:queue`, id);
  return job;
}

async function waitFor(job) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await redis.get(`${prefix}:job:${job.id}`);
    if (raw) {
      const current = JSON.parse(raw);
      if (['COMPLETED', 'CANCELLED', 'FAILED_TERMINAL'].includes(current.status)) return current;
    }
    await sleep(100);
  }
  throw new Error(`timeout: ${job.id}`);
}

async function waitForLease(job) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const current = JSON.parse(await redis.get(`${prefix}:job:${job.id}`));
    if (current.status === 'LEASED') return current;
    await sleep(25);
  }
  throw new Error(`lease timeout: ${job.id}`);
}

function assertVerdict(job, expected) {
  if (job.status !== 'COMPLETED') throw new Error(`job not completed: ${job.status}`);
  const verdict = job.rawExecutionResult?.verdict_record;
  if (!verdict) throw new Error('missing immutable verdict record');
  if (verdict.overall_user_verdict !== expected || verdict.evaluation_state !== 'COMPLETE')
    throw new Error(`expected ${expected}, got ${JSON.stringify(verdict)}`);
  const cases = verdict.cases ?? [];
  if (expected === 'CE' && cases.length !== 0) throw new Error('CE created testcase verdicts');
  if (expected !== 'CE' && !cases.every((item) => item.execution_set_attempt_id === job.executionAttemptId))
    throw new Error('case attempt binding mismatch');
}

try {
  await redis.connect();
  const existingKeys = await redis.keys(`${prefix}:*`);
  if (existingKeys.length > 0) await redis.del(...existingKeys);
  const ac = await enqueue('ac', echo, [{ input: '42\n', expected: '42\n' }]);
  assertVerdict(await waitFor(ac), 'AC');
  const wa = await enqueue('wa', echo, [{ input: '42\n', expected: '41\n' }]);
  assertVerdict(await waitFor(wa), 'WA');
  const token = await enqueue('token', echo, [{ input: 'a b\n', expected: 'a\t b \n' }], 'TOKEN_WHITESPACE');
  assertVerdict(await waitFor(token), 'AC');
  const ce = await enqueue('ce', compileError, [{ input: '', expected: '' }]);
  assertVerdict(await waitFor(ce), 'CE');
  const re = await enqueue('re', runtimeError, [{ input: '', expected: '' }]);
  assertVerdict(await waitFor(re), 'RE');
  const tle = await enqueue('tle', timeLimit, [{ input: '', expected: '' }]);
  assertVerdict(await waitFor(tle), 'TLE');
  const mle = await enqueue('mle', memoryLimit, [{ input: '', expected: '' }]);
  assertVerdict(await waitFor(mle), 'MLE');
  const mixed = await enqueue('mixed', echo, [
    { input: 'ok\n', expected: 'ok\n' }, { input: 'first\n', expected: 'wrong\n' }, { input: 'later\n', expected: 'other\n' },
  ]);
  const mixedResult = await waitFor(mixed);
  assertVerdict(mixedResult, 'WA');
  if (mixedResult.rawExecutionResult.verdict_record.cases.length !== 3)
    throw new Error('RUN_ALL was not preserved after WA');
  const duplicate = await enqueue('duplicate', echo, [{ input: 'same\n', expected: 'same\n' }]);
  const duplicateResult = await waitFor(duplicate);
  const duplicateRaw = JSON.stringify(duplicateResult.rawExecutionResult);
  await redis.set(`${prefix}:job:${duplicate.id}`, JSON.stringify(duplicateResult));
  if ((await redis.get(`${prefix}:job:${duplicate.id}`)) === '')
    throw new Error('duplicate authoritative record lost');
  if (JSON.stringify((await waitFor(duplicate)).rawExecutionResult) !== duplicateRaw)
    throw new Error('duplicate verdict record changed');
  const sequential = [];
  for (let index = 0; index < 20; index += 1) {
    const job = await enqueue(`soak-${index}`, echo, [
      { input: `pass-${index}\n`, expected: `pass-${index}\n` },
      { input: `fail-${index}\n`, expected: `other-${index}\n` },
    ]);
    const result = await waitFor(job);
    assertVerdict(result, 'WA');
    if (result.rawExecutionResult.verdict_record.cases.length !== 2)
      throw new Error('sequential RUN_ALL failure');
    sequential.push(result.rawExecutionResult.verdict_record.digest);
  }
  const pairJobs = Array.from({ length: 20 }, (_, index) =>
    enqueue(`pair-${index}`, echo, [{ input: `pair-${index}\n`, expected: `pair-${index}\n` }]));
  const pairResults = await Promise.all((await Promise.all(pairJobs)).map(waitFor));
  if (pairResults.some((result) => result.rawExecutionResult.verdict_record.overall_user_verdict !== 'AC'))
    throw new Error('concurrent pair verdict mismatch');
  if (new Set(pairResults.map((result) => result.executionAttemptId)).size !== pairResults.length)
    throw new Error('concurrent attempt identities collided');
  const cancelled = await enqueue('cancelled', timeLimit, [{ input: '', expected: '' }]);
  await waitForLease(cancelled);
  await redis.set(`${prefix}:cancel:${cancelled.id}`, '1');
  const cancelledResult = await waitFor(cancelled);
  if (cancelledResult.status !== 'CANCELLED' || cancelledResult.rawExecutionResult)
    throw new Error('cancelled set produced a real verdict');
  console.log(JSON.stringify({ AC: 'PASS', WA: 'PASS', TOKEN: 'PASS', CE: 'PASS', RE: 'PASS', TLE: 'PASS', MLE: 'PASS', MIXED_RUN_ALL: 'PASS', DUPLICATE: 'PASS', CANCEL: 'PASS', SEQUENTIAL_SETS: sequential.length, CONCURRENT_SETS: pairResults.length }));
} finally {
  await redis.quit();
}
