import { expect, test } from '@playwright/test';

test('healthy platform shell and controlled not-found route', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Build solutions that hold up.' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Platform is ready\.|Platform is not ready\.|Platform health is unavailable\./,
    ),
  ).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
  await page.goto('/missing');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});
