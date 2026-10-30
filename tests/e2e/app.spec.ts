/**
 * The app loads under the `/openlamp/` base and builds the default shade,
 * with no console errors and no failed or non-2xx requests, the project node
 * of the lamp tree available, with shade editing selected.
 */
import { expect, test } from '@playwright/test';
import { collectProblems, inspectorOf, statsOf, statusOf, treeNode } from './helpers.ts';

test('loads and builds the default shade without errors', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('./');

  await expect(page).toHaveTitle(/øpenlåmp/);
  await expect(statusOf(page)).toHaveText(/Ready/, { timeout: 20_000 });
  await expect(statsOf(page)).toContainText('109,346 triangles');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(treeNode(page, 'outerShade')).toHaveAttribute('aria-current', 'true');
  await expect(inspectorOf(page, 'outerShade')).toBeVisible();
  expect(problems).toEqual([]);
});
