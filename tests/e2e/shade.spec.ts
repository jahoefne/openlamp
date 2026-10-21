/**
 * The inner shade: adding one to the pendant builds it as a part of its own
 * (hanging from the hub's second collar ring), removing it takes it away.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  collectProblems,
  expectReady,
  loadExample,
  openApp,
  statusOf,
  watchForBuilding,
} from './helpers.ts';

/** The names in the status panel's part table. */
const partNames = (page: Page) => page.getByTestId('part-rows').locator('tbody th');

test('Pendant → Add inner shade builds it; Remove inner shade takes it away', async ({ page }) => {
  const problems = collectProblems(page);
  await openApp(page);
  await loadExample(page, 'Pendant on a cord');
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);

  let sawBuilding = await watchForBuilding(page);
  await page.getByRole('button', { name: 'Add inner shade', exact: true }).click();
  await sawBuilding();
  await expectReady(page);
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Inner shade', 'Canopy']);
  await expect(page.locator('#p-inner-bottomDiameter')).toHaveValue('132');
  await expect(statusOf(page)).not.toHaveText(/Error/);
  await expect(page.locator('#stats').getByText(/^⚠/)).toHaveCount(0);

  sawBuilding = await watchForBuilding(page);
  await page.getByRole('button', { name: 'Remove inner shade', exact: true }).click();
  await sawBuilding();
  await expectReady(page);
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);
  await expect(page.locator('#p-inner-bottomDiameter')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add inner shade', exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});
