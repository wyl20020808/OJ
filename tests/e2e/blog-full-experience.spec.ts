import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1488, height: 900 },
  { name: 'tablet', width: 900, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];

for (const viewport of viewports) {
  test(`Blog feed remains stable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/discussion');

    const feed = page.locator('.blog-feed');
    await expect(feed).toBeVisible();

    const cards = feed.locator('.blog-post-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(4);

    const documentOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(documentOverflow).toBeLessThanOrEqual(1);

    const layoutFailures = await cards.evaluateAll((items) =>
      items.flatMap((item, cardIndex) => {
        const card = item.getBoundingClientRect();
        const footer = item.querySelector('footer');
        if (!footer) return [`card ${cardIndex}: missing footer`];

        const footerRect = footer.getBoundingClientRect();
        const children = Array.from(footer.children).map((child) => ({
          name: child.textContent?.trim() ?? child.tagName,
          rect: child.getBoundingClientRect(),
        }));
        const failures: string[] = [];

        if (footerRect.bottom > card.bottom + 1) {
          failures.push(`card ${cardIndex}: footer overflows card`);
        }

        for (let left = 0; left < children.length; left += 1) {
          const a = children[left];
          if (!a) continue;
          for (let right = left + 1; right < children.length; right += 1) {
            const b = children[right];
            if (!b) continue;
            const horizontalOverlap =
              Math.min(a.rect.right, b.rect.right) -
              Math.max(a.rect.left, b.rect.left);
            const verticalOverlap =
              Math.min(a.rect.bottom, b.rect.bottom) -
              Math.max(a.rect.top, b.rect.top);
            if (horizontalOverlap > 1 && verticalOverlap > 1) {
              failures.push(
                `card ${cardIndex}: footer items overlap (${a.name}/${b.name})`,
              );
            }
          }
        }

        return failures;
      }),
    );
    expect(layoutFailures).toEqual([]);

    const covers = cards.locator('img.blog-post-thumb');
    if ((await covers.count()) > 0) {
      await expect
        .poll(async () =>
          covers.evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.naturalWidth > 0,
            ),
          ),
        )
        .toBe(true);
    }

    const loadMore = page.getByRole('button', { name: '加载更多文章' });
    if (await loadMore.isVisible()) {
      const before = await cards.count();
      await loadMore.click();
      await expect.poll(() => cards.count()).toBeGreaterThan(before);
    }
  });
}

test('Blog article detail renders real content and comments', async ({
  page,
}) => {
  await page.goto('/discussion');
  const articleLink = page.locator('.blog-post-card h2 a').first();
  await expect(articleLink).toBeVisible();
  await articleLink.click();

  await expect(page.locator('.discussion-detail')).toBeVisible();
  await expect(page.locator('.blog-detail-content')).toContainText('核心思路');
  await expect(page.locator('#blog-detail-comments')).toBeVisible();
  const documentOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(documentOverflow).toBeLessThanOrEqual(1);
});
