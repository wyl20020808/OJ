import { expect, test } from '@playwright/test';

test('Guest owner problem actions and responsive editor remain truthful', async ({
  page,
}, testInfo) => {
  const suffix = Date.now().toString();
  const slug = `web-ui-polish-${suffix}`;
  const title = `Web UI Polish ${suffix}`;
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  const guest = await page.evaluate(async () => {
    const response = await fetch('/api/auth/guest/continue', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(guest.status).toBe(200);

  const created = await page.evaluate(
    async ({ slug: problemSlug, title: problemTitle }) => {
      const csrf = document.cookie
        .split('; ')
        .find((value) => value.startsWith('oj_csrf='))
        ?.slice('oj_csrf='.length);
      const response = await fetch('/api/problems', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
        },
        body: JSON.stringify({
          slug: problemSlug,
          title: problemTitle,
          statement: 'Compute a sum.',
          inputDescription: 'Two integers.',
          outputDescription: 'Their sum.',
          examples: [],
          constraints: 'Integers.',
          notes: '',
          timeLimitMs: 1000,
          memoryLimitBytes: 256 * 1024 * 1024,
          visibility: 'public',
          status: 'published',
          testdataVersion: 'web-ui-polish-v1',
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { slug, title },
  );
  expect(created.status).toBe(201);

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 1024, height: 768 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/problems/${slug}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('button', { name: '提交代码' })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑题目' })).toBeVisible();
    await expect(page.getByRole('button', { name: '收藏' })).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}.png`),
      fullPage: true,
    });
  }

  await page.getByRole('button', { name: '编辑题目' }).click();
  await expect(page.getByRole('button', { name: '保存题面' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '发布题目' })).toHaveCount(0);
  await page.getByRole('button', { name: '评测数据' }).click();
  await expect(page.getByRole('button', { name: '校验草稿' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '发布新数据版本' }),
  ).toBeVisible();
  await page.goto('/problems');
  await expect(page.getByRole('link', { name: '新建题目' })).toBeVisible();
  await page.goto('/submissions');
  await expect(page.getByRole('heading', { name: '评测列表' })).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(
    consoleErrors.filter(
      (error) => !error.includes('401') && !error.includes('404'),
    ),
  ).toEqual([]);
});
