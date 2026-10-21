/**
 * The table-lamp example: the stem is printed as a foot plus copies of one
 * segment part, and a shorter segment length prints more copies of it.
 */
import { expect, test } from '@playwright/test';
import {
  collectProblems,
  exampleProject,
  expectReady,
  partNames,
  selectNode,
  showProject,
  statusOf,
  watchForBuilding,
} from './helpers.ts';

test('Table lamp builds its stem; 150 mm segments print the segment twice', async ({ page }) => {
  const problems = collectProblems(page);
  await showProject(page, exampleProject('table-lamp'));

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
  await selectNode(page, 'mount');
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
  await expect(page.getByTestId('tree-part-stem')).toContainText('Stem segment ×2');
  await expect(statusOf(page)).toHaveText(/^Ready/);
  expect(problems).toEqual([]);
});
