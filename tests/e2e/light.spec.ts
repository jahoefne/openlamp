/**
 * Switching the light in the inspector: the pendant's hub takes an E27
 * lampholder or an LED strip ring and still builds; the velcro strap refuses
 * a bulb with an error.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectReady, loadExample, openApp, statsOf, statusOf } from './helpers.ts';

async function chooseLight(page: Page, label: string): Promise<void> {
  await page.locator('#p-light').click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(page.locator('#p-light')).toHaveText(new RegExp(label));
  await expectReady(page);
}

/** The names in the status panel's part table. */
const partNames = (page: Page) => page.getByTestId('part-rows').locator('tbody th');

test('Light → E27 bulb, then LED strip, on the pendant: the hub rebuilds around each', async ({
  page,
}) => {
  await openApp(page);
  await loadExample(page, 'Pendant on a cord');

  await chooseLight(page, 'E27 bulb');
  await expect(statusOf(page)).not.toHaveText(/Error/);
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);
  await expect(page.locator('#p-bulbHoleDiameter')).toHaveValue('40.5');
  await expect(statsOf(page)).toContainText('LED bulbs only');

  await chooseLight(page, 'LED strip');
  await expect(statusOf(page)).not.toHaveText(/Error/);
  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);
  await expect(page.locator('#p-stripRingDiameter')).toHaveValue('120');
});

test('the velcro strap with an E27 bulb shows the error', async ({ page }) => {
  await openApp(page);
  await chooseLight(page, 'E27 bulb');

  await expect(statsOf(page)).toContainText('The velcro strap holds LED pucks only');
  await expect(partNames(page)).toHaveText(['Hub', 'Shade']);
});
