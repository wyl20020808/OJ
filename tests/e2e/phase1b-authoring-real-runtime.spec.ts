import { expect, test } from '@playwright/test';

test('real authoring workflow, revision history, and forbidden access', async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const username = `author_${suffix}`;
  const email = `${username}@example.test`;
  const password = 'phase1b-password';
  const slug = `phase1b-${suffix}`;
  const title = `Phase 1B ${suffix}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/register');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Display name').fill('Phase 1B Author');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByLabel('Email or username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/problems$/);
  await page.getByRole('link', { name: 'Authoring' }).click();
  await page
    .getByRole('link', { name: /Create a draft|New problem/ })
    .first()
    .click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Slug').fill(slug);
  await page.getByLabel('Statement').fill('Original published statement.');
  await page.getByLabel('Input description').fill('Input.');
  await page.getByLabel('Output description').fill('Output.');
  await page.getByLabel('Constraints').fill('n > 0');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByLabel('Public visibility').check();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Problem published.')).toBeVisible();

  const revisions = await page.evaluate(async (key) => {
    const response = await fetch(`/api/problems/${key}/revisions`, {
      credentials: 'include',
    });
    return { status: response.status, body: await response.json() };
  }, slug);
  expect(revisions.status).toBe(200);
  expect(revisions.body).toHaveLength(1);
  expect(revisions.body[0].status).toBe('draft');

  await page.getByLabel('Statement').fill('Edited draft statement.');
  const revisionSave = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/problems/${slug}`) &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save draft' }).click();
  expect((await revisionSave).status()).toBe(200);
  const history = await page.evaluate(async (key) => {
    const response = await fetch(`/api/problems/${key}/revisions`, {
      credentials: 'include',
    });
    return await response.json();
  }, slug);
  expect(history).toHaveLength(2);
  expect(history[0].statement).toBe('Original published statement.');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email or username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.goto(`/problems/${slug}`);
  await expect(page.getByText('Original published statement.')).toBeVisible();

  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.goto(`/author/problems/${slug}/edit`);
  await expect(
    page.getByRole('heading', { name: 'Sign in required' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
