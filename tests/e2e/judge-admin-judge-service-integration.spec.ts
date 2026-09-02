import { expect, test } from '@playwright/test';

test('Product Backend reads the frozen Judge Admin service boundary', async ({
  page,
}) => {
  const directJudgeRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/v1\/admin|judge-service-token/i.test(request.url()))
      directJudgeRequests.push(request.url());
  });

  await page.goto('/login');
  await page.getByLabel('邮箱/手机号').fill('phase2b-operator@example.test');
  await page.getByLabel('密码').fill('Phase2BOperatorPass123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/problems$/);

  await page.goto('/admin/judge/nodes');
  await expect(page.getByText('Registry 为空', { exact: true })).toBeVisible();
  const summary = await page.evaluate(async () => {
    const response = await fetch('/api/admin/judge/summary', {
      credentials: 'include',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(summary.status).toBe(200);
  expect(summary.body).toMatchObject({
    totalNodes: 0,
    onlineCount: 0,
    busyCount: 0,
    drainingCount: 0,
    offlineCount: 0,
    unhealthyCount: 0,
    activeJobs: 0,
    totalCapacity: 0,
    schedulableCapacity: 0,
  });
  const nodes = await page.evaluate(async () => {
    const response = await fetch('/api/admin/judge/nodes', {
      credentials: 'include',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(nodes).toEqual({ status: 200, body: { items: [], nextCursor: null } });
  const metrics = await page.evaluate(async () => {
    const response = await fetch('/api/admin/judge/metrics', {
      credentials: 'include',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(metrics.status).toBe(200);
  expect(metrics.body).toMatchObject({
    activeJobs: 0,
    totalCapacity: 0,
  });
  const missing = await page.evaluate(async () => {
    const response = await fetch('/api/admin/judge/nodes/missing-node', {
      credentials: 'include',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(missing).toMatchObject({
    status: 404,
    body: { code: 'JUDGE_NODE_NOT_FOUND' },
  });
  expect(directJudgeRequests).toEqual([]);
});
