/**
 * Switching the light in its inspector: the pendant's hub takes an E27
 * lampholder or an LED strip ring and still builds; the velcro strap refuses
 * a bulb with an error. The light-on view (View options, "L") with its simple
 * preview renders without console errors. One page, draft previews.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  collectProblems,
  defaultProject,
  exampleProject,
  expectReady,
  partNames,
  selectNode,
  sharedPage,
  showProject,
  statsOf,
  statusOf,
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

async function chooseLight(label: string): Promise<void> {
  await page.locator('#p-light').click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(page.locator('#p-light')).toHaveText(new RegExp(label));
  await expectReady(page);
}

test('Light → E27 bulb, then LED strip, on the pendant: the hub rebuilds around each', async () => {
  await showProject(page, exampleProject('pendant-cord'));
  await selectNode(page, 'light');

  await chooseLight('E27 bulb');
  await expect(statusOf(page)).not.toHaveText(/Error/);
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);
  await expect(page.locator('#p-bulbHoleDiameter')).toHaveValue('40.5');
  await expect(statsOf(page)).toContainText('LED bulbs only');
  await expect(page.getByTestId('tree-light')).toContainText('E27 bulb');

  await chooseLight('LED strip');
  await expect(statusOf(page)).not.toHaveText(/Error/);
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);
  await expect(page.locator('#p-stripRingDiameter')).toHaveValue('120');
});

test('the velcro strap with an E27 bulb shows the error', async () => {
  await showProject(page, defaultProject('draft'));
  await selectNode(page, 'light');
  await chooseLight('E27 bulb');

  await expect(statsOf(page)).toContainText('The velcro strap holds LED pucks only');
  await expect(partNames(page)).toHaveText(['Hub', 'Shade']);
});

/** Let the demand-driven canvas draw: two animation frames. */
const nextFrames = () =>
  page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))');

test('Light on lights the two-tone bell; the simple preview and "L" toggle it, no console errors', async () => {
  const start = problems.length;
  await showProject(page, exampleProject('two-tone-bell'));
  await selectNode(page, 'project');
  const light = page.locator('#v-light');
  const simple = page.locator('#v-simple-light');
  await expect(light).toHaveAttribute('aria-checked', 'false');
  await expect(simple).toHaveCount(0);

  await light.click();
  await expect(light).toHaveAttribute('aria-checked', 'true');
  await expect(simple).toBeVisible();
  await nextFrames();
  await expectReady(page);

  // The simple preview (on by default with ≤ 4 cores) switches the shades' materials both ways.
  const was = await simple.getAttribute('aria-checked');
  const other = was === 'true' ? 'false' : 'true';
  await simple.click();
  await expect(simple).toHaveAttribute('aria-checked', other);
  await nextFrames();
  await simple.click();
  await expect(simple).toHaveAttribute('aria-checked', was ?? 'false');
  await nextFrames();
  await expectReady(page);

  // "L" turns it off again (with the focus off the switch).
  await page.locator('#inspector h2').click();
  await page.keyboard.press('l');
  await expect(light).toHaveAttribute('aria-checked', 'false');
  await expect(simple).toHaveCount(0);
  await nextFrames();
  await expect(statusOf(page)).toHaveText(/^Ready/);
  expect(problems.slice(start)).toEqual([]);
});
