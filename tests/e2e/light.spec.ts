/**
 * Switching the light in its inspector: the pendant's hub takes an E27
 * lampholder or an LED strip ring and still builds; the velcro strap refuses
 * a bulb with an error. One page, draft previews.
 */
import { expect, test, type Page } from '@playwright/test';
import {
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

test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
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
