import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1484, height: 1060 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

for (const viewport of viewports) {
  test(`Blog comment thread remains compact on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      '/discussion/blog-demo-growth-roadmap#blog-detail-comments',
    );

    const card = page.locator('#blog-detail-comments');
    const list = card.locator('.discussion-comment-list');
    await expect(card).toBeVisible();
    await expect(list).toBeVisible();
    await expect(
      card.getByRole('heading', { name: /^评论 \d+$/ }),
    ).toBeVisible();

    const beforeSort = await card.boundingBox();
    await card.getByRole('button', { name: '按时间' }).click();
    await expect(card.getByRole('button', { name: '按时间' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const afterSort = await card.boundingBox();
    expect(afterSort?.width).toBe(beforeSort?.width);

    const metrics = await page.evaluate(() => {
      const commentList = document.querySelector('.discussion-comment-list');
      const reply = document.querySelector('.discussion-comment-reply');
      if (!commentList || !reply) return null;
      const replyRect = reply.getBoundingClientRect();
      return {
        documentOverflow:
          document.documentElement.scrollWidth - window.innerWidth,
        listOverflowY: getComputedStyle(commentList).overflowY,
        listScrollHeight: commentList.scrollHeight,
        listClientHeight: commentList.clientHeight,
        replyLeft: replyRect.left,
        replyRight: replyRect.right,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics!.documentOverflow).toBeLessThanOrEqual(1);
    expect(metrics!.listOverflowY).not.toMatch(/auto|scroll/);
    expect(metrics!.listScrollHeight).toBeLessThanOrEqual(
      metrics!.listClientHeight + 1,
    );
    expect(metrics!.replyLeft).toBeGreaterThanOrEqual(0);
    expect(metrics!.replyRight).toBeLessThanOrEqual(viewport.width + 1);

    const composer = card.locator('.discussion-comment-composer');
    if (await composer.count()) {
      await expect(composer.getByPlaceholder('说点什么吧...')).toBeVisible();
      await expect(
        composer.getByRole('button', { name: '发表评论' }),
      ).toBeVisible();
    } else {
      await expect(card.getByText('登录后参与评论。')).toBeVisible();
    }
  });
}
