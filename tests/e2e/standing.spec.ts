/**
 * The table-lamp example: the stem is printed as a foot plus copies of one
 * segment part, and a shorter segment length prints more copies of it.
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

test('Examples → Table lamp builds its stem; 150 mm segments print the segment twice', async ({
  page,
}) => {
  const problems = collectProblems(page);
  await openApp(page);
  await loadExample(page, 'Table lamp');

  await expect(partNames(page)).toHaveText([
    'Hub',
    'Shade',
    'Stem segment',
    'Stem foot',
    'Base',
    'Base lid',
  ]);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(statusOf(page)).not.toHaveText(/Error/);

  // 400 mm of stem in segments of at most 150 mm: the foot and two copies of the segment.
  const input = page.locator('#p-stemSegmentLength');
  await expect(input).toHaveValue('200');
  const sawBuilding = await watchForBuilding(page);
  await input.fill('150');
  await input.press('Enter');
  await sawBuilding();
  await expectReady(page);

  await expect(partNames(page)).toHaveText([
    'Hub',
    'Shade',
    'Stem segment ×2',
    'Stem foot',
    'Base',
    'Base lid',
  ]);
  await expect(statusOf(page)).toHaveText(/^Ready/);
  expect(problems).toEqual([]);
});
