import { createHash, randomUUID } from 'node:crypto';

const baseUrl =
  process.env.OJPLATFORM_PHASE2C2_SUPERVISOR_URL ?? 'http://127.0.0.1:19102';
const sequentialTotal = Number.parseInt(
  process.env.OJPLATFORM_PHASE2C2_SEQUENTIAL ?? '50',
  10,
);
const concurrentPairs = Number.parseInt(
  process.env.OJPLATFORM_PHASE2C2_CONCURRENT_PAIRS ?? '20',
  10,
);
const repeatedLimits = Number.parseInt(
  process.env.OJPLATFORM_PHASE2C2_LIMIT_REPEATS ?? '3',
  10,
);

const sources = {
  normal: (marker) =>
    `#include <iostream>\nint main(){std::cout << "${marker}\\n"; std::cerr << "err-${marker}\\n";}\n`,
  nonzero: () => 'int main(){return 7;}\n',
  signal: () => 'int main(){__builtin_trap();}\n',
  syntax: () => 'int main( { return 0; }\n',
  wall: () => 'int main(){for(;;){} return 0;}\n',
  memory: () =>
    '#include <cstdlib>\n#include <cstring>\n#include <vector>\nint main(){std::vector<void*> p; for(;;){void* q=std::malloc(1024*1024); if(!q)return 9; std::memset(q,1,1024*1024); p.push_back(q);}}\n',
  pids: () =>
    '#include <unistd.h>\n#include <sys/wait.h>\nint main(){for(int i=0;i<128;i++){if(fork()==0){for(;;)pause();}} for(;;)pause();}\n',
  stdout: () =>
    "#include <iostream>\nint main(){for(int i=0;i<100000;i++)std::cout.put('x');}\n",
  stderr: () =>
    "#include <iostream>\nint main(){for(int i=0;i<100000;i++)std::cerr.put('e');}\n",
};

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
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

function executionRequest(kind, marker, attempt = 1) {
  const id = randomUUID();
  const source = sources[kind](marker);
  return {
    protocol_version: '2C.1',
    execution_request_id: `phase2c2-${id}`,
    judge_job_id: `job-${id}`,
    submission_id: `submission-${id}`,
    attempt,
    correlation_id: `qualification-${id}`,
    problem_revision_id: 'phase2c2-problem-revision-v1',
    testdata_version_ref: 'phase2c2-testdata-v1',
    language_profile_id: 'cpp20-gcc-13-v1',
    source_snapshot_ref: `submission:${id}:snapshot`,
    source_bytes: source,
    source_sha256: sha256(source),
    controlled_input_id: 'stdin-empty-v1',
    deadline_at: new Date(Date.now() + 30_000).toISOString(),
    cancellation_generation: 0,
  };
}

async function start(input) {
  const response = await request('/v1/executions/start', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (![200, 202].includes(response.status)) {
    throw new Error(
      `start ${input.execution_request_id}: HTTP ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
  return response;
}

async function result(input, timeoutMilliseconds = 40_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const response = await request(
      `/v1/executions/status?execution_request_id=${encodeURIComponent(input.execution_request_id)}`,
    );
    if (response.status !== 200) {
      throw new Error(
        `status ${input.execution_request_id}: HTTP ${response.status}`,
      );
    }
    if (response.body.status !== 'ACTIVE') return response.body;
    await delay(100);
  }
  throw new Error(
    `execution ${input.execution_request_id} exceeded qualification timeout`,
  );
}

async function execute(kind, marker) {
  const input = executionRequest(kind, marker);
  await start(input);
  return { input, result: await result(input) };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertBound(resultValue, input) {
  assert(
    resultValue.execution_request_id === input.execution_request_id,
    'execution identity crossed',
  );
  assert(
    resultValue.judge_job_id === input.judge_job_id,
    'job identity crossed',
  );
  assert(
    resultValue.submission_id === input.submission_id,
    'submission identity crossed',
  );
  assert(
    resultValue.source_sha256 === input.source_sha256,
    'source identity crossed',
  );
  assert(
    resultValue.execution_attempt_id ===
      `${input.execution_request_id}:attempt`,
    'attempt identity crossed',
  );
  assert(
    resultValue.compile_attempt_id === `${input.execution_request_id}:compile`,
    'compile identity crossed',
  );
  assert(
    resultValue.runtime_attempt_id === `${input.execution_request_id}:runtime`,
    'runtime identity crossed',
  );
  assert(
    resultValue.result_generation === input.attempt,
    'result generation crossed',
  );
  assert(resultValue.clean === true, 'execution cleanup was not verified');
}

function assertFixture(kind, item, marker) {
  const value = item.result;
  assertBound(value, item.input);
  if (kind === 'syntax') {
    assert(
      value.pipeline_outcome === 'PIPELINE_COMPILE_FAILED',
      'source failure was not distinguished',
    );
    assert(
      value.compile.outcome === 'COMPILE_FAILED',
      'compile source failure was not normalized',
    );
    return;
  }
  assert(value.runtime, `${kind} did not reach runtime`);
  const facts = value.runtime.raw_facts;
  if (kind === 'normal') {
    assert(
      value.pipeline_outcome === 'PIPELINE_COMPLETED',
      'normal execution did not complete',
    );
    assert(
      value.runtime.outcome === 'EXECUTION_COMPLETED' && facts.exit_code === 0,
      'exit zero facts invalid',
    );
    assert(value.runtime.stdout === `${marker}\n`, 'stdout isolation failed');
    assert(
      value.runtime.stderr === `err-${marker}\n`,
      'stderr isolation failed',
    );
  } else if (kind === 'nonzero') {
    assert(
      value.pipeline_outcome === 'PIPELINE_COMPLETED' && facts.exit_code === 7,
      'nonzero exit was not retained as raw completion',
    );
  } else if (kind === 'signal') {
    assert(
      facts.termination_signal || facts.exit_code !== 0,
      'signal termination was not represented',
    );
  } else if (kind === 'wall') {
    assert(facts.wall_limit_reached === true, 'wall limit fact missing');
  } else if (kind === 'memory') {
    assert(facts.memory_limit_event === true, 'memory limit fact missing');
  } else if (kind === 'pids') {
    assert(facts.pids_limit_event === true, 'pids limit fact missing');
  } else if (kind === 'stdout') {
    assert(
      facts.stdout_truncated === true &&
        Buffer.byteLength(value.runtime.stdout) <= 65_536,
      'stdout cap fact invalid',
    );
  } else if (kind === 'stderr') {
    assert(
      facts.stderr_truncated === true &&
        Buffer.byteLength(value.runtime.stderr) <= 65_536,
      'stderr cap fact invalid',
    );
  }
  assert(
    facts.runtime_infra_failed !== true,
    `${kind} controlled outcome was misclassified as infrastructure failure`,
  );
}

async function duplicateDelivery() {
  const input = executionRequest('normal', 'duplicate-delivery');
  const [a, b] = await Promise.all([start(input), start(input)]);
  assert(
    [a.status, b.status].every((status) => [200, 202].includes(status)),
    'equivalent duplicate was not idempotent',
  );
  const completed = await result(input);
  assertFixture('normal', { input, result: completed }, 'duplicate-delivery');
  const terminalDuplicate = await start(input);
  assert(
    terminalDuplicate.status === 200 &&
      terminalDuplicate.body.status === 'COMPLETED',
    'terminal duplicate was not idempotent',
  );

  const conflicting = {
    ...input,
    source_snapshot_ref: `${input.source_snapshot_ref}:conflict`,
  };
  const conflict = await request('/v1/executions/start', {
    method: 'POST',
    body: JSON.stringify(conflicting),
  });
  assert(
    conflict.status === 409,
    'conflicting duplicate identity was accepted',
  );
  return {
    equivalent_start_statuses: [a.status, b.status, terminalDuplicate.status],
    conflict_status: conflict.status,
  };
}

async function cancelExecution(index, delayMilliseconds) {
  const input = executionRequest('wall', `cancel-${index}`);
  await start(input);
  if (delayMilliseconds > 0) await delay(delayMilliseconds);
  let cancellation;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    cancellation = await request('/v1/executions/cancel', {
      method: 'POST',
      body: JSON.stringify({
        execution_request_id: input.execution_request_id,
      }),
    });
    if (cancellation.status === 200) break;
    if (cancellation.status !== 409)
      throw new Error(`cancel HTTP ${cancellation.status}`);
    await delay(50);
  }
  assert(cancellation?.status === 200, 'active cancellation was not accepted');
  const completed = await result(input);
  assertBound(completed, input);
  assert(
    completed.pipeline_outcome === 'PIPELINE_CANCELLED',
    'cancellation produced false completion',
  );
  const cancellationFacts =
    completed.runtime?.raw_facts ?? completed.compile?.raw_facts;
  assert(
    cancellationFacts?.cancelled === true,
    'raw cancellation fact missing',
  );
  assert(
    cancellationFacts?.runtime_infra_failed !== true,
    'cancellation was misclassified as infrastructure failure',
  );
  const duplicate = await request('/v1/executions/cancel', {
    method: 'POST',
    body: JSON.stringify({ execution_request_id: input.execution_request_id }),
  });
  assert(
    duplicate.status === 409,
    'terminal cancellation changed authoritative state',
  );
  return completed;
}

async function main() {
  const health = await request('/v1/health');
  const capabilities = await request('/v1/executions/capabilities');
  assert(
    health.status === 200 &&
      health.body.supervisor_uid === 1000 &&
      health.body.real_submission_execution === true,
    'real Supervisor identity/gate invalid',
  );
  assert(
    capabilities.status === 200 &&
      capabilities.body.compiler_rootfs_identity ===
        'cfb8d628eb7ef2ceb0257e27a1f82f2deb4eb312cfd3ca2498b302564a5a7e14',
    'compiler rootfs identity invalid',
  );

  const duplicate = await duplicateDelivery();
  const sequentialKinds = ['normal', 'nonzero', 'signal', 'syntax'];
  const sequential = { total: sequentialTotal, pass: 0, failures: [] };
  for (let index = 0; index < sequentialTotal; index += 1) {
    const kind = sequentialKinds[index % sequentialKinds.length];
    const marker = `sequential-${index}`;
    try {
      const item = await execute(kind, marker);
      assertFixture(kind, item, marker);
      sequential.pass += 1;
    } catch (error) {
      sequential.failures.push({ index, kind, error: String(error) });
    }
    if ((index + 1) % 10 === 0)
      process.stderr.write(`SEQUENTIAL ${index + 1}/${sequentialTotal}\n`);
  }
  assert(
    sequential.pass === sequential.total,
    `sequential soak failures: ${JSON.stringify(sequential.failures)}`,
  );

  const pairKinds = [
    ['normal', 'normal'],
    ['syntax', 'normal'],
    ['nonzero', 'signal'],
    ['memory', 'pids'],
    ['stdout', 'stderr'],
  ];
  const concurrent = {
    pairs: concurrentPairs,
    attempts: concurrentPairs * 2,
    pass: 0,
    failures: [],
  };
  for (let index = 0; index < concurrentPairs; index += 1) {
    const [kindA, kindB] = pairKinds[index % pairKinds.length];
    const markerA = `pair-${index}-A`;
    const markerB = `pair-${index}-B`;
    try {
      const [a, b] = await Promise.all([
        execute(kindA, markerA),
        execute(kindB, markerB),
      ]);
      assertFixture(kindA, a, markerA);
      assertFixture(kindB, b, markerB);
      assert(
        a.result.compile_sandbox_id !== b.result.compile_sandbox_id,
        'compile sandbox identity crossed',
      );
      assert(
        a.result.runtime_sandbox_id !== b.result.runtime_sandbox_id,
        'runtime sandbox identity crossed',
      );
      const aCgroup = a.result.runtime?.resource_evidence?.control_group;
      const bCgroup = b.result.runtime?.resource_evidence?.control_group;
      if (aCgroup && bCgroup)
        assert(aCgroup !== bCgroup, 'concurrent cgroup identity crossed');
      concurrent.pass += 1;
    } catch (error) {
      concurrent.failures.push({
        index,
        kinds: [kindA, kindB],
        error: String(error),
      });
    }
    if ((index + 1) % 5 === 0)
      process.stderr.write(`CONCURRENT ${index + 1}/${concurrentPairs}\n`);
  }
  assert(
    concurrent.pass === concurrent.pairs,
    `concurrent soak failures: ${JSON.stringify(concurrent.failures)}`,
  );

  const limits = {};
  for (const kind of ['memory', 'pids', 'stdout', 'stderr', 'wall']) {
    limits[kind] = [];
    for (let index = 0; index < repeatedLimits; index += 1) {
      const item = await execute(kind, `limit-${kind}-${index}`);
      assertFixture(kind, item, `limit-${kind}-${index}`);
      limits[kind].push({
        outcome: item.result.runtime?.outcome,
        facts: item.result.runtime?.raw_facts,
        clean: item.result.clean,
      });
    }
  }

  const cancellations = [];
  for (let index = 0; index < repeatedLimits; index += 1) {
    const delayMilliseconds = index % 2 === 0 ? 0 : 750;
    const completed = await cancelExecution(index, delayMilliseconds);
    cancellations.push({
      timing: delayMilliseconds === 0 ? 'compile-preparing' : 'runtime',
      outcome: completed.pipeline_outcome,
      facts: completed.runtime?.raw_facts ?? completed.compile?.raw_facts,
      clean: completed.clean,
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        health: health.body,
        capabilities: capabilities.body,
        duplicate_delivery: duplicate,
        sequential,
        concurrent,
        repeated_limits: limits,
        cancellations,
        verdict_mapping: 'NONE',
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
