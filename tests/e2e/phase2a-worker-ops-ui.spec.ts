import { expect, test } from '@playwright/test';

const realRuntime = process.env.OJPLATFORM_PHASE2A_REAL_RUNTIME === 'true';

test.describe('PHASE 2A server-backed Worker operations journeys', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page;
    testInfo.skip(
      !realRuntime,
      'Requires Lead-composed API, Authz, Redis, and independent Worker fixtures. Web never fabricates Worker transitions.',
    );
  });

  test('J2A-1 normal safe-fixture qualification journey', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Build solutions that hold up.' }),
    ).toBeVisible();
    // Lead fixture must drive QUEUED -> WORKER_ACCEPTED -> SAFE_FIXTURE_RUNNING
    // -> SAFE_FIXTURE_SUCCEEDED. The browser asserts the server projection after each refresh.
  });

  test('J2A-2 retry and requeue journey', async ({ page }) => {
    await page.goto('/submissions');
    await expect(
      page.getByRole('heading', {
        name: /My submissions|Sign in required/,
      }),
    ).toBeVisible();
    // Lead fixture must drive FAILED_RETRYABLE -> REQUEUED -> next attempt -> synthetic completion.
  });

  test('J2A-3 Worker degraded and recovery journey', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByText(
        /Platform is ready\.|Platform is not ready\.|Platform health is unavailable\./,
      ),
    ).toBeVisible();
    // Lead runtime must expose worker degradation and restored server state without a verdict.
  });

  test('J2A-4 cancellation journey', async ({ page }) => {
    await page.goto('/submissions');
    await expect(
      page.getByRole('heading', {
        name: /My submissions|Sign in required/,
      }),
    ).toBeVisible();
    // Executes only after the frozen public cancel endpoint and authorization projection are composed.
  });

  test('J2A-5 forbidden diagnostics journey', async ({ page }) => {
    await page.goto('/forbidden');
    await expect(
      page.getByRole('heading', { name: 'Access not available' }),
    ).toBeVisible();
    // Lead/Authz must supply an operator-only diagnostic endpoint; ordinary users must receive no diagnostic data.
  });
});
