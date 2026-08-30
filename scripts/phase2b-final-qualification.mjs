const apiBase =
  process.env.OJPLATFORM_PHASE2B_API_URL ?? 'http://127.0.0.1:3010';
const supervisorBase =
  process.env.OJPLATFORM_PHASE2B_SUPERVISOR_URL ?? 'http://127.0.0.1:19091';
const username = process.env.OJPLATFORM_PHASE2B_OPERATOR ?? 'phase2b-operator';
const password =
  process.env.OJPLATFORM_PHASE2B_OPERATOR_PASSWORD ?? 'Phase2BOperatorPass123!';

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonRequest(base, path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = { text: await response.text() };
  }
  return { status: response.status, body };
}

const registration = await jsonRequest(apiBase, '/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    username,
    email: `${username}@example.test`,
    displayName: 'Phase 2B Operator',
    password,
  }),
});
assert(
  registration.status === 201 || registration.status === 409,
  `operator registration failed: ${registration.status}`,
);
const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identity: username, password }),
});
assert(
  loginResponse.status === 200,
  `operator login failed: ${loginResponse.status}`,
);
const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
assert(cookie, 'operator login returned no session cookie');

const api = (path, init = {}) =>
  jsonRequest(apiBase, path, {
    ...init,
    headers: { cookie, ...init.headers },
  });

async function runProbe(probeId, { cancel = false } = {}) {
  const start = await api(`/api/operations/sandbox/probes/${probeId}`, {
    method: 'POST',
    body: '{}',
  });
  assert(start.status === 202, `${probeId} start failed: ${start.status}`);
  if (cancel) {
    await wait(300);
    const cancellation = await api(
      `/api/operations/sandbox/probes/${probeId}/cancel`,
      { method: 'POST', body: '{}' },
    );
    assert(
      cancellation.status === 200,
      `${probeId} cancellation failed: ${cancellation.status}`,
    );
  }
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const raw = await jsonRequest(
      supervisorBase,
      `/v1/probes/status?probe_id=${encodeURIComponent(probeId)}`,
    );
    if (
      raw.status === 200 &&
      raw.body.outcome &&
      raw.body.outcome !== 'SANDBOX_PROBE_RUNNING'
    ) {
      const projected = await api(
        `/api/operations/sandbox/probes/${encodeURIComponent(probeId)}`,
      );
      assert(projected.status === 200, `${probeId} status projection failed`);
      return { raw: raw.body, projected: projected.body };
    }
    await api(`/api/operations/sandbox/probes/${encodeURIComponent(probeId)}`);
    await wait(100);
  }
  throw new Error(`${probeId} exceeded the bounded 30s qualification timeout`);
}

function eventValue(events, name) {
  const line = String(events ?? '')
    .split('\n')
    .find((item) => item.startsWith(`${name} `));
  return line ? Number(line.split(/\s+/)[1]) : 0;
}

function validateNormal(result) {
  assert(
    result.qualification_pass === true,
    'full isolation probe did not pass',
  );
  assert(
    result.qualifies_sandbox === true,
    'full isolation probe did not qualify Sandbox',
  );
  assert(result.clean === true, 'full isolation probe was not clean');
  const payload = JSON.parse(result.stdout);
  const checks = payload.checks;
  for (const name of [
    '/workspace/marker',
    'network/bind',
    'syscall/mount-denied',
    'syscall/unshare-denied',
    'syscall/ptrace-denied',
    'syscall/ptrace-attach-denied',
    'process/unrelated-signal-denied',
  ])
    assert(
      checks[name] === true,
      `required positive isolation check failed: ${name}`,
    );
  for (const name of [
    '/etc/hostname',
    '/host',
    '/mnt/c',
    '/mnt/d',
    '/workspace/../etc/passwd',
    '/workspace/../project',
    '/workspace/../other-job',
    '/workspace/.git',
    '/var/run/docker.sock',
    '/run/secrets',
    '/home',
    '/root',
    '/dev/kmsg',
    '/workspace/symlink-escape',
    '/mnt/d/outside-write',
    'network/127.0.0.1:5432',
    'network/127.0.0.1:6379',
    'network/127.0.0.1:9000',
    'network/127.0.0.1:8080',
    'network/203.0.113.1:443',
    'network/169.254.169.254:80',
    'network/172.31.255.254:80',
    'network/dns',
    'env/DATABASE_URL',
    'env/POSTGRES_PASSWORD',
    'env/REDIS_URL',
    'env/REDIS_PASSWORD',
    'env/SESSION_SECRET',
    'env/AWS_SECRET_ACCESS_KEY',
    'env/MINIO_ROOT_PASSWORD',
  ])
    assert(
      checks[name] === false,
      `forbidden isolation check was visible: ${name}`,
    );
  assert(
    payload.pid === 1 && payload.pid_is_init === true,
    'PID namespace init evidence failed',
  );
  assert(
    payload.visible_pids === 1,
    `unexpected visible PID count: ${payload.visible_pids}`,
  );
  assert(
    payload.uid === 0 && payload.gid === 0,
    'guest namespace identity changed',
  );
  assert(
    payload.cap_eff === '0000000000000000',
    'effective capabilities are not empty',
  );
  assert(payload.no_new_privileges === '1', 'NoNewPrivileges is not active');
  assert(payload.seccomp_mode === 2, 'seccomp mode is not filter mode');
  assert(
    payload.default_route === false,
    'guest unexpectedly has a default route',
  );
  return payload;
}

const evidence = {};
evidence.full = await runProbe('SANDBOX_PROBE_QUALIFICATION');
evidence.full.payload = validateNormal(evidence.full.raw);

for (const probeId of [
  'SANDBOX_PROBE_CPU_LIMIT',
  'SANDBOX_PROBE_MEMORY_LIMIT',
  'SANDBOX_PROBE_PIDS_LIMIT',
  'SANDBOX_PROBE_OUTPUT_LIMIT',
  'SANDBOX_PROBE_WORKSPACE_LIMIT',
  'SANDBOX_PROBE_WALL_TIMEOUT',
  'SANDBOX_PROBE_ABNORMAL_EXIT',
  'SANDBOX_PROBE_CONCURRENT_RESOURCES',
]) {
  const result = await runProbe(probeId);
  assert(
    result.raw.qualification_pass === true,
    `${probeId} expected behavior did not pass`,
  );
  assert(result.raw.clean === true, `${probeId} cleanup did not pass`);
  assert(
    result.projected.lastProbePass === true,
    `${probeId} API projection did not pass`,
  );
  evidence[probeId] = result;
}

const memory = evidence.SANDBOX_PROBE_MEMORY_LIMIT.raw.evidence;
assert(
  memory.requested_memory_bytes === memory.oci_memory_bytes,
  'OCI memory drift',
);
assert(
  String(memory.memory_max) === String(memory.requested_memory_bytes),
  'memory.max drift',
);
assert(
  eventValue(memory.memory_events, 'max') > 0,
  'memory.events max not observed',
);
const pids = evidence.SANDBOX_PROBE_PIDS_LIMIT.raw.evidence;
assert(pids.requested_pids === pids.oci_pids, 'OCI pids drift');
assert(String(pids.pids_max) === String(pids.requested_pids), 'pids.max drift');
assert(eventValue(pids.pids_events, 'max') > 0, 'pids.events max not observed');
const cpu = evidence.SANDBOX_PROBE_CPU_LIMIT.raw.evidence;
assert(
  cpu.cpu_max && !String(cpu.cpu_max).startsWith('max'),
  'cpu.max is not finite',
);
const concurrent = evidence.SANDBOX_PROBE_CONCURRENT_RESOURCES.raw.components;
assert(
  concurrent.length === 2,
  'concurrent profile did not return two components',
);
assert(
  concurrent[0].evidence.memory_max !== concurrent[1].evidence.memory_max &&
    concurrent[0].evidence.pids_max !== concurrent[1].evidence.pids_max,
  'concurrent profiles did not have independent memory/pids pairs',
);

evidence.cancellation = await runProbe('SANDBOX_PROBE_CANCELLATION', {
  cancel: true,
});
assert(
  evidence.cancellation.raw.qualification_pass === true,
  'cancellation outcome not accepted',
);
assert(
  evidence.cancellation.raw.outcome === 'SANDBOX_CANCELLED',
  'cancellation outcome drift',
);
assert(evidence.cancellation.raw.clean === true, 'cancellation cleanup failed');

evidence.cleanupFailure = await runProbe('SANDBOX_PROBE_CLEANUP_FAILURE');
assert(
  evidence.cleanupFailure.raw.outcome === 'SANDBOX_CLEANUP_FAILURE' &&
    evidence.cleanupFailure.raw.clean === false &&
    evidence.cleanupFailure.raw.qualification_pass === false,
  'cleanup fault was reported as success',
);
assert(
  evidence.cleanupFailure.projected.cleanupStatus === 'FAILED' &&
    evidence.cleanupFailure.projected.qualificationStatus === 'FAIL',
  'cleanup fault API projection was not fail-closed',
);
const verifyFailure = await api('/api/operations/sandbox/cleanup/verify', {
  method: 'POST',
  body: '{}',
});
assert(
  verifyFailure.status === 200 && verifyFailure.body.cleanupStatus === 'FAILED',
  'cleanup verification falsely succeeded',
);
const recovery = await api('/api/operations/sandbox/cleanup/recover', {
  method: 'POST',
  body: '{}',
});
assert(
  recovery.status === 200 &&
    recovery.body.cleanupStatus === 'VERIFIED' &&
    recovery.body.qualificationStatus === 'PENDING',
  'cleanup recovery did not return to fail-closed pending state',
);

evidence.finalFull = await runProbe('SANDBOX_PROBE_QUALIFICATION');
validateNormal(evidence.finalFull.raw);
const finalOverview = await api('/api/operations/sandbox');
assert(
  finalOverview.status === 200 &&
    finalOverview.body.qualificationState === 'QUALIFIED' &&
    finalOverview.body.realSubmissionExecution === 'DISABLED',
  'final overview is not qualified trusted-probe-only state',
);

const summary = {
  status: 'PASS',
  supervisor: {
    uid: evidence.finalFull.raw.evidence.supervisor_uid,
    gid: evidence.finalFull.raw.evidence.supervisor_gid,
  },
  full: evidence.finalFull.raw,
  cpu: evidence.SANDBOX_PROBE_CPU_LIMIT.raw.evidence,
  memory,
  pids,
  concurrent,
  cancellation: evidence.cancellation.raw,
  cleanupFailure: evidence.cleanupFailure.raw,
  recovery: recovery.body,
  finalOverview: finalOverview.body,
};
console.log(JSON.stringify(summary, null, 2));
