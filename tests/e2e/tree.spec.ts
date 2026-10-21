/**
 * The lamp tree and the views: picking a node shows only its inspector,
 * clicking a part (in the viewport or the status table) selects its node and
 * empty space goes back to the project, the exploded view moves parts without
 * rebuilding, the bed view lays every part out, fit-test mode prints the
 * joint's test pair. One page for the file, draft previews.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  collectProblems,
  defaultProject,
  exampleProject,
  expectReady,
  inspectorOf,
  partNames,
  selectNode,
  sharedPage,
  showProject,
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
  expect(problems).toEqual([]);
  await page.context().close();
});

test('clicking the shade in the viewport selects it; empty space goes back to the project', async () => {
  // The default lamp fills the middle of the view, from the first frame on.
  await showProject(page, defaultProject('draft'));
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;

  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(treeNode(page, 'outerShade')).toHaveAttribute('aria-current', 'true');
  await expect(inspectorOf(page, 'outerShade')).toBeVisible();
  await expect(page.locator('#p-bottomDiameter')).toBeVisible();

  await canvas.click({ position: { x: 8, y: 8 } });
  await expect(treeNode(page, 'project')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#p-bottomDiameter')).toHaveCount(0);
});

test('the table lamp lists its nodes and its parts with their bed fit', async () => {
  await showProject(page, exampleProject('table-lamp'));

  for (const node of ['project', 'printer', 'mount', 'light', 'outerShade', 'hub']) {
    await expect(treeNode(page, node)).toBeVisible();
  }
  await expect(treeNode(page, 'mount')).toContainText('Standing lamp');
  await expect(treeNode(page, 'light')).toContainText('USB puck');
  await expect(treeNode(page, 'add-inner')).toHaveText('Add inner shade');
  for (const [id, name] of [
    ['stem', 'Stem segment'],
    ['stemFoot', 'Stem foot'],
    ['base', 'Base'],
    ['baseLid', 'Base lid'],
  ] as const) {
    await expect(page.getByTestId(`tree-part-${id}`)).toContainText(name);
    await expect(page.getByTestId(`tree-fit-${id}`)).toContainText('fits the bed');
  }
});

test('selecting Hub & joints shows only its inspector', async () => {
  await selectNode(page, 'hub');

  await expect(page.locator('#inspector h2')).toHaveText('Hub & joints');
  await expect(page.locator('#p-shadeToHub')).toBeVisible();
  await expect(page.locator('#p-jointTolerance')).toBeVisible();
  for (const other of ['#p-bottomDiameter', '#p-mount', '#p-light', '#p-quality']) {
    await expect(page.locator(other)).toHaveCount(0);
  }
  // The hub is the picked part: its row in the status table is selected.
  await expect(page.locator('[data-part="hub"]')).toHaveAttribute('aria-selected', 'true');
});

test('picking the base in the status table selects the Mount node', async () => {
  await page.locator('[data-part="base"]').click();

  await expect(treeNode(page, 'mount')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('tree-part-base')).toHaveAttribute('aria-current', 'true');
  await expect(inspectorOf(page, 'mount')).toBeVisible();
  await expect(page.locator('#p-stemSegmentLength')).toBeVisible();
});

test('the explode slider moves the parts apart without a rebuild', async () => {
  await selectNode(page, 'project');
  const slider = page.getByRole('slider', { name: 'Explode' });
  const sawBuilding = await watchForBuilding(page);

  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(page.locator('#inspector output')).toHaveText('100 %');
  await page.waitForTimeout(300); // longer than the build debounce
  expect(await sawBuilding.seen()).toBe(false);
  await expect(page.locator('#status')).toHaveText(/^Ready/);

  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
});

test('the bed view lays the parts out; B goes back to the lamp', async () => {
  const rows = page.getByTestId('part-rows').locator('tbody tr');
  await expect(rows).toHaveCount(6);
  const bed = page.locator('#v-bed');
  await expect(bed).toHaveAttribute('aria-checked', 'false');

  await bed.click();
  await expect(bed).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('slider', { name: 'Explode' })).toHaveAttribute('data-disabled', '');
  await expectReady(page);
  await expect(rows).toHaveCount(6);

  await page.locator('#inspector h2').click(); // move the focus off the switch
  await page.keyboard.press('b');
  await expect(bed).toHaveAttribute('aria-checked', 'false');
  await expectReady(page);
  await expect(rows).toHaveCount(6);
});

test('fit test only prints the joint test pair of the pendant', async () => {
  await showProject(page, exampleProject('pendant-cord'));
  await selectNode(page, 'project');
  const toggle = page.locator('#p-fitTest');
  await expect(page.getByText('Fit test only (joint test pair)')).toBeVisible();

  await toggle.click();
  await expectReady(page);
  await expect(partNames(page)).toHaveText(['Collar test piece', 'Ring test piece']);
  await expect(page.getByTestId('tree-part-fitMale')).toContainText('Collar test piece');
  await expect(page.getByTestId('tree-part-fitFemale')).toContainText('Ring test piece');

  // A test piece belongs to Hub & joints, where its clearance is set.
  await page.getByTestId('tree-part-fitFemale').click();
  await expect(inspectorOf(page, 'hub')).toBeVisible();

  await selectNode(page, 'project');
  await page.locator('#p-fitTest').click();
  await expectReady(page);
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);
});
