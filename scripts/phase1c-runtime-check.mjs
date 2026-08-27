const base = 'http://127.0.0.1:3100';
let cookie = '';
const call = async (path, init = {}) => {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
      ...(cookie ? { cookie } : {}),
    },
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0];
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { response, body };
};
const unique = `phase1c-${Date.now()}`;
const registered = await call('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    username: unique,
    email: `${unique}@example.test`,
    displayName: 'Phase 1C',
    password: 'phase1c-password',
  }),
});
if (registered.response.status !== 201)
  throw new Error(`register ${registered.response.status}`);
const login = await call('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ identity: unique, password: 'phase1c-password' }),
});
if (login.response.status !== 200)
  throw new Error(`login ${login.response.status}`);
const problem = await call('/api/problems', {
  method: 'POST',
  body: JSON.stringify({
    slug: unique,
    title: 'Phase 1C Runtime Problem',
    statement: 'Read input.',
    inputDescription: 'One line.',
    outputDescription: 'One line.',
    examples: [{ input: '1', output: '1' }],
    constraints: 'none',
    notes: '',
    timeLimitMs: 1000,
    memoryLimitBytes: 1048576,
    visibility: 'public',
    status: 'published',
    testdataVersion: 'td-v1',
  }),
});
if (problem.response.status !== 201)
  throw new Error(
    `problem ${problem.response.status}: ${JSON.stringify(problem.body)}`,
  );
const revisionId = problem.body.currentRevisionId;
console.log('problem-body', JSON.stringify(problem.body));
const revisions = await call(`/api/problems/${problem.body.id}/revisions`);
console.log('revisions', JSON.stringify(revisions.body));
const created = await call('/api/submissions', {
  method: 'POST',
  body: JSON.stringify({
    problemId: problem.body.id,
    problemRevisionId: revisionId,
    testdataVersionRef: 'td-v1',
    languageId: 'javascript',
    source: 'console.log(1)',
  }),
});
if (created.response.status !== 201 || created.body.status !== 'PENDING')
  throw new Error(
    `submission ${created.response.status}: ${JSON.stringify(created.body)}`,
  );
const listed = await call('/api/submissions');
if (
  listed.response.status !== 200 ||
  !listed.body.items.some((item) => item.id === created.body.id)
)
  throw new Error('submission list missing created item');
const detail = await call(`/api/submissions/${created.body.id}`);
if (
  detail.response.status !== 200 ||
  detail.body.ownerUserId !== registered.body.id ||
  detail.body.problemRevisionId !== revisionId ||
  detail.body.testdataVersionRef !== 'td-v1' ||
  detail.body.source !== 'console.log(1)'
)
  throw new Error(`submission detail mismatch: ${JSON.stringify(detail.body)}`);
const logout = await call('/api/auth/logout', { method: 'POST', body: '{}' });
if (logout.response.status !== 204)
  throw new Error(`logout ${logout.response.status}`);
const blocked = await call('/api/submissions', {
  method: 'POST',
  body: JSON.stringify({
    problemId: problem.body.id,
    problemRevisionId: revisionId,
    testdataVersionRef: 'td-v1',
    languageId: 'javascript',
    source: 'x',
  }),
});
if (blocked.response.status !== 401)
  throw new Error(`unauthenticated submission ${blocked.response.status}`);
console.log(
  JSON.stringify({
    register: registered.response.status,
    login: login.response.status,
    problem: problem.response.status,
    submission: created.response.status,
    submissionId: created.body.id,
    list: listed.response.status,
    detail: detail.response.status,
    logout: logout.response.status,
    unauthenticated: blocked.response.status,
  }),
);
