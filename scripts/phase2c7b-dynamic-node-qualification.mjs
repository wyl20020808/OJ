import { createHash, randomUUID } from 'node:crypto';

// This is an HTTP evidence harness. It deliberately does not start, stop, or
// configure the Judge Service, Worker, Supervisor, Redis, PostgreSQL, or runc.
const baseUrl = process.env.JUDGE_SERVICE_URL;
const serviceToken = process.env.JUDGE_SERVICE_TOKEN;
const nodeToken = process.env.JUDGE_NODE_TOKEN;
const nodeA = process.env.PHASE2C7B_NODE_A_ID;
const nodeAIncarnation = process.env.PHASE2C7B_NODE_A_INCARNATION;
const nodeB = process.env.PHASE2C7B_NODE_B_ID;
const nodeBIncarnation = process.env.PHASE2C7B_NODE_B_INCARNATION;
const runRealJob = process.env.PHASE2C7B_RUN_REAL_JOB === 'true';

for (const [name, value] of Object.entries({
  JUDGE_SERVICE_URL: baseUrl,
  JUDGE_SERVICE_TOKEN: serviceToken,
  JUDGE_NODE_TOKEN: nodeToken,
  PHASE2C7B_NODE_A_ID: nodeA,
  PHASE2C7B_NODE_A_INCARNATION: nodeAIncarnation,
  PHASE2C7B_NODE_B_ID: nodeB,
  PHASE2C7B_NODE_B_INCARNATION: nodeBIncarnation,
})) {
  if (!value)
    throw new Error(
      `${name} is required; start the service and both nodes externally first`,
    );
}
if (nodeA === nodeB || nodeAIncarnation === nodeBIncarnation)
  throw new Error('two distinct node IDs and incarnations are required');

const hash = (value) => createHash('sha256').update(value).digest('hex');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, { node = false, expected = [200], ...init } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      ...(node
        ? { 'x-judge-node-token': nodeToken }
        : { 'x-judge-service-token': serviceToken }),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!expected.includes(response.status))
    throw new Error(
      `${path} returned ${response.status}: ${JSON.stringify(body)}`,
    );
  return { status: response.status, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function manifest(label) {
  const input = '42\n';
  const expectedOutput = '42\n';
  const entry = {
    index: 0,
    testcaseId: `${label}-case-0`,
    testdataVersionId: 'phase2c7b-testdata-v1',
    input,
    inputSha256: hash(input),
    executionProfileId: 'cpp20-gcc-13-v1',
    expectedOutput,
    expectedOutputSha256: hash(expectedOutput),
    checkerType: 'EXACT_BYTES',
    checkerVersion: 'builtin-v1',
    checkerConfigSha256: hash('EXACT_BYTES\0builtin-v1'),
  };
  return {
    problemId: 'phase2c7b-problem',
    problemRevisionId: 'phase2c7b-revision-v1',
    testdataVersionId: 'phase2c7b-testdata-v1',
    testcaseSetId: `${label}-set`,
    executionProfileId: 'cpp20-gcc-13-v1',
    entries: [entry],
    manifestHash: hash(
      [
        '2C.4',
        'phase2c7b-problem',
        'phase2c7b-revision-v1',
        'phase2c7b-testdata-v1',
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
      ].join('\0'),
    ),
  };
}

async function assertTerminal(jobId) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const { body } = await request(`/v1/jobs/${jobId}`);
    if (
      [
        'COMPLETED_WITH_VERDICT',
        'CANCELLED',
        'INFRA_FAILED',
        'NO_VERDICT',
      ].includes(body.status)
    )
      return body;
    await wait(100);
  }
  throw new Error(`job did not reach a terminal state: ${jobId}`);
}

const health = await fetch(new URL('/health', baseUrl));
assert(health.ok, `health returned ${health.status}`);
const ready = await fetch(new URL('/ready', baseUrl));
assert(ready.ok, `ready returned ${ready.status}`);

const initial = await request('/v1/nodes');
const byId = new Map(initial.body.items.map((item) => [item.nodeId, item]));
for (const [id, incarnation] of [
  [nodeA, nodeAIncarnation],
  [nodeB, nodeBIncarnation],
]) {
  const item = byId.get(id);
  assert(item, `pre-started node ${id} is absent from the registry`);
  assert(
    item.incarnation === incarnation,
    `node ${id} incarnation does not match the externally started process`,
  );
  assert(
    ['ONLINE', 'BUSY'].includes(item.state),
    `node ${id} is not healthy/schedulable: ${item.state}`,
  );
}

await request(`/v1/nodes/${encodeURIComponent(nodeA)}/heartbeat`, {
  method: 'POST',
  node: true,
  body: JSON.stringify({
    incarnation: nodeAIncarnation,
    activeJobs: byId.get(nodeA).activeJobs,
  }),
});
await request(`/v1/nodes/${encodeURIComponent(nodeB)}/heartbeat`, {
  method: 'POST',
  node: true,
  body: JSON.stringify({
    incarnation: nodeBIncarnation,
    activeJobs: byId.get(nodeB).activeJobs,
  }),
});
const stale = await request(
  `/v1/nodes/${encodeURIComponent(nodeA)}/heartbeat`,
  {
    method: 'POST',
    node: true,
    expected: [409],
    body: JSON.stringify({
      incarnation: `stale-${randomUUID()}`,
      activeJobs: 0,
    }),
  },
);
assert(
  stale.body.code === 'STALE_NODE_INCARNATION',
  'stale heartbeat was not rejected by incarnation',
);

const evidence = {
  SERVICE_READY: 'PASS',
  TWO_PRESTARTED_NODES_VISIBLE: 'PASS',
  TWO_CURRENT_HEARTBEATS: 'PASS',
  STALE_HEARTBEAT_REJECTED: 'PASS',
  REAL_JOB: 'NOT_EXECUTED',
  NOTE: 'This harness starts no processes. Assignment routing, drain, timeout, re-registration, stale completion, and offline evidence require controlled external node lifecycle and must be recorded from their actual HTTP/runtime observations.',
};

if (runRealJob) {
  const label = `phase2c7b-ac-${randomUUID()}`;
  const testcaseSet = manifest(label);
  const sourceBytes =
    '#include <iostream>\nint main(){int x;std::cin>>x;std::cout<<x<<"\\n";}\n';
  const { body: accepted } = await request('/v1/jobs', {
    method: 'POST',
    expected: [200, 201],
    body: JSON.stringify({
      clientRequestId: `phase2c7b:${label}`,
      externalSubmissionId: `phase2c7b-external:${label}`,
      problemId: testcaseSet.problemId,
      problemRevisionId: testcaseSet.problemRevisionId,
      testdataVersionRef: testcaseSet.testdataVersionId,
      testcaseSet,
      languageId: 'cpp20',
      executionMode: 'REAL_SANDBOXED_EXECUTION',
      languageProfileId: 'cpp20-gcc-13-v1',
      sourceSnapshotRef: `phase2c7b:${label}`,
      sourceBytes,
      sourceSha256: hash(sourceBytes),
      controlledInputId: 'stdin-empty-v1',
      executionSetPolicy: 'RUN_ALL',
    }),
  });
  const terminal = await assertTerminal(accepted.judgeJobId);
  assert(
    terminal.status === 'COMPLETED_WITH_VERDICT' && terminal.verdict === 'AC',
    `real scheduler job did not complete AC: ${JSON.stringify(terminal)}`,
  );
  evidence.REAL_JOB = 'PASS';
}

console.log(JSON.stringify(evidence));
