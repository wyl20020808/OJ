import { expect, test } from '@playwright/test';

test('real product experience journey across home, account, problems, and logout', async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const username = `phase1d_${suffix}`;
  const email = `${username}@example.test`;
  const password = 'phase1d-password';
  const title = `Phase 1D ${suffix}`;
  const slug = `phase1d-${suffix}`;
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

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Build solutions that hold up.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Problems', exact: true }),
  ).toBeVisible();

  await page.goto('/register');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Display name').fill('Phase 1D User');
  await page.getByLabel('Password').fill(password);
  const registration = page.waitForResponse((r) =>
    r.url().endsWith('/api/auth/register'),
  );
  await page.getByRole('button', { name: 'Register' }).click();
  expect((await registration).status()).toBe(201);
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email or username').fill(username);
  await page.getByLabel('Password').fill(password);
  const login = page.waitForResponse((r) =>
    r.url().endsWith('/api/auth/login'),
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect((await login).status()).toBe(200);
  await expect(page).toHaveURL(/\/problems$/);

  const me = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return { status: response.status, body: await response.json() };
  });
  expect(me.status).toBe(200);
  expect(me.body).toMatchObject({ username, email });
  expect(JSON.stringify(me.body)).not.toMatch(/password|hash|token/i);

  const account = await page.evaluate(async () => {
    const response = await fetch('/api/auth/account', {
      credentials: 'include',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(account.status).toBe(200);
  expect(account.body).toMatchObject({
    username,
    capabilities: { canManageSessions: true },
  });
  const sessions = await page.evaluate(async () => {
    const response = await fetch('/api/auth/sessions', {
      credentials: 'include',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(sessions.status).toBe(200);
  expect(sessions.body.length).toBeGreaterThan(0);

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
      title,
      statement: 'Phase 1D deterministic statement.',
      inputDescription: 'Input.',
      outputDescription: 'Output.',
      examples: [{ input: '1', output: '1' }],
      constraints: 'none',
      notes: 'No execution in this phase.',
      timeLimitMs: 1000,
      memoryLimitBytes: 65536,
      visibility: 'public',
      status: 'published',
      testdataVersion: 'phase1d-e2e-v1',
    },
  );
  expect(seeded.status).toBe(201);

  await page.goto('/');
  const home = await page.evaluate(async () => {
    const response = await fetch('/api/home');
    return { status: response.status, body: await response.json() };
  });
  expect(home.status).toBe(200);
  expect(Array.isArray(home.body.recentProblems)).toBe(true);
  await page.goto('/problems');
  await page.getByLabel('Search problems').fill(slug);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('link').filter({ hasText: title }).click();
  await expect(page).toHaveURL(new RegExp(`/problems/${slug}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(
    page.getByText('Phase 1D deterministic statement.'),
  ).toBeVisible();
  await expect(page.getByText('Examples')).toBeVisible();
  await expect(page.getByText('phase1d-e2e-v1')).toBeVisible();

  await page.goto('/profile');
  await expect(
    page.getByRole('heading', { name: 'Your profile' }),
  ).toBeVisible();
  await expect(page.getByText(`@${username}`)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Authoring workspace' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Authoring', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'My problems' }),
  ).toBeVisible();
  await page.goto('/submissions');
  await expect(
    page.getByRole('heading', { name: 'My submissions' }),
  ).toBeVisible();

  const logout = page.waitForResponse((r) =>
    r.url().endsWith('/api/auth/logout'),
  );
  await page.getByRole('button', { name: 'Sign out' }).click();
  expect((await logout).status()).toBe(204);
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  const unauthenticated = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return { status: response.status, body: await response.json() };
  });
  expect(unauthenticated.status).toBe(401);
  expect(unauthenticated.body.code).toBe('UNAUTHENTICATED');
  expect(pageErrors).toEqual([]);
  expect(
    consoleErrors.filter((e) => !e.includes('401') && !e.includes('404')),
  ).toEqual([]);
  expect(failedResponses).toEqual([]);
});
