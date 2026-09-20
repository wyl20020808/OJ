// Phase 7C Judge tail E2E harness.
//
// Exercises the *product* HTTP API on a live production deployment (Web origin
// reverse-proxies /api to the API container) to verify the two Judge paths that
// Phase 7C could not confirm on the physical Windows host:
//
//   1. REJUDGE: AC submission -> product rejudge -> new evaluation generation
//      actually runs on the real Worker and publishes the same correct verdict.
//   2. CANCEL: in-flight submission -> product cancel -> the Judge stops
//      publishing a verdict and the persisted evaluation stays CANCELLED.
//
// It only uses documented product routes. It never touches Redis, PostgreSQL or
// the Judge Service control plane directly, and it never fabricates a session:
// registration and password login are real product flows.
//
// Usage:
//   PHASE7C_E2E_BASE_URL=http://localhost:8080 \
//   PHASE7C_E2E_PASSWORD=<password> \
//   node scripts/phase7c-judge-tail-e2e.mjs

const baseUrl = process.env.PHASE7C_E2E_BASE_URL ?? 'http://localhost:8080';
const password = process.env.PHASE7C_E2E_PASSWORD;
if (!password) throw new Error('PHASE7C_E2E_PASSWORD is required');

const suffix = Date.now().toString(36);
const username = `p7ctail${suffix}`.slice(0, 32);
const email = `${username}@example.invalid`;

const AC_SOURCE = `#include <iostream>
int main() {
  long long a = 0, b = 0;
  if (!(std::cin >> a >> b)) return 0;
  std::cout << (a + b) << std::endl;
  return 0;
}
`;
const WA_SOURCE = `#include <iostream>
int main() {
  long long a = 0, b = 0;
  if (!(std::cin >> a >> b)) return 0;
  std::cout << (a - b) << std::endl;
  return 0;
}
`;
const TLE_SOURCE = `int main() {
  volatile unsigned long long counter = 0;
  while (true) counter++;
  return 0;
}
`;

const cookies = new Map();
const cookieHeader = () =>
  [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');

function absorbCookies(response) {
  const values =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];
  for (const value of values) {
    const pair = value.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    cookies.set(
      pair.slice(0, separator).trim(),
      pair.slice(separator + 1).trim(),
    );
  }
}

async function api(path, { method = 'GET', body, csrf = false } = {}) {
  const headers = {};
  if (cookies.size > 0) headers.cookie = cookieHeader();
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (csrf) headers['x-csrf-token'] = cookies.get('oj_csrf') ?? '';
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  absorbCookies(response);
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text.slice(0, 400);
  }
  return { status: response.status, body: payload };
}

function expect(response, statuses, label) {
  if (!statuses.includes(response.status))
    throw new Error(
      `${label}: HTTP ${response.status} ${JSON.stringify(response.body).slice(0, 400)}`,
    );
  return response.body;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForEvaluation(submissionId, predicate, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    const evaluations = expect(
      await api(`/api/submissions/${submissionId}/evaluations`),
      [200],
      `${label} evaluations`,
    );
    last = Array.isArray(evaluations.items)
      ? evaluations.items.at(-1)
      : evaluations;
    if (last && predicate(last)) return last;
    await sleep(500);
  }
  throw new Error(`${label}: timeout, last=${JSON.stringify(last)}`);
}

const report = { baseUrl, username, steps: {} };

// 1. Real product registration + password login.
expect(
  await api('/api/auth/register', {
    method: 'POST',
    body: {
      username,
      email,
      displayName: `Phase 7C Tail ${suffix}`,
      password,
    },
  }),
  [201],
  'register',
);
const session = expect(
  await api('/api/auth/login', {
    method: 'POST',
    body: { identity: username, password, rememberMe: false },
  }),
  [200],
  'login',
);
if (!cookies.get('oj_session') || !cookies.get('oj_csrf'))
  throw new Error('login did not issue session and CSRF cookies');
report.steps.login = {
  userId: session.id ?? session.userId ?? null,
  sessionCookie: true,
  csrfCookie: true,
};

// 2. Own published problem with known Judge Data.
const problem = expect(
  await api('/api/problems', {
    method: 'POST',
    csrf: true,
    body: {
      slug: `phase7c-tail-${suffix}`,
      title: 'Phase 7C judge tail',
      statement: 'Read two integers and print their sum.',
      inputDescription: 'Two integers.',
      outputDescription: 'Their sum.',
      examples: [],
      constraints: '|a|,|b| <= 10^9',
      timeLimitMs: 5000,
      memoryLimitBytes: 268435456,
      visibility: 'public',
      status: 'published',
      testdataVersion: `tail-${suffix}`,
    },
  }),
  [200, 201],
  'create problem',
);
expect(
  await api(`/api/problems/${problem.id}/judge-data/draft/config`, {
    method: 'PUT',
    csrf: true,
    body: {
      timeLimitMs: 5000,
      memoryLimitBytes: 268435456,
      outputLimitBytes: 65536,
      checker: 'TOKEN_WHITESPACE',
      allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
    },
  }),
  [200, 201],
  'judge data config',
);
expect(
  await api(`/api/problems/${problem.id}/judge-data/draft/upload`, {
    method: 'POST',
    csrf: true,
    body: {
      inputBase64: Buffer.from('2 3\n', 'utf8').toString('base64'),
      outputBase64: Buffer.from('5\n', 'utf8').toString('base64'),
      inputFileName: '1.in',
      outputFileName: '1.out',
    },
  }),
  [200, 201],
  'judge data upload',
);
expect(
  await api(`/api/problems/${problem.id}/judge-data/draft/validate`, {
    method: 'POST',
    csrf: true,
  }),
  [200, 201],
  'judge data validate',
);
expect(
  await api(`/api/problems/${problem.id}/judge-data/publish`, {
    method: 'POST',
    csrf: true,
  }),
  [200, 201],
  'judge data publish',
);
const published = expect(
  await api(`/api/problems/${problem.id}`),
  [200],
  'read problem',
);
const submissionInput = (source) => ({
  problemId: problem.id,
  problemRevisionId: published.currentRevisionId,
  testdataVersionRef: published.testdataVersion,
  languageId: 'cpp20',
  source,
});
report.steps.problem = {
  problemId: problem.id,
  revisionId: published.currentRevisionId,
  testdataVersion: published.testdataVersion,
};

// 3. Normal AC regression on the rebuilt API.
const accepted = expect(
  await api('/api/submissions', {
    method: 'POST',
    csrf: true,
    body: submissionInput(AC_SOURCE),
  }),
  [200, 201],
  'AC submission',
);
const acEvaluation = await waitForEvaluation(
  accepted.id,
  (item) => item.status === 'COMPLETED_WITH_VERDICT',
  'AC evaluation',
  120_000,
);
report.steps.initialAc = {
  submissionId: accepted.id,
  evaluationGeneration: acEvaluation.evaluationGeneration,
  status: acEvaluation.status,
  verdict: acEvaluation.verdict,
};
if (acEvaluation.verdict !== 'AC')
  throw new Error(`initial AC verdict mismatch: ${acEvaluation.verdict}`);

// 4. WA regression on the same problem.
const wrongAnswer = expect(
  await api('/api/submissions', {
    method: 'POST',
    csrf: true,
    body: submissionInput(WA_SOURCE),
  }),
  [200, 201],
  'WA submission',
);
const waEvaluation = await waitForEvaluation(
  wrongAnswer.id,
  (item) => item.status === 'COMPLETED_WITH_VERDICT',
  'WA evaluation',
  120_000,
);
report.steps.initialWa = {
  submissionId: wrongAnswer.id,
  evaluationGeneration: waEvaluation.evaluationGeneration,
  status: waEvaluation.status,
  verdict: waEvaluation.verdict,
};
if (waEvaluation.verdict !== 'WA')
  throw new Error(`initial WA verdict mismatch: ${waEvaluation.verdict}`);

// 5. Product rejudge of the accepted submission.
const rejudged = await api(`/api/submissions/${accepted.id}/rejudge`, {
  method: 'POST',
  csrf: true,
  body: {},
});
report.steps.rejudge = { httpStatus: rejudged.status, body: rejudged.body };
expect(rejudged, [200], 'rejudge');
const secondGeneration = await waitForEvaluation(
  accepted.id,
  (item) =>
    item.evaluationGeneration === 2 && item.status === 'COMPLETED_WITH_VERDICT',
  'rejudge evaluation',
  120_000,
);
report.steps.rejudge.generation = secondGeneration.evaluationGeneration;
report.steps.rejudge.verdict = secondGeneration.verdict;
report.steps.rejudge.judgeJobId = secondGeneration.judgeJobId ?? null;
if (secondGeneration.verdict !== 'AC')
  throw new Error(`rejudge verdict mismatch: ${secondGeneration.verdict}`);

// 6. Product cancel of an in-flight submission.
const inFlight = expect(
  await api('/api/submissions', {
    method: 'POST',
    csrf: true,
    body: submissionInput(TLE_SOURCE),
  }),
  [200, 201],
  'cancel submission',
);
let cancelled;
for (let attempt = 0; attempt < 20; attempt++) {
  cancelled = await api(`/api/submissions/${inFlight.id}/judge/cancel`, {
    method: 'POST',
    csrf: true,
    body: {},
  });
  if (cancelled.status !== 404) break;
  await sleep(100);
}
report.steps.cancel = { httpStatus: cancelled.status, body: cancelled.body };
expect(cancelled, [200], 'cancel');
const cancelledEvaluation = await waitForEvaluation(
  inFlight.id,
  (item) => item.status === 'CANCELLED',
  'cancelled evaluation',
  30_000,
);
report.steps.cancel.evaluationStatus = cancelledEvaluation.status;
report.steps.cancel.verdict = cancelledEvaluation.verdict ?? null;
// The worker is allowed to finish its current sandbox run, but its late result
// must be rejected: the persisted evaluation may never gain a verdict.
await sleep(12_000);
const after = expect(
  await api(`/api/submissions/${inFlight.id}/evaluations`),
  [200],
  'post-cancel evaluations',
).items.at(-1);
report.steps.cancel.afterWorkerCompletion = {
  status: after.status,
  verdict: after.verdict ?? null,
};
if (after.status !== 'CANCELLED' || after.verdict)
  throw new Error(`cancel was overwritten: ${JSON.stringify(after)}`);
const submissionAfterCancel = await api(`/api/submissions/${inFlight.id}`);
report.steps.cancel.submissionDetailRead = {
  httpStatus: submissionAfterCancel.status,
  status: submissionAfterCancel.body?.status ?? null,
};

console.log(JSON.stringify(report, null, 2));
if (submissionAfterCancel.status !== 200)
  throw new Error(
    `post-cancel submission read failed: HTTP ${submissionAfterCancel.status}`,
  );
