import { expect, test } from '@playwright/test';

test.beforeEach(async () => {
  const loadPg = new Function('return import("pg")') as () => Promise<{
    default: {
      Client: new (options: { connectionString: string }) => {
        connect(): Promise<void>;
        query(text: string): Promise<unknown>;
        end(): Promise<void>;
      };
    };
  }>;
  const { default: pg } = await loadPg();
  const client = new pg.Client({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform',
  });
  await client.connect();
  await client.query('DELETE FROM submissions');
  await client.query('DELETE FROM problems');
  await client.query('DELETE FROM users');
  await client.end();
});

test('real submission intake journey and ownership boundary', async ({
  page,
  browser,
}) => {
  const suffix = Date.now().toString();
  const username = `submitter${suffix}`;
  const email = `${username}@example.test`;
  const password = 'phase1c-password';
  const slug = `phase1c-${suffix}`;
  const source = '<script>console.log("untrusted")</script>';
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 500) failedResponses.push(response.url());
  });

  await page.goto('/register');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Display name').fill('Phase 1C Submitter');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email or username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/problems$/);

  const seeded = await page.evaluate(
    async (payload) => {
      const response = await fetch('/api/problems', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json() };
    },
    {
      slug,
      title: `Phase 1C ${suffix}`,
      statement: 'Intake only statement.',
      inputDescription: 'One line.',
      outputDescription: 'One line.',
      examples: [{ input: '1', output: '1' }],
      constraints: 'none',
      notes: 'No execution in this phase.',
      timeLimitMs: 1000,
      memoryLimitBytes: 65536,
      visibility: 'public',
      status: 'published',
      testdataVersion: 'phase1c-e2e-v1',
    },
  );
  expect(seeded.status).toBe(201);
  const seededDetail = await page.evaluate(async (id) => {
    const response = await fetch(`/api/problems/${id}`);
    return { status: response.status, body: await response.json() };
  }, seeded.body.id);
  expect(seededDetail.status).toBe(200);

  await page.goto('/problems');
  await expect(
    page.getByText(`Phase 1C ${suffix}`, { exact: true }),
  ).toBeVisible();
  await page.goto(`/problems/${seeded.body.id}`);
  await expect(page).toHaveURL(new RegExp(`/problems/${seeded.body.id}$`));
  await page.getByRole('link', { name: 'Submit solution' }).click();
  await expect(
    page.getByRole('heading', { name: 'Submit solution' }),
  ).toBeVisible();
  await expect(page.getByLabel('Language')).toContainText('JavaScript');
  await page.getByLabel('Source code').fill(source);
  await page.getByRole('button', { name: 'Submit source' }).click();
  await expect(
    page.getByRole('heading', { name: 'Submission received' }),
  ).toBeVisible();
  const received = await page
    .getByText(/Submission [0-9a-f-]+ was recorded/)
    .textContent();
  expect(received).toBeTruthy();
  const submissionId = received!.match(/Submission ([0-9a-f-]+)/)?.[1];
  expect(submissionId).toBeTruthy();

  await page.getByRole('link', { name: 'View submission history' }).click();
  await expect(page).toHaveURL(/\/submissions$/);
  await expect(page.getByText(submissionId!)).toBeVisible();
  await page.getByRole('link', { name: 'Details' }).click();
  await expect(page).toHaveURL(new RegExp(`/submissions/${submissionId}$`));
  await expect(
    page.getByRole('status', {
      name: /Pending intake|Queued|Leased|Worker lease claimed|Worker accepted the job|Qualification fixture running/,
    }),
  ).toBeVisible();
  await expect(page.getByText('revision', { exact: false })).toContainText(
    seeded.body.currentRevisionId,
  );
  await expect(page.getByText('phase1c-e2e-v1', { exact: true })).toBeVisible();
  await expect(
    page.getByText(seeded.body.authorId, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('pre.source')).toHaveText(source);
  await expect(
    page.getByText(/Execution and verdicts are not available/),
  ).toBeVisible();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  const otherUsername = `other${suffix}`;
  await otherPage.goto('/register');
  await otherPage.getByLabel('Username').fill(otherUsername);
  await otherPage.getByLabel('Email').fill(`${otherUsername}@example.test`);
  await otherPage.getByLabel('Display name').fill('Other User');
  await otherPage.getByLabel('Password').fill(password);
  await otherPage.getByRole('button', { name: 'Register' }).click();
  await expect(otherPage).toHaveURL(/\/login$/);
  await otherPage.getByLabel('Email or username').fill(otherUsername);
  await otherPage.getByLabel('Password').fill(password);
  await otherPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(otherPage).toHaveURL(/\/problems$/);
  const otherMe = await otherPage.evaluate(
    async () =>
      (await fetch('/api/auth/me', { credentials: 'include' })).status,
  );
  expect(otherMe).toBe(200);
  const otherAccess = await otherPage.evaluate(async (id) => {
    const response = await fetch(`/api/submissions/${id}`, {
      credentials: 'include',
    });
    return response.status;
  }, submissionId);
  expect(otherAccess).toBe(403);
  await other.close();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await page.goto(`/problems/${seeded.body.id}/submit`);
  await expect(
    page.getByRole('heading', { name: 'Sign in required' }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(
    consoleErrors.filter(
      (error) =>
        !error.includes('401') &&
        !error.includes('404') &&
        !error.includes('503'),
    ),
  ).toEqual([]);
  expect(failedResponses).toEqual([]);
});
