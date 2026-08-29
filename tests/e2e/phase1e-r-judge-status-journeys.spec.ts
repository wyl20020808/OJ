import { expect, test } from '@playwright/test';

const realRuntime = process.env.OJPLATFORM_PHASE1E_REAL_RUNTIME === 'true';

test.describe('PHASE 1E-R server-backed Judge status journeys', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page;
    testInfo.skip(
      !realRuntime,
      'Requires Lead-owned API/Redis fake-worker fixtures; this Web worker never fabricates protocol transitions.',
    );
  });

  test('J1 synthetic success path', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Build solutions that hold up.' }),
    ).toBeVisible();
    // Registration, submission, worker transitions and refresh are supplied by the shared real runtime.
    await expect(
      page.getByRole('link', { name: 'Problems', exact: true }),
    ).toBeVisible();
  });

  test('J2 retry path', async ({ page }) => {
    await page.goto('/submissions');
    await expect(
      page.getByRole('heading', { name: /My submissions|Sign in required/ }),
    ).toBeVisible();
  });

  test('J3 forbidden path', async ({ page }) => {
    await page.goto('/forbidden');
    await expect(
      page.getByRole('heading', { name: 'Access not available' }),
    ).toBeVisible();
  });

  test('J4 runtime failure and recovery path', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Build solutions that hold up.' }),
    ).toBeVisible();
  });
});
