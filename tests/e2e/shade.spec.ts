/**
 * The inner shade: the lamp tree's "Add inner shade" builds it as a part of
 * its own (hanging from the hub's second collar ring) and shows its
 * inspector, "Remove inner shade" takes it away; the two-tone example has one.
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
