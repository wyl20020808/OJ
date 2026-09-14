import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

test('Contest landing and detail use real API data without responsive overflow', async ({
  page,
}, testInfo) => {
  const serverErrors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) serverErrors.push(response.url());
  });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const summary = page.waitForResponse((response) =>
      response.url().endsWith('/api/contests/home-summary'),
    );
    await page.goto('/contests');
    expect((await summary).status()).toBe(200);

    await expect(page.getByRole('heading', { name: '正在进行' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '即将开始' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '历史比赛' })).toBeVisible();
    const runningCard = page
      .getByRole('link')
      .filter({ hasText: '数据结构挑战赛' })
      .first();
    await expect(runningCard).toBeVisible();
    await expect(
      runningCard.getByText('216 人', { exact: true }),
    ).toBeVisible();
    await expect(runningCard.getByText('7 题', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`contest-${viewport.name}.png`),
      fullPage: true,
    });
  }

  await page.setViewportSize(viewports[0]);
  await page
    .getByRole('link')
    .filter({ hasText: '数据结构挑战赛' })
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/contests\/30000000-0000-4000-8000-000000000002$/,
  );
  await expect(
    page.getByRole('heading', { name: '数据结构挑战赛' }),
  ).toBeVisible();
  const detailFacts = page.getByLabel('比赛概览');
  await expect(detailFacts.getByText('参赛人数：216')).toBeVisible();
  await expect(detailFacts.getByText('题目数量：7')).toBeVisible();
  await page.getByRole('link', { name: '题目', exact: true }).click();
  await expect(page.locator('.contest-problems li')).toHaveCount(7);

  for (const [title, lifecycle] of [
    ['周末算法挑战赛', 'UPCOMING'],
    ['暑期训练收官赛', 'ENDED'],
  ] as const) {
    await page.goto('/contests');
    await page.getByRole('link').filter({ hasText: title }).first().click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(lifecycle, { exact: true })).toBeVisible();
  }

  expect(serverErrors).toEqual([]);
});
