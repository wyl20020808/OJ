import { expect, test } from '@playwright/test';

test('Judge Admin uses the real Product Backend boundary', async ({ page }) => {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  const judgeDirectRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (/\/v1\/admin|JUDGE_SERVICE/i.test(request.url()))
      judgeDirectRequests.push(request.url());
  });

  await page.goto('/login');
  await page.getByLabel('邮箱/手机号').fill('phase2b-operator@example.test');
  await page.getByLabel('密码').fill('Phase2BOperatorPass123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/problems$/);

  await page.goto('/admin/judge/nodes');
  await expect(
    page.getByText('Judge Service 暂不可用', { exact: true }),
  ).toBeVisible();
  const operatorSummary = await page.evaluate(async () => {
    const response = await fetch('/api/admin/judge/summary', {
      credentials: 'include',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(operatorSummary.status).toBe(502);
  expect(operatorSummary.body.code).toBe('JUDGE_SERVICE_UNAVAILABLE');
  expect(operatorSummary.body.requestId).toEqual(expect.any(String));
  expect(judgeDirectRequests).toEqual([]);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/judge/nodes');
    await expect(
      page.getByText('Judge Service 暂不可用', { exact: true }),
    ).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  }

  const csrfCookie = await page.evaluate(() => document.cookie);
  expect(csrfCookie).toMatch(/oj_csrf=/);
  const menu = page.getByRole('button', { name: '打开导航' });
  if (await menu.count()) await menu.click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();

  const denied = await page.evaluate(async () => {
    const response = await fetch('/api/admin/judge/summary', {
      credentials: 'include',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(denied.status).toBe(401);
  expect(denied.body.code).toBe('UNAUTHENTICATED');
  expect(
    errors.filter(
      (message) =>
        !message.includes('status of 401') &&
        !message.includes('status of 404') &&
        !message.includes('status of 502'),
    ),
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});
