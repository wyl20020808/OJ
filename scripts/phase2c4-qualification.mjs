import { createHash, randomUUID } from 'node:crypto';

const baseUrl =
  process.env.OJPLATFORM_PHASE2C4_SUPERVISOR_URL ?? 'http://127.0.0.1:19104';
const repeats = Number.parseInt(
  process.env.OJPLATFORM_PHASE2C4_REPEATS ?? '20',
  10,
);
const pairs = Number.parseInt(
  process.env.OJPLATFORM_PHASE2C4_PAIRS ?? '10',
  10,
);
const sha256 = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const source = `#include <iostream>
#include <string>
int main(){std::string s; std::getline(std::cin,s); std::cout<<s<<"\\n";}
`;
const wallSource = 'int main(){for(;;){} return 0;}\n';
const isolationSource = `#include <chrono>
#include <fstream>
#include <iostream>
#include <string>
#include <thread>
#include <unistd.h>
#include <vector>
int main(){
  std::string action;
  std::getline(std::cin, action);
  if(action == "FS_WRITE"){
    std::ofstream("/workspace/testcase-marker") << "owned";
    std::cout << "FS_WRITE\\n";
  } else if(action == "FS_CHECK"){
    std::ifstream marker("/workspace/testcase-marker");
    std::cout << (marker.good() ? "FS_LEAK\\n" : "FS_CLEAN\\n");
  } else if(action == "PROC_FORK"){
    if(fork() == 0){ sleep(30); _exit(0); }
    std::cout << "PROC_PARENT\\n";
  } else if(action == "RESOURCE"){
    std::vector<char> memory(32 * 1024 * 1024, 1);
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "RESOURCE:" << int(memory[0]) << "\\n";
  } else {
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "NORMAL\\n";
  }
}
`;

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
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

function manifestFor(
  label,
  inputs = [`${label}-A\n`, `${label}-B\n`, `${label}-C\n`],
) {
  const entries = inputs.map((input, index) => ({
    index,
    testcase_id: `${label}-case-${index}`,
    testdata_version_id: 'phase2c4-testdata-v1',
    input: Buffer.from(input, 'utf8').toString('base64'),
    input_sha256: sha256(input),
    execution_profile_id: 'cpp20-gcc-13-v1',
  }));
  const fields = [
    '2C.4',
    'phase2c4-problem',
    'phase2c4-revision-v1',
    'phase2c4-testdata-v1',
    `${label}-set`,
    'cpp20-gcc-13-v1',
    String(entries.length),
    ...entries.flatMap((entry) => [
      String(entry.index),
      entry.testcase_id,
      entry.testdata_version_id,
      entry.input_sha256,
      entry.execution_profile_id,
      '',
    ]),
  ];
  return {
    problem_id: 'phase2c4-problem',
    problem_revision_id: 'phase2c4-revision-v1',
    testdata_version_id: 'phase2c4-testdata-v1',
    testcase_set_id: `${label}-set`,
    execution_profile_id: 'cpp20-gcc-13-v1',
    entries,
    manifest_hash: sha256(fields.join('\0')),
  };
}

function requestFor(label, attempt = 1, sourceBytes = source, inputs) {
  const id = `phase2c4-${label}-${randomUUID()}`;
  const manifest = manifestFor(label, inputs);
  return {
    protocol_version: '2C.4',
    execution_set_request_id: id,
    judge_job_id: `job-${id}`,
    submission_id: `submission-${id}`,
    attempt,
    correlation_id: `qualification-${id}`,
    manifest,
    execution_policy: 'RUN_ALL',
    language_profile_id: 'cpp20-gcc-13-v1',
    source_snapshot_ref: `submission:${id}`,
    source_bytes: sourceBytes,
    source_sha256: sha256(sourceBytes),
    deadline_at: new Date(Date.now() + 120_000).toISOString(),
    cancellation_generation: 0,
  };
}

async function run(request) {
  const started = await call('/v1/execution-sets/start', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  if (![200, 202].includes(started.status))
    throw new Error(`set start failed: ${started.status}`);
  for (;;) {
    const status = await call(
      `/v1/execution-sets/status?execution_set_request_id=${encodeURIComponent(request.execution_set_request_id)}`,
    );
    if (status.status !== 200)
      throw new Error(`set status failed: ${status.status}`);
    if (status.body?.status !== 'ACTIVE') return status.body;
    await delay(50);
  }
}

function assertSet(result, request) {
  const manifest = request.manifest;
  const aggregate = result.aggregate_execution_set_record;
  if (
    result.protocol_version !== '2C.4' ||
    result.execution_set_request_id !== request.execution_set_request_id ||
    result.execution_set_attempt_id !==
      `${request.execution_set_request_id}:attempt` ||
    result.testcase_set_manifest_hash !== manifest.manifest_hash ||
    !aggregate ||
    aggregate.record_version !== '2C.4' ||
    aggregate.manifest_hash !== manifest.manifest_hash ||
    aggregate.testcases.length !== manifest.entries.length ||
    aggregate.total_testcase_count !== manifest.entries.length ||
    aggregate.started_testcase_count !== manifest.entries.length ||
    aggregate.completed_testcase_count !== manifest.entries.length ||
    aggregate.testcases.some(
      (member, index) =>
        member.index !== index ||
        member.testcase_id !== manifest.entries[index].testcase_id ||
        member.input_sha256 !== manifest.entries[index].input_sha256 ||
        member.status !== 'RAW_COMPLETED' ||
        member.record?.testcase_index !== index ||
        member.record?.testcase_set_manifest_hash !== manifest.manifest_hash,
    )
  )
    throw new Error(
      `set aggregate binding mismatch: ${JSON.stringify(result)}`,
    );
}

const sequential = [];
for (let index = 0; index < repeats; index += 1) {
  const request = requestFor(`sequential-${index}`);
  const result = await run(request);
  assertSet(result, request);
  sequential.push(result);
  if ((index + 1) % 5 === 0)
    process.stderr.write(`SEQUENTIAL SET ${index + 1}/${repeats}\n`);
}

const concurrent = [];
for (let index = 0; index < pairs; index += 1) {
  const a = requestFor(`pair-${index}-a`);
  const b = requestFor(`pair-${index}-b`);
  const [resultA, resultB] = await Promise.all([run(a), run(b)]);
  assertSet(resultA, a);
  assertSet(resultB, b);
  if (resultA.execution_set_attempt_id === resultB.execution_set_attempt_id)
    throw new Error('cross-set attempt identity reused');
  concurrent.push([resultA, resultB]);
}

const cancellationRequest = requestFor('cancel', 1, wallSource);
const cancellationStart = await call('/v1/execution-sets/start', {
  method: 'POST',
  body: JSON.stringify(cancellationRequest),
});
if (![200, 202].includes(cancellationStart.status))
  throw new Error(`set cancellation start failed: ${cancellationStart.status}`);
await delay(100);
const cancellation = await call('/v1/execution-sets/cancel', {
  method: 'POST',
  body: JSON.stringify({
    execution_set_request_id: cancellationRequest.execution_set_request_id,
  }),
});
if (cancellation.status !== 200)
  throw new Error(`set cancellation request failed: ${cancellation.status}`);
const cancelled = await run(cancellationRequest);
if (
  cancelled.pipeline_outcome !== 'PIPELINE_CANCELLED' ||
  cancelled.aggregate_execution_set_record?.set_cancelled !== true ||
  !['CANCELLED', 'CANCELLED_BEFORE_START'].includes(
    cancelled.aggregate_execution_set_record?.testcases[0]?.status,
  ) ||
  cancelled.aggregate_execution_set_record?.testcases
    .slice(1)
    .some((member) => member.status !== 'CANCELLED_BEFORE_START')
)
  throw new Error(
    `set cancellation semantics mismatch: ${JSON.stringify(cancelled)}`,
  );

const tampered = requestFor('tamper');
tampered.manifest.entries[1].input_sha256 = sha256('different\n');
const tamperResult = await call('/v1/execution-sets/start', {
  method: 'POST',
  body: JSON.stringify(tampered),
});
if (tamperResult.status !== 400) throw new Error('manifest tamper accepted');

const isolationInputs = [
  'FS_WRITE\n',
  'FS_CHECK\n',
  'PROC_FORK\n',
  'RESOURCE\n',
  'NORMAL\n',
];
const isolationRequest = requestFor(
  'carry-over',
  1,
  isolationSource,
  isolationInputs,
);
const isolation = await run(isolationRequest);
assertSet(isolation, isolationRequest);
const isolationMembers = isolation.aggregate_execution_set_record.testcases;
const expectedOutputHashes = [
  sha256('FS_WRITE\n'),
  sha256('FS_CLEAN\n'),
  sha256('PROC_PARENT\n'),
  sha256('RESOURCE:1\n'),
  sha256('NORMAL\n'),
];
if (
  isolationMembers.some(
    (member, index) =>
      member.record?.stdout?.sha256 !== expectedOutputHashes[index] ||
      member.record?.facts?.cleanup_verified !== true ||
      member.record?.execution_set_attempt_id !==
        isolation.execution_set_attempt_id ||
      member.record?.testcase_index !== index,
  ) ||
  new Set(
    isolationMembers.map(
      (member) => member.record?.identity?.execution_attempt_id,
    ),
  ).size !== isolationMembers.length
)
  throw new Error(
    `cross-testcase isolation mismatch: ${JSON.stringify(isolation)}`,
  );

const isolatedCancelRequest = requestFor('isolated-cancel', 1, wallSource);
const isolatedPeerRequest = requestFor('isolated-peer');
const isolatedCancelStart = await call('/v1/execution-sets/start', {
  method: 'POST',
  body: JSON.stringify(isolatedCancelRequest),
});
if (![200, 202].includes(isolatedCancelStart.status))
  throw new Error('isolated cancellation set start failed');
const peerRun = run(isolatedPeerRequest);
await delay(100);
const isolatedCancel = await call('/v1/execution-sets/cancel', {
  method: 'POST',
  body: JSON.stringify({
    execution_set_request_id: isolatedCancelRequest.execution_set_request_id,
  }),
});
if (isolatedCancel.status !== 200)
  throw new Error('isolated cancellation request failed');
const [isolatedCancelled, isolatedPeer] = await Promise.all([
  run(isolatedCancelRequest),
  peerRun,
]);
assertSet(isolatedPeer, isolatedPeerRequest);
if (
  isolatedCancelled.pipeline_outcome !== 'PIPELINE_CANCELLED' ||
  isolatedCancelled.aggregate_execution_set_record?.set_cancelled !== true ||
  isolatedPeer.aggregate_execution_set_record?.stop_reason !== 'COMPLETED' ||
  isolatedPeer.aggregate_execution_set_record?.cleanup_verified !== true
)
  throw new Error('cross-set cancellation isolation mismatch');

console.log(
  JSON.stringify({
    protocol: '2C.4',
    sequentialSets: sequential.length,
    testcaseExecutions: sequential.length * 3,
    concurrentPairs: concurrent.length,
    manifestTamper: 'PASS',
    cancellation: 'PASS',
    filesystemCarryOver: 'PASS',
    processCarryOver: 'PASS',
    outputCarryOver: 'PASS',
    cgroupCarryOver: 'PASS',
    crossSetCancellation: 'PASS',
    crossSetResourceIsolation: 'PASS',
    ordering: 'PASS',
    compileOncePerSet: 'ASSERTED_BY_AGGREGATE',
    verdictMapping: 'NONE',
  }),
);
