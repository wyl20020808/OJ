import { createHash, randomUUID } from 'node:crypto';

const baseUrl =
  process.env.OJPLATFORM_PHASE2C3_SUPERVISOR_URL ?? 'http://127.0.0.1:19103';
const repeats = Number.parseInt(
  process.env.OJPLATFORM_PHASE2C3_REPEATS ?? '20',
  10,
);
const pairs = Number.parseInt(
  process.env.OJPLATFORM_PHASE2C3_PAIRS ?? '10',
  10,
);
const sha256 = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const inputHash = (value) => sha256(value);
const source = `#include <iostream>
#include <string>
int main(){std::string s;std::getline(std::cin,s);std::cout<<s<<"\\n";std::cerr<<"err-"<<s<<"\\n";}
`;
const floodSource = `#include <iostream>
int main(){for(int i=0;i<1000000;i++)std::cout<<'x';}
`;
const wallSource = 'int main(){for(;;){} return 0;}\n';
const nonzeroSource = 'int main(){return 7;}\n';
const signalSource = 'int main(){__builtin_trap();}\n';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function requestFor(sourceBytes, input, label) {
  const id = `tcx-${label}-${randomUUID()}`;
  return {
    protocol_version: '2C.3',
    execution_request_id: id,
    judge_job_id: `job-${id}`,
    submission_id: `submission-${id}`,
    attempt: 1,
    correlation_id: `qualification-${id}`,
    problem_id: 'phase2c3-problem',
    problem_revision_id: 'phase2c3-revision-v1',
    testdata_version_ref: 'phase2c3-testdata-v1',
    testcase_id: label,
    testcase_input: Buffer.from(input, 'utf8').toString('base64'),
    testcase_input_sha256: inputHash(input),
    execution_profile_id: 'cpp20-gcc-13-v1',
    language_profile_id: 'cpp20-gcc-13-v1',
    source_snapshot_ref: `submission:${id}`,
    source_bytes: sourceBytes,
    source_sha256: sha256(sourceBytes),
    deadline_at: new Date(Date.now() + 120_000).toISOString(),
    cancellation_generation: 0,
  };
}

async function run(input) {
  const started = await call('/v1/executions/start', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (![200, 202].includes(started.status))
    throw new Error(
      `start ${input.execution_request_id}: ${started.status} ${JSON.stringify(started.body)} request=${JSON.stringify(input)}`,
    );
  for (;;) {
    const status = await call(
      `/v1/executions/status?execution_request_id=${encodeURIComponent(input.execution_request_id)}`,
    );
    if (status.status !== 200)
      throw new Error(`status ${input.execution_request_id}: ${status.status}`);
    if (status.body?.status !== 'ACTIVE') return status.body;
    await delay(50);
  }
}

function assertRecord(result, input) {
  if (
    result.testcase_id !== input.testcase_id ||
    result.testcase_input_sha256 !== input.testcase_input_sha256 ||
    result.execution_profile_id !== input.execution_profile_id
  )
    throw new Error('testcase identity mismatch');
  const record = result.single_testcase_record;
  if (
    !record ||
    record.record_version !== '2C.3' ||
    record.identity.testcase_id !== input.testcase_id ||
    record.identity.input_sha256 !== input.testcase_input_sha256 ||
    record.identity.execution_profile_id !== input.execution_profile_id ||
    !/^[a-f0-9]{64}$/.test(record.digest)
  )
    throw new Error(
      `immutable record missing or malformed: ${JSON.stringify(result)}`,
    );
  if (
    record.stdin.byte_count !==
      Buffer.from(input.testcase_input, 'base64').length ||
    record.stdin.sha256 !== input.testcase_input_sha256
  )
    throw new Error('stdin metadata mismatch');
  if (
    !result.runtime ||
    result.runtime.stdout_sha256 !== input.testcase_input_sha256
  )
    throw new Error('exact stdin/stdout evidence missing');
  const stdoutBytes = Buffer.from(result.runtime.stdout ?? '', 'utf8');
  const stderrBytes = Buffer.from(result.runtime.stderr ?? '', 'utf8');
  if (
    result.runtime.stdout_bytes !== stdoutBytes.length ||
    result.runtime.stdout_sha256 !== sha256(result.runtime.stdout ?? '') ||
    result.runtime.stderr_bytes !== stderrBytes.length ||
    result.runtime.stderr_sha256 !== sha256(result.runtime.stderr ?? '') ||
    result.runtime.stdout_bytes > 64 * 1024 ||
    result.runtime.stderr_bytes > 64 * 1024
  )
    throw new Error('output byte/hash metadata mismatch');
  if (
    result.runtime.stdout.includes('AC') ||
    result.runtime.stdout.includes('WA')
  )
    throw new Error('verdict text leaked');
}

const results = [];
for (let i = 0; i < repeats; i += 1) {
  const input = requestFor(source, 'repeat\n', 'repeat-1');
  const result = await run(input);
  assertRecord(result, input);
  results.push(result);
}
if (
  new Set(results.map((value) => value.runtime.stdout_sha256)).size !== 1 ||
  new Set(results.map((value) => value.artifact.sha256)).size !== 1
)
  throw new Error('repeatability identity changed');

const pairInputs = Array.from({ length: pairs * 2 }, (_, index) =>
  requestFor(source, index % 2 === 0 ? '111\n' : '222\n', `pair-${index}`),
);
const pairResults = await Promise.all(pairInputs.map(run));
pairResults.forEach((result, index) => {
  assertRecord(result, pairInputs[index]);
  const expected = Buffer.from(
    pairInputs[index].testcase_input,
    'base64',
  ).toString('utf8');
  if (result.runtime.stdout !== expected)
    throw new Error('cross-testcase stdin isolation failure');
});

const wrongHash = requestFor(source, 'wrong\n', 'wrong-hash');
wrongHash.testcase_input_sha256 = inputHash('different\n');
const rejected = await call('/v1/executions/start', {
  method: 'POST',
  body: JSON.stringify(wrongHash),
});
if (rejected.status !== 400)
  throw new Error(`wrong input hash was accepted: ${rejected.status}`);

const wall = await run(requestFor(wallSource, '', 'wall-limit'));
if (
  wall.pipeline_outcome !== 'PIPELINE_LIMIT_HIT' ||
  wall.runtime?.raw_facts?.wall_limit_reached !== true ||
  wall.runtime?.raw_facts?.cancelled === true
)
  throw new Error('wall limit fact mismatch');
const flood = await run(requestFor(floodSource, '', 'output-flood'));
if (
  flood.pipeline_outcome !== 'PIPELINE_LIMIT_HIT' ||
  flood.runtime?.raw_facts?.stdout_truncated !== true ||
  flood.runtime?.stdout_truncated !== true ||
  flood.runtime?.stdout_bytes !== 64 * 1024 ||
  flood.runtime?.stdout_sha256 !== sha256(flood.runtime.stdout)
)
  throw new Error('stdout truncation fact mismatch');
const nonzero = await run(requestFor(nonzeroSource, '', 'nonzero'));
if (
  nonzero.runtime?.raw_facts?.exit_code !== 7 ||
  nonzero.runtime?.raw_facts?.process_exited !== true
)
  throw new Error('nonzero exit fact mismatch');
const signal = await run(requestFor(signalSource, '', 'signal'));
if (
  signal.runtime?.raw_facts?.termination_signal &&
  signal.runtime.termination_signal !==
    signal.runtime.raw_facts.termination_signal
)
  throw new Error('signal fact was not normalized consistently');
if (
  signal.runtime?.raw_facts?.termination_signal === 'SIGKILL' &&
  signal.runtime.raw_facts.exit_code === 137
)
  throw new Error('signal was guessed from exit status');

const cancelInput = requestFor(wallSource, '', 'cancel');
const cancelStart = await call('/v1/executions/start', {
  method: 'POST',
  body: JSON.stringify(cancelInput),
});
if (![200, 202].includes(cancelStart.status))
  throw new Error('cancel start failed');
await delay(100);
const cancel = await call('/v1/executions/cancel', {
  method: 'POST',
  body: JSON.stringify({
    execution_request_id: cancelInput.execution_request_id,
  }),
});
if (cancel.status !== 200) throw new Error('cancel request failed');
const cancelled = await run(cancelInput);
const cancelFacts =
  cancelled.runtime?.raw_facts ?? cancelled.compile?.raw_facts;
if (
  cancelled.pipeline_outcome !== 'PIPELINE_CANCELLED' ||
  cancelFacts?.cancelled !== true
)
  throw new Error(`cancel fact mismatch: ${JSON.stringify(cancelled)}`);

console.log(
  JSON.stringify({
    repeats,
    pairs,
    repeatability: 'PASS',
    concurrentIsolation: 'PASS',
    wrongHash: 'PASS',
    wall: 'PASS',
    output: 'PASS',
    nonzero: 'PASS',
    signal: 'PASS',
    cancellation: 'PASS',
    records: 'PASS',
  }),
);
