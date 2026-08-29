import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const realRuntime = process.env.OJPLATFORM_PHASE1E_REAL_RUNTIME === 'true';
const controlKey = process.env.OJPLATFORM_PHASE1E_QUALIFICATION_CONTROL_KEY;
const apiPort = process.env.PHASE1E_API_PORT ?? '3021';

test.describe.configure({ mode: 'serial' });
test.describe('PHASE 1E-R server-backed Judge status journeys', () => {
  test.beforeEach((_, testInfo) => {
    testInfo.skip(
      !realRuntime || !controlKey,
      'Requires the Lead-owned real API, Redis namespace, and qualification control plane.',
    );
  });

  test('J1, J2, J4, W11, and W12 use real Auth, Problem, Submission, Redis, and synthetic controls', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const source = 'PHASE1ER_INERT_SOURCE_TEXT_ONLY';
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const unexpectedFailures: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
      if (!request.url().includes('/api/submissions/'))
        unexpectedFailures.push(
          `${request.url()} ${request.failure()?.errorText}`,
        );
    });

    await registerAndLogin(page, suffix, 'Owner');
    const problem = await createPublishedProblem(page, suffix);

    // J1: true browser submission, server-backed queued -> leased -> synthetic completion.
    const successSubmission = await submitThroughUi(page, problem.id, source);
    await page.goto(`/submissions/${successSubmission.id}`);
    await expect(page.getByText('Queued', { exact: true })).toBeVisible();
    await fixture(page, successSubmission.judgeJobId, 'claim');
    await page.reload();
    await expect(page.getByText('Leased', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/submitted code is not executed/i),
    ).toBeVisible();
    await fixture(page, successSubmission.judgeJobId, 'complete');
    await page.reload();
    await expect(
      page.getByText('Synthetic completion', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/QUALIFICATION ONLY/)).toBeVisible();
    await expect(page.locator('.judge-status')).not.toContainText(
      /\b(AC|WA|TLE|MLE|RE|CE)\b/,
    );

    // A second authenticated user cannot view either submission or Judge Job.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await registerAndLogin(otherPage, `${suffix}-other`, 'Other');
    await otherPage.goto(`/submissions/${successSubmission.id}`);
    await expect(
      otherPage.getByRole('heading', { name: 'Submission forbidden' }),
    ).toBeVisible();
    const forbiddenJob = await otherPage
      .context()
      .request.get(`/api/judge/jobs/${successSubmission.judgeJobId}`);
    expect(forbiddenJob.status()).toBe(403);
    await other.close();

    // J2: one server-produced retry and a second attempt, then synthetic completion.
    const retrySubmission = await submitThroughUi(page, problem.id, source);
    await fixture(page, retrySubmission.judgeJobId, 'claim');
    await fixture(page, retrySubmission.judgeJobId, 'retry');
    await page.goto(`/submissions/${retrySubmission.id}`);
    await expect(
      page.getByText('Retryable protocol failure', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Attempt 1 / 3')).toBeVisible();
    await fixture(page, retrySubmission.judgeJobId, 'claim');
    await page.reload();
    await expect(page.getByText('Attempt 2 / 3')).toBeVisible();
    await fixture(page, retrySubmission.judgeJobId, 'complete');
    await page.reload();
    await expect(
      page.getByText('Synthetic completion', { exact: true }),
    ).toBeVisible();

    // J4-B: Redis availability is a controlled infrastructure condition, not
    // a user-code result. Restore it before the journey continues.
    execFileSync(
      'wsl.exe',
      [
        '-d',
        'Ubuntu-24.04',
        '--',
        'docker',
        'stop',
        'ojplatform-local-redis-1',
      ],
      { stdio: 'pipe' },
    );
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Submission unavailable' }),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      /Terminal protocol failure/,
    );
    execFileSync(
      'wsl.exe',
      [
        '-d',
        'Ubuntu-24.04',
        '--',
        'docker',
        'start',
        'ojplatform-local-redis-1',
      ],
      { stdio: 'pipe' },
    );
    await expect
      .poll(async () => (await fetch(`http://127.0.0.1:${apiPort}/ready`)).ok)
      .toBe(true);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(
      page.getByText('Synthetic completion', { exact: true }),
    ).toBeVisible();

    // J4-A: stop only the Lead harness API. Vite remains available and shows
    // a transport surface, not a fabricated terminal Judge state.
    execFileSync(
      process.execPath,
      ['scripts/api-lifecycle-harness.mjs', 'stop'],
      {
        cwd: process.cwd(),
        env: { ...process.env, PHASE1E_API_PORT: apiPort },
        stdio: 'pipe',
      },
    );
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Submission unavailable' }),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      /Terminal protocol failure/,
    );
    execFileSync(
      process.execPath,
      ['scripts/api-lifecycle-harness.mjs', 'start'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PHASE1E_API_PORT: apiPort,
          OJPLATFORM_PHASE1E_QUALIFICATION: 'true',
          OJPLATFORM_PHASE1E_QUALIFICATION_CONTROL_KEY: controlKey,
        },
        stdio: 'pipe',
      },
    );
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(
      page.getByText('Synthetic completion', { exact: true }),
    ).toBeVisible();

    // Logout makes the protected detail inaccessible without retaining the old state.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto(`/submissions/${successSubmission.id}`);
    await expect(
      page.getByRole('heading', { name: 'Sign in required' }),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(
      consoleErrors.filter(
        (message) =>
          !/Failed to load resource: the server responded with a status of (401|404|500|502|503)/.test(
            message,
          ),
      ),
    ).toEqual([]);
    expect(unexpectedFailures).toEqual([]);
  });
});

async function registerAndLogin(
  page: Page,
  suffix: string,
  displayName: string,
) {
  const username = `phase1er${suffix.replace(/[^a-z0-9]/gi, '').slice(-16)}`;
  const password = 'Phase1ERPassword123!';
  await page.goto('/register');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(`${username}@example.test`);
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email or username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/problems$/);
}

async function createPublishedProblem(page: Page, suffix: string) {
  const response = await page.context().request.post('/api/problems', {
    data: {
      slug: `phase1er-${suffix}`,
      title: `Phase 1E-R ${suffix}`,
      statement: 'Qualification-only problem statement.',
      inputDescription: 'One integer.',
      outputDescription: 'One integer.',
      examples: [{ input: '1', output: '1' }],
      constraints: 'n = 1',
      timeLimitMs: 1000,
      memoryLimitBytes: 65536,
      visibility: 'public',
      status: 'published',
      testdataVersion: `phase1er-${suffix}`,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

async function submitThroughUi(page: Page, problemId: string, source: string) {
  await page.goto(`/problems/${problemId}/submit`);
  await expect(
    page.getByRole('heading', { name: 'Submit solution' }),
  ).toBeVisible();
  await page.getByLabel('Language').selectOption('javascript');
  await page.getByLabel('Source code').fill(source);
  await page.getByRole('button', { name: 'Submit source' }).click();
  await expect(
    page.getByRole('heading', { name: 'Submission received' }),
  ).toBeVisible();
  const text = await page
    .getByText(/Submission [0-9a-f-]+ was recorded/)
    .textContent();
  const id = text?.match(/Submission ([0-9a-f-]+)/)?.[1];
  expect(id).toBeTruthy();
  const response = await page.context().request.get(`/api/submissions/${id}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { judgeJobId?: string };
  expect(body.judgeJobId).toBeTruthy();
  return { id: id!, judgeJobId: body.judgeJobId! };
}

async function fixture(
  page: Page,
  jobId: string,
  action: 'claim' | 'retry' | 'complete',
) {
  const response = await page
    .context()
    .request.post(`/api/qualification/judge/${jobId}/${action}`, {
      headers: { 'x-ojplatform-qualification-control': controlKey! },
      data: {},
    });
  expect(response.status()).toBe(200);
}
