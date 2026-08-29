import Redis from 'ioredis';

const base = process.env.PHASE2A_API_URL ?? 'http://127.0.0.1:3021';
const cookie = process.env.PHASE2A_SESSION_COOKIE;
if (!cookie) throw new Error('PHASE2A_SESSION_COOKIE is required');
const headers = { cookie, 'content-type': 'application/json' };
const request = (path, init = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:56379');
const prefix = process.env.PHASE2A_QUEUE_PREFIX ?? 'oj:judge:qualification';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const responseJson = async (response, label) => {
  if (!response.ok) throw new Error(`${label}: ${response.status} ${await response.text()}`);
  return response.json();
};
try {
  const suffix = Date.now();
  const problem = await responseJson(
    await request('/api/problems', {
      method: 'POST',
      body: JSON.stringify({
        slug: `phase2a-cancel-${suffix}`,
        title: 'Cancellation qualification',
        statement: 'Inert statement.',
        inputDescription: 'n',
        outputDescription: 'n',
        examples: [],
        constraints: 'none',
        timeLimitMs: 1000,
        memoryLimitBytes: 65536,
        visibility: 'public',
        status: 'published',
        testdataVersion: `cancel-${suffix}`,
      }),
    }),
    'problem',
  );
  const submission = await responseJson(
    await request('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({
        problemId: problem.id,
        problemRevisionId: problem.currentRevisionId,
        testdataVersionRef: problem.testdataVersion,
        languageId: 'javascript',
        source: 'INERT_API_CANCEL_SOURCE',
      }),
    }),
    'submission',
  );
  const jobKey = `${prefix}:job:${submission.judgeJobId}`;
  const job = JSON.parse((await redis.get(jobKey)) ?? 'null');
  job.fixtureId = 'FX-CANCEL';
  await redis.set(jobKey, JSON.stringify(job));
  await sleep(60);
  const cancel = await responseJson(
    await request(`/api/submissions/${submission.id}/judge/cancel`, {
      method: 'POST',
      body: '{}',
    }),
    'cancel',
  );
  let final;
  for (let i = 0; i < 80; i++) {
    final = JSON.parse((await redis.get(jobKey)) ?? 'null');
    if (final?.status === 'CANCELLED' || final?.status === 'SUCCEEDED_FAKE') break;
    await sleep(25);
  }
  console.log(JSON.stringify({
    submissionId: submission.id,
    judgeJobId: submission.judgeJobId,
    apiCancelStatus: cancel.status,
    finalStatus: final?.status,
    finalAttempt: final?.attempt,
    sourceExecution: 'not invoked',
  }));
} finally {
  await redis.quit();
}
