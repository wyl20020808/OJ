import { createHash, randomUUID } from 'node:crypto';

const baseUrl = process.env.JUDGE_SERVICE_URL ?? 'http://127.0.0.1:3107';
const token = process.env.JUDGE_SERVICE_TOKEN;
if (!token) throw new Error('JUDGE_SERVICE_TOKEN is required');
const timeoutMs = 90_000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const checkerConfig = (type) => hash(`${type}\0builtin-v1`);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sources = {
  ac: '#include <iostream>\nint main(){int x;std::cin>>x;std::cout<<x<<"\\n";}\n',
  wa: '#include <iostream>\nint main(){int x;std::cin>>x;std::cout<<x+1<<"\\n";}\n',
  ce: 'int main( { return 0; }\n',
  re: 'int main(){return 7;}\n',
  tle: 'int main(){for(;;){} }\n',
  mle: '#include <vector>\nint main(){std::vector<char> x(256*1024*1024,1);return x[0];}\n',
};

function manifest(label, input = '42\n', expected = '42\n') {
  const entry = {
    index: 0,
    testcaseId: `${label}-case-0`,
    testdataVersionId: 'phase2c7a-testdata-v1',
    input,
    inputSha256: hash(input),
    executionProfileId: 'cpp20-gcc-13-v1',
    expectedOutput: expected,
    expectedOutputSha256: hash(expected),
    checkerType: 'EXACT_BYTES',
    checkerVersion: 'builtin-v1',
    checkerConfigSha256: checkerConfig('EXACT_BYTES'),
  };
  const fields = [
    '2C.4',
    'phase2c7a-problem',
    'phase2c7a-revision-v1',
    'phase2c7a-testdata-v1',
    `${label}-set`,
    'cpp20-gcc-13-v1',
    '1',
    '0',
    entry.testcaseId,
    entry.testdataVersionId,
    entry.inputSha256,
    entry.executionProfileId,
    entry.expectedOutputSha256,
    '2C.5',
    entry.checkerType,
    entry.checkerVersion,
    entry.checkerConfigSha256,
  ];
  return {
    problemId: 'phase2c7a-problem',
    problemRevisionId: 'phase2c7a-revision-v1',
    testdataVersionId: 'phase2c7a-testdata-v1',
    testcaseSetId: `${label}-set`,
    executionProfileId: 'cpp20-gcc-13-v1',
    entries: [entry],
    manifestHash: hash(fields.join('\0')),
  };
}

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      'x-judge-service-token': token,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function submit(label, source, expected = '42\n') {
  const id = randomUUID();
  const testcaseSet = manifest(`${label}-${id}`, '42\n', expected);
  const body = {
    clientRequestId: `phase2c7a:${label}:${id}`,
    externalSubmissionId: `phase2c7a-external:${label}:${id}`,
    problemId: testcaseSet.problemId,
    problemRevisionId: testcaseSet.problemRevisionId,
    testdataVersionRef: 'phase2c7a-testdata-v1',
    testcaseSet,
    languageId: 'cpp20',
    executionMode: 'REAL_SANDBOXED_EXECUTION',
    languageProfileId: 'cpp20-gcc-13-v1',
    sourceSnapshotRef: `phase2c7a:${id}`,
    sourceBytes: source,
    sourceSha256: hash(source),
    controlledInputId: 'stdin-empty-v1',
    executionSetPolicy: 'RUN_ALL',
  };
  return { body, job: await request('/v1/jobs', { method: 'POST', body: JSON.stringify(body) }) };
}

async function terminal(jobId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await request(`/v1/jobs/${jobId}`);
    if (['COMPLETED_WITH_VERDICT', 'CANCELLED', 'INFRA_FAILED', 'NO_VERDICT'].includes(job.status)) return job;
    await wait(100);
  }
  throw new Error(`timed out: ${jobId}`);
}

if (process.env.PHASE2C7A_EXPECT_INFRA === 'true') {
  const { job } = await submit('infra', sources.ac);
  const result = await terminal(job.judgeJobId);
  if (result.status !== 'INFRA_FAILED' || result.verdict)
    throw new Error(`infra failure was not verdict-free: ${JSON.stringify(result)}`);
  console.log(JSON.stringify({ INFRA: 'PASS' }));
  process.exit(0);
}

const evidence = {};
for (const [label, verdict, expected] of [
  ['ac', 'AC', '42\n'],
  ['wa', 'WA', '42\n'],
  ['ce', 'CE', '42\n'],
  ['re', 'RE', '42\n'],
  ['tle', 'TLE', '42\n'],
  ['mle', 'MLE', '42\n'],
]) {
  const { body, job } = await submit(label, sources[label], expected);
  const result = await terminal(job.judgeJobId);
  if (result.status !== 'COMPLETED_WITH_VERDICT' || result.verdict !== verdict)
    throw new Error(`${label} expected ${verdict}: ${JSON.stringify(result)}`);
  evidence[label.toUpperCase()] = 'PASS';
  if (label === 'ac') {
    const duplicate = await request('/v1/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (duplicate.judgeJobId !== job.judgeJobId)
      throw new Error('duplicate submit changed judge job identity');
    evidence.DUPLICATE = 'PASS';
  }
}

const cancellation = await submit('cancel', sources.tle);
const cancelled = await request(`/v1/jobs/${cancellation.job.judgeJobId}/cancel`, { method: 'POST' });
if (cancelled.status !== 'CANCELLED' || cancelled.verdict) throw new Error('cancellation became a verdict');
evidence.CANCEL = 'PASS';

const historySeed = await submit('history', sources.ac);
await terminal(historySeed.job.judgeJobId);
const rejudge = await request(`/v1/jobs/${historySeed.job.judgeJobId}/rejudge`, {
  method: 'POST',
  body: JSON.stringify({ clientRequestId: `phase2c7a:rejudge:${randomUUID()}` }),
});
await terminal(rejudge.judgeJobId);
const history = await request(`/v1/jobs/${historySeed.job.judgeJobId}/history`);
if (history.items.length < 2 || history.items[0].evaluationGeneration !== 1 || history.items[1].evaluationGeneration !== 2)
  throw new Error(`immutable history missing: ${JSON.stringify(history)}`);
evidence.REJUDGE_HISTORY = 'PASS';
console.log(JSON.stringify(evidence));
