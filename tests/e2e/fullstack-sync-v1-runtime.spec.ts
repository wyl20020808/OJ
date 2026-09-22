import { expect, test } from '@playwright/test';

test('Full-Stack Synchronization V1 uses composed runtime contracts', async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const username = `sync_${suffix}`;
  const email = `${username}@example.test`;
  const password = 'sync-runtime-password-123';
  const problemTitle = `同步验证题目 ${suffix}`;
  const problemSlug = `sync-runtime-${suffix}`;
  const teamName = `同步验证团队 ${suffix}`;
  const teamSlug = `sync-team-${suffix}`;
  const assignmentTitle = `同步验证作业 ${suffix}`;
  const contestTitle = `同步验证比赛 ${suffix}`;
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responseErrors: string[] = [];
  const unexpectedServerErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      responseErrors.push(`${response.status()} ${response.url()}`);
    if (response.status() >= 500 && !response.url().includes('/standings'))
      unexpectedServerErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('/');
  const registration = await page.evaluate(
    async (input) => {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      return { status: response.status, body: await response.json() };
    },
    { username, email, displayName: 'Synchronization User', password },
  );
  expect(registration.status).toBe(201);

  await page.goto('/login');
  await page.getByLabel('邮箱/手机号').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/problems$/);

  const created = await page.evaluate(
    async ({
      problemTitle,
      problemSlug,
      teamName,
      teamSlug,
      assignmentTitle,
    }) => {
      const csrf = document.cookie
        .split('; ')
        .find((value) => value.startsWith('oj_csrf='))
        ?.slice('oj_csrf='.length);
      const request = async (url: string, body: unknown) => {
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
          },
          body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() };
      };
      const problem = await request('/api/problems', {
        slug: problemSlug,
        title: problemTitle,
        statement: 'Runtime-backed synchronization statement.',
        inputDescription: 'Two integers.',
        outputDescription: 'Their sum.',
        examples: [{ input: '1 2', output: '3' }],
        constraints: 'Integers.',
        notes: '',
        timeLimitMs: 1000,
        memoryLimitBytes: 256 * 1024 * 1024,
        visibility: 'public',
        status: 'published',
        testdataVersion: 'fullstack-sync-v1',
      });
      if (problem.status !== 201) return { problem };
      const team = await request('/api/teams', {
        name: teamName,
        slug: teamSlug,
        description: 'Runtime-backed synchronization team.',
        visibility: 'PUBLIC',
        joinPolicy: 'OPEN',
      });
      if (team.status !== 201) return { problem, team };
      const assignment = await request(`/api/teams/${teamSlug}/assignments`, {
        title: assignmentTitle,
        description: 'Runtime-backed synchronization assignment.',
        problemIds: [problem.body.id],
        status: 'PUBLISHED',
      });
      return { problem, team, assignment };
    },
    { problemTitle, problemSlug, teamName, teamSlug, assignmentTitle },
  );
  expect(created.problem.status).toBe(201);
  expect(created.team?.status).toBe(201);
  expect(created.assignment?.status).toBe(201);

  await page.goto(`/problems/${problemSlug}`);
  await expect(page.getByRole('heading', { name: problemTitle })).toBeVisible();
  await expect(page.getByText(/样例运行按 EXACT_BYTES/)).toBeVisible();
  const favoriteResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/profile/favorites/'),
  );
  await page.getByRole('button', { name: '收藏' }).click();
  expect((await favoriteResponse).status()).toBe(201);
  await expect(page.getByRole('button', { name: '已收藏' })).toBeDisabled();

  await page.goto('/homework');
  await expect(
    page.getByRole('heading', { name: assignmentTitle }),
  ).toBeVisible();
  await page.getByRole('button', { name: '开始作业' }).click();
  await expect(page).toHaveURL(/\/homework\//);
  await expect(
    page.getByRole('heading', { name: assignmentTitle }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /同步验证题目/ })).toBeVisible();

  await page.goto('/teams');
  await expect(page.getByRole('heading', { name: '团队列表' })).toBeVisible();
  await page.goto(`/teams/${teamSlug}`);
  await expect(page.getByRole('heading', { name: teamName })).toBeVisible();
  await expect(page.getByText('@' + username)).toBeVisible();

  await page.goto('/discussion');
  await expect(
    page.getByRole('heading', { name: '用文字记录思考，让算法的世界更温暖' }),
  ).toBeVisible();
  await expect(page.getByText('我的关注（暂不可用）')).toBeVisible();
  await expect(page.getByText('我的收藏（暂不可用）')).toBeVisible();

  await page.goto('/contests/new');
  await page.getByLabel('比赛名称').fill(contestTitle);
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel('开始时间').fill(start);
  await page.getByLabel('结束时间').fill(end);
  await page.getByLabel('题目选择与排序').fill(String(created.problem.body.id));
  await page.getByRole('button', { name: '创建比赛' }).click();
  await expect(page).toHaveURL(/\/contests\/[^/]+\/settings$/);
  const contestId = new URL(page.url()).pathname.split('/')[2]!;

  const submissionHistory = page.waitForResponse((response) =>
    response.url().includes(`/api/contests/${contestId}/submissions`),
  );
  await page.goto(`/contests/${contestId}/submissions`);
  expect((await submissionHistory).status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: '我的比赛提交' }),
  ).toBeVisible();
  await expect(page.getByText('暂无比赛提交。')).toBeVisible();
  await expect(page.getByText(/比赛专用提交入口尚未接入/)).toBeVisible();

  await page.goto(`/contests/${contestId}/standings`);
  await expect(page.getByText(/后端计分引擎尚未接入/)).toBeVisible();
  await page.goto('/wrong-book');
  await expect(page.getByText('错题集数据暂不可用')).toBeVisible();
  await expect(page.getByText(/Verdict Engine 尚未提供/)).toBeVisible();

  await page.goto('/admin/judge/nodes');
  await expect(page.getByRole('heading', { name: '无权访问' })).toBeVisible();
  await expect(page.getByRole('button', { name: '排空任务' })).toHaveCount(0);

  await page.goto('/');
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  const loggedOut = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return response.status;
  });
  expect(loggedOut).toBe(401);

  expect(pageErrors).toEqual([]);
  expect(
    responseErrors.filter(
      (entry) =>
        !entry.startsWith('401 ') &&
        !(entry.startsWith('503 ') && entry.includes('/standings')),
    ),
  ).toEqual([]);
  expect(
    consoleErrors.filter((message) => message.includes('AssignmentDetail')),
  ).toEqual([]);
  expect(
    consoleErrors.filter(
      (message) =>
        !message.includes('401') &&
        !message.includes('503') &&
        !message.includes('Failed to load resource') &&
        !message.includes('ExecutionPanel'),
    ),
  ).toEqual([]);
  expect(unexpectedServerErrors).toEqual([]);
});
