/**
 * The app loads under the `/openlamp/` base and builds the default shade,
 * with no console errors and no failed or non-2xx requests.
 */
import { expect, test } from '@playwright/test';
import { collectProblems, statsOf, statusOf } from './helpers.ts';

test('loads and builds the default shade without errors', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('./');

  await expect(page).toHaveTitle(/openlamp/);
  await expect(statusOf(page)).toHaveText(/Ready/, { timeout: 20_000 });
  await expect(statsOf(page)).toContainText('109,346 triangles');
  await expect(page.locator('canvas')).toBeVisible();
  expect(problems).toEqual([]);
});
