import { expect, test } from '@playwright/test';

const realRuntime = process.env.OJPLATFORM_PHASE2B_REAL_RUNTIME === 'true';

test.describe('PHASE 2B Sandbox qualification journeys', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page;
    testInfo.skip(
      !realRuntime,
      'READY_FOR_LEAD: requires the Lead-composed Sandbox API, Authz, trusted probe, and runtime fixtures. The Web worker does not fabricate Sandbox state.',
    );
  });

  test('J2B-1 operator qualification overview', async ({ page }) => {
    await page.goto('/operations/sandbox');
    await expect(
      page.getByRole('heading', { name: 'Sandbox qualification' }),
    ).toBeVisible();
    await expect(
      page.getByText(/Backend|Policy version|Probe suite/).first(),
    ).toBeVisible();
  });

  test('J2B-2 trusted probe journey', async ({ page }) => {
    await page.goto('/operations/sandbox');
    await expect(
      page.getByText(/SECURITY QUALIFICATION|qualification/i).first(),
    ).toBeVisible();
    // Lead runtime must provide the approved probe list and authoritative result transitions.
  });

  test('J2B-3 failure and degraded journey', async ({ page }) => {
    await page.goto('/operations/sandbox');
    await expect(page.getByRole('status')).toBeVisible();
    await expect(
      page.getByText(/not a user-code execution|disabled/i).first(),
    ).toBeVisible();
  });

  test('J2B-4 cleanup failure journey', async ({ page }) => {
    await page.goto('/operations/sandbox');
    // Lead fixture must provide CLEANUP_FAILED; the UI must show security significance and no qualified badge.
    await expect(page.getByRole('status')).toBeVisible();
  });

  test('J2B-5 authorization boundary', async ({ page }) => {
    await page.goto('/operations/sandbox');
    await expect(
      page.getByText(/not available|Access not available/i).first(),
    ).toBeVisible();
  });

  test('J2B-6 cancellation journey', async ({ page }) => {
    await page.goto('/operations/sandbox');
    // Cancellation remains omitted until the frozen public API/Authz contract is composed.
    await expect(
      page.getByRole('heading', { name: 'Sandbox qualification' }),
    ).toBeVisible();
  });
});
