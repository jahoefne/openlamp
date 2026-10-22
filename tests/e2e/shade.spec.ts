/**
 * The inner shade: the lamp tree's "Add inner shade" builds it as a part of
 * its own (hanging from the hub's second collar ring) and shows its
 * inspector, "Remove inner shade" takes it away; the two-tone example has one.
 * The style families: the outer shade's Style family select builds a slatted
 * shade, and a tiered one with its tiers and spacers.
 * One page, draft previews.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  collectProblems,
  exampleProject,
  expectReady,
  inspectorOf,
  partNames,
  selectNode,
  sharedPage,
  showProject,
  shownTriangles,
  statsOf,
  statusOf,
  treeNode,
  watchForBuilding,
} from './helpers.ts';

test.describe.configure({ mode: 'serial' });

let page: Page;
let problems: string[];

test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
  problems = collectProblems(page);
});

test.afterAll(async () => {
  await page.context().close();
});

test('Pendant → Add inner shade builds it; Remove inner shade takes it away', async () => {
  await showProject(page, exampleProject('pendant-cord'));
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);

  let sawBuilding = await watchForBuilding(page);
  await page.getByRole('button', { name: 'Add inner shade', exact: true }).click();
  await sawBuilding();
  await expectReady(page);
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Inner shade', 'Canopy']);
  await expect(treeNode(page, 'innerShade')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#p-inner-bottomDiameter')).toHaveValue('132');
  await expect(statusOf(page)).not.toHaveText(/Error/);
  await expect(page.locator('#stats').getByText(/^⚠/)).toHaveCount(0);

  sawBuilding = await watchForBuilding(page);
  await page.getByRole('button', { name: 'Remove inner shade', exact: true }).click();
  await sawBuilding();
  await expectReady(page);
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);
  await expect(page.locator('#p-inner-bottomDiameter')).toHaveCount(0);
  await expect(inspectorOf(page, 'outerShade')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add inner shade', exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});

test('the two-tone bell has an inner shade node with its own inspector', async () => {
  await showProject(page, exampleProject('two-tone-bell'));
  await expect(partNames(page)).toContainText(['Inner shade']);
  await selectNode(page, 'innerShade');
  await expect(page.getByRole('button', { name: 'Remove inner shade', exact: true })).toBeVisible();
  await expect(page.locator('#p-inner-bottomDiameter')).toBeVisible();
  await expect(page.locator('#p-bottomDiameter')).toHaveCount(0);
  expect(problems).toEqual([]);
});

async function chooseFamily(label: string): Promise<void> {
  await page.locator('#p-shadeFamily').click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(page.locator('#p-shadeFamily')).toHaveText(new RegExp(label));
}

test('Outer shade → Style family Slatted builds slats; Tiered builds tiers and spacers', async () => {
  await showProject(page, exampleProject('pendant-cord'));
  await selectNode(page, 'outerShade');
  await expect(page.locator('#p-shadeFamily')).toHaveText(/Revolved/);
  await expect(treeNode(page, 'outerShade')).toContainText('Revolved');
  const before = await shownTriangles(page);

  let sawBuilding = await watchForBuilding(page);
  await chooseFamily('Slatted');
  await sawBuilding();
  await expectReady(page);
  await expect(statusOf(page)).not.toHaveText(/Error/);
  await expect(statsOf(page).getByText(/^⚠/)).toHaveCount(0);
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);
  await expect(treeNode(page, 'outerShade')).toContainText('Slatted');
  await expect(page.locator('#p-slatCount')).toHaveValue('24');
  await expect(page.locator('#p-bottomDiameter')).toHaveValue('150');
  await expect(page.locator('#p-patternCount')).toHaveCount(0);
  expect(await shownTriangles(page)).not.toBe(before);

  sawBuilding = await watchForBuilding(page);
  await chooseFamily('Tiered');
  await sawBuilding();
  await expectReady(page);
  await expect(statusOf(page)).not.toHaveText(/Error/);
  await expect(partNames(page)).toHaveText([
    'Hub',
    'Tier 1',
    'Tier 2',
    'Tier 3',
    'Tier 4',
    'Spacer 1 ×3',
    'Spacer 2 ×3',
    'Spacer 3 ×3',
    'Canopy',
  ]);
  // The spacers of a gap are one part printed three times, one row in the tree too.
  await expect(page.getByTestId('tree-part-shade-spacer1')).toContainText('Spacer 1 ×3');
  await expect(statsOf(page)).not.toContainText("this family's parts arrive in the next step");
  await expect(page.locator('#p-tiers')).toHaveValue('4');
  await expect(treeNode(page, 'outerShade')).toContainText('Tiered');
  expect(problems).toEqual([]);
});
