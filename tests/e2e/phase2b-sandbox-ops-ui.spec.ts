import { expect, test, type Page } from '@playwright/test';

const realRuntime = process.env.OJPLATFORM_PHASE2B_REAL_RUNTIME === 'true';
const consoleErrors = new WeakMap<Page, string[]>();

test.describe('PHASE 2B Sandbox qualification journeys', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(({ page }, testInfo) => {
    testInfo.skip(
      !realRuntime,
      'READY_FOR_LEAD: requires the Lead-composed Sandbox API, Authz, trusted probe, and runtime fixtures. The Web worker does not fabricate Sandbox state.',
    );
    const errors: string[] = [];
    consoleErrors.set(page, errors);
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
  });
  test.afterEach(({ page }) => {
    expect(consoleErrors.get(page) ?? []).toEqual([]);
  });

  async function loginOperator(page: Page) {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill('phase2b-operator');
    await page.getByLabel('Password').fill('Phase2BOperatorPass123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/problems$/);
    consoleErrors.set(page, []);
  }

  test('J2B-1 operator qualification overview', async ({ page }) => {
    await loginOperator(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/operations/sandbox');
    await expect(
      page.getByRole('heading', { name: 'Sandbox qualification' }),
    ).toBeVisible();
    await expect(
      page.getByText(/Backend|Policy version|Probe suite/).first(),
    ).toBeVisible();
    await expect(page.locator('main.page-shell')).toHaveCSS(
      'overflow-x',
      'visible',
    );
  });

  test('J2B-2 trusted probe journey', async ({ page }) => {
    await loginOperator(page);
    await page.goto('/operations/sandbox');
    await expect(
      page.getByText(/SECURITY QUALIFICATION|qualification/i).first(),
    ).toBeVisible();
    const start = page.getByRole('button', {
      name: 'Start trusted qualification probe',
    });
    await expect(start).toBeVisible();
    await start.click();
    await expect(page.getByText(/Qualification probe running/i)).toBeVisible();
    await expect(page.getByText(/Sandbox security qualified/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test('J2B-3 failure and degraded journey', async ({ page }) => {
    await loginOperator(page);
    await page.goto('/operations/sandbox');
    const inject = page.getByRole('button', {
      name: 'Run cleanup failure fixture',
    });
    await expect(inject).toBeVisible();
    await inject.click();
    await expect(page.getByText(/Cleanup verification failed/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.locator('.sandbox-overview [role="status"]'),
    ).toBeVisible();
    await expect(
      page.getByText(/not a user-code execution|disabled/i).first(),
    ).toBeVisible();
  });

  test('J2B-4 cleanup failure journey', async ({ page }) => {
    await loginOperator(page);
    await page.goto('/operations/sandbox');
    await expect(page.getByText(/Cleanup verification failed/i)).toBeVisible();
    await expect(page.getByText(/Sandbox security qualified/i)).toHaveCount(0);
    await page.getByRole('button', { name: 'Verify Sandbox cleanup' }).click();
    await expect(page.getByText(/Cleanup verification failed/i)).toBeVisible();
    await page
      .getByRole('button', { name: 'Recover qualification cleanup' })
      .click();
    await expect(
      page.getByText(/Sandbox qualification pending/i),
    ).toBeVisible();
  });

  test('J2B-5 authorization boundary', async ({ page }) => {
    const suffix = Date.now().toString();
    const username = `phase2b-user-${suffix}`;
    await page.goto('/register');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Email').fill(`${username}@example.test`);
    await page.getByLabel('Display name').fill('Phase 2B User');
    await page.getByLabel('Password').fill('Phase2BUserPass123!');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.getByLabel('Email or username').fill(username);
    await page.getByLabel('Password').fill('Phase2BUserPass123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    consoleErrors.set(page, []);
    await page.goto('/operations/sandbox');
    await expect(
      page.getByText(/not available|Access not available/i).first(),
    ).toBeVisible();
  });

  test('J2B-6 cancellation journey', async ({ page }) => {
    await loginOperator(page);
    await page.goto('/operations/sandbox');
    await page
      .getByRole('button', { name: 'Start cancellation probe' })
      .click();
    await expect(page.getByText(/Qualification probe running/i)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Qualification probe running/i)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel trusted probe' }).click();
    await expect(
      page.getByRole('status', { name: 'Last trusted probe result' }),
    ).toHaveText(/Passed/, { timeout: 20_000 });
    await expect(page.getByText(/Cleanup verification failed/i)).toHaveCount(0);
  });
});
