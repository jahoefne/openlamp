/**
 * Switching the mount in the inspector: the pendant adds its canopy, the
 * wall arm (parts pending until M2.2b) builds the hub and the shade with an
 * info, and switching back to the strap restores the classic shade.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectReady, openApp, statsOf } from './helpers.ts';

async function chooseMount(page: Page, label: string): Promise<void> {
  await page.locator('#p-mount').click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(page.locator('#p-mount')).toHaveText(new RegExp(label));
  await expectReady(page);
}

/** The names in the status panel's part table. */
const partNames = (page: Page) => page.getByTestId('part-rows').locator('tbody th');

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('Mount → Pendant on a cord builds the hub, the shade and the canopy', async ({ page }) => {
  await chooseMount(page, 'Pendant on a cord');

  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);
  await expect(page.locator('#p-dropLength')).toHaveValue('600');
  await expect(statsOf(page).getByText(/^⚠/)).toHaveCount(0);
});

test('Mount → Wall arm builds without errors and says its parts are pending', async ({ page }) => {
  await chooseMount(page, 'Wall arm');

  await expect(partNames(page)).toHaveText(['Hub', 'Shade']);
  await expect(statsOf(page).getByText(/arrive in a later step/)).toBeVisible();
  await expect(page.locator('#status')).not.toHaveText(/Error/);
});

test('switching back to the velcro strap restores the single-piece shade', async ({ page }) => {
  await chooseMount(page, 'Pendant on a cord');
  await chooseMount(page, 'Velcro strap');

  await expect(statsOf(page)).toContainText('109,346 triangles');
  await expect(page.getByTestId('part-rows')).toHaveCount(0);
  await expect(page.locator('#p-strapWidth')).toHaveValue('25');
});
