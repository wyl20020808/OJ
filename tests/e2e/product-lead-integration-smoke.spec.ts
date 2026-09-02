import { expect, test } from '@playwright/test';

test('product lead integration smoke uses the real product runtime', async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const username = `pli_${suffix}`;
  const email = `${username}@example.test`;
  const password = 'pli-password-123';
  const title = `Product integration ${suffix}`;
  const slug = `product-integration-${suffix}`;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500) failedResponses.push(response.url());
  });

  await page.goto('/');
  const menu = page.getByRole('button', { name: '打开导航' });
  if (await menu.count()) await menu.click();
  await expect(
    page.getByRole('navigation', { name: 'Primary navigation' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Problems' })).toBeVisible();

  await page.goto('/register');
  await expect(
    page.getByRole('heading', { name: '从验证身份开始' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /发送邮箱验证码/ }),
  ).toBeDisabled();

  const registered = await page.evaluate(
    async (payload) => {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json() };
    },
    { username, email, displayName: 'Product Integration User', password },
  );
  expect(registered.status).toBe(201);

  await page.goto('/login');
  await page.getByLabel('邮箱/手机号').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/problems$/);

  const me = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return { status: response.status, body: await response.json() };
  });
  expect(me.status).toBe(200);
  expect(me.body).toMatchObject({ username, email });
  expect(JSON.stringify(me.body)).not.toMatch(/password|hash|token/i);

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
      statement: 'Product integration statement.',
      inputDescription: 'Input.',
      outputDescription: 'Output.',
      examples: [{ input: '1', output: '1' }],
      constraints: 'none',
      notes: 'No execution in this phase.',
      timeLimitMs: 1000,
      memoryLimitBytes: 65536,
      visibility: 'public',
      status: 'published',
      testdataVersion: 'pli-e2e-v1',
    },
  );
  expect(seeded.status).toBe(201);

  await page.goto('/problems');
  await page.getByPlaceholder('按题目标题或题号筛选').fill(slug);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('link').filter({ hasText: title }).click();
  await expect(page).toHaveURL(new RegExp(`/problems/${slug}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Product integration statement.')).toBeVisible();
  await expect(page.getByText('pli-e2e-v1')).toBeVisible();

  for (const path of ['/contests', '/profile', '/messages', '/notifications']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main')).not.toContainText('页面不存在');
  }
  await page.goto('/contests');
  await expect(page.getByRole('link', { name: '比赛列表' })).toBeVisible();
  await page.goto('/profile');
  await expect(page.getByText(`@${username}`)).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(true);

  const logoutMenu = page.getByRole('button', { name: '打开导航' });
  if (await logoutMenu.count()) await logoutMenu.click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  const loggedOut = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return { status: response.status, body: await response.json() };
  });
  expect(loggedOut.status).toBe(401);
  expect(loggedOut.body.code).toBe('UNAUTHENTICATED');

  await page.goto('/login');
  await page.getByRole('tab', { name: '游客登录' }).click();
  await expect(
    page.getByRole('button', { name: '以游客身份继续' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '以游客身份继续' }).click();
  await expect(page).toHaveURL(/\/problems$/);
  const guestMenu = page.getByRole('button', { name: '打开导航' });
  if (await guestMenu.count()) await guestMenu.click();
  await expect(page.getByText('游客', { exact: true }).first()).toBeVisible();

  expect(
    consoleErrors.filter(
      (message) => !message.includes('401') && !message.includes('404'),
    ),
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});
