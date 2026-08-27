import { expect, test } from '@playwright/test';
type PgClient = {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<unknown>;
  end(): Promise<void>;
};
type PgModule = {
  Client: new (options: { connectionString: string }) => PgClient;
};

const username = 'e2e_phase1a_user';
const email = 'e2e_phase1a@example.test';
const password = 'phase1a-password';
const slug = 'e2e-phase1a-problem';
const title = 'Phase 1A E2E Problem';
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform';

test.beforeEach(async () => {
  const loadPg = new Function('return import("pg")') as () => Promise<{
    default: PgModule;
  }>;
  const { default: pg } = await loadPg();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('DELETE FROM problems');
  await client.query('DELETE FROM users WHERE username = $1 OR email = $2', [
    username,
    email,
  ]);
  await client.end();
});

test('real runtime registration, session, problem journey, and logout', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const unexpectedResponses: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500) unexpectedResponses.push(response.url());
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Practice with purpose.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Display name').fill('Phase 1A E2E User');
  await page.getByLabel('Password').fill(password);
  const registration = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/register'),
  );
  await page.getByRole('button', { name: 'Register' }).click();
  const registrationResponse = await registration;
  expect(registrationResponse.status()).toBe(201);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email or username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/problems$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  const apiUser = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return { status: response.status, body: await response.json() };
  });
  expect(apiUser.status).toBe(200);
  expect(apiUser.body).toMatchObject({ username, email });

  const seed = await page.evaluate(
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
      statement: 'Solve the seeded Phase 1A problem.',
      inputDescription: 'One integer.',
      outputDescription: 'The same integer.',
      examples: [{ input: '1', output: '1' }],
      constraints: '1 <= n <= 10',
      notes: 'Deterministic browser fixture.',
      timeLimitMs: 1000,
      memoryLimitBytes: 65536,
      visibility: 'public',
      status: 'published',
      testdataVersion: 'e2e-v1',
    },
  );
  expect(seed.status).toBe(201);
  const seededList = await page.evaluate(async () => {
    const response = await fetch('/api/problems?offset=0&limit=100');
    return await response.json();
  });
  expect(
    seededList.items.some((item: { slug: string }) => item.slug === slug),
  ).toBe(true);

  await page.goto('/problems');
  await expect(page.getByText(title, { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('link').filter({ hasText: title }).click();
  await expect(page).toHaveURL(new RegExp(`/problems/${slug}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(
    page.getByText('Solve the seeded Phase 1A problem.'),
  ).toBeVisible();
  await expect(page.getByText('Examples')).toBeVisible();
  await expect(page.getByText('Time 1000 ms')).toBeVisible();

  const logout = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/logout'),
  );
  await page.getByRole('button', { name: 'Sign out' }).click();
  expect((await logout).status()).toBe(204);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  const unauthenticated = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return { status: response.status, body: await response.json() };
  });
  expect(unauthenticated.status).toBe(401);
  expect(unauthenticated.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(
    consoleErrors.filter(
      (message) =>
        !message.includes('status of 401') &&
        !message.includes('status of 404'),
    ),
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(unexpectedResponses).toEqual([]);
});
