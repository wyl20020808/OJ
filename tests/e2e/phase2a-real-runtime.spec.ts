import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test('real API, Redis, and Go Worker synthetic journey', async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(
    process.env.OJPLATFORM_PHASE2A_REAL_RUNTIME !== 'true',
    'Requires the Lead API and real Go Worker runtime.',
  );
  const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
  const username = `phase2a${suffix.slice(-12)}`;
  const password = 'Phase2ARealPass123!';
  await page.goto('/register');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(`${username}@example.test`);
  await page.getByLabel('Display name').fill('Phase 2A Owner');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email or username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/problems$/);

  const problemResponse = await page.request.post('/api/problems', {
    data: {
      slug: `phase2a-${suffix}`,
      title: 'Phase 2A Qualification Problem',
      statement: 'Inert qualification statement.',
      inputDescription: 'n',
      outputDescription: 'n',
      examples: [],
      constraints: 'none',
      timeLimitMs: 1000,
      memoryLimitBytes: 65536,
      visibility: 'public',
      status: 'published',
      testdataVersion: `phase2a-${suffix}`,
    },
  });
  expect(problemResponse.status()).toBe(201);
  const problem = await problemResponse.json();
  await page.goto(`/problems/${problem.id}/submit`);
  await page.getByLabel('Language').selectOption({ index: 1 });
  await page.getByLabel('Source code').fill('INERT_SOURCE_TEXT_ONLY');
  await page.getByRole('button', { name: 'Submit source' }).click();
  await expect(
    page.getByRole('heading', { name: 'Submission received' }),
  ).toBeVisible();
  const received = await page
    .getByText(/Submission [0-9a-f-]+ was recorded/)
    .textContent();
  const submissionId = received?.match(/Submission ([0-9a-f-]+)/)?.[1];
  expect(submissionId).toBeTruthy();
  await page.goto(`/submissions/${submissionId}`);
  await expect(
    page.getByText('Synthetic completion', { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(/QUALIFICATION ONLY.*NOT A REAL EXECUTION VERDICT/i),
  ).toBeVisible();
  await expect(page.locator('.judge-status')).not.toContainText(
    /\b(AC|WA|TLE|MLE|RE|CE)\b/,
  );

  const diagnostics = await page.request.get('/api/operations/judge-workers');
  expect(diagnostics.status()).toBe(403);
  const capabilities = await page.request.get('/api/judge/capabilities');
  expect(capabilities.status()).toBe(403);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto(`/submissions/${submissionId}`);
  await expect(
    page.getByRole('heading', { name: 'Sign in required' }),
  ).toBeVisible();
});
