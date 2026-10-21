/**
 * Switching the mount in its inspector: the pendant adds its canopy, the
 * wall arm its wall plate and arm, and switching back to the strap restores
 * the classic shade. One page; each test starts from the default lamp (at
 * draft quality, at normal where its triangle count is asserted).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  defaultProject,
  expectReady,
  partNames,
  selectNode,
  sharedPage,
  showProject,
  statsOf,
} from './helpers.ts';

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});

test.afterAll(async () => {
  await page.context().close();
});

async function startFrom(quality: 'draft' | 'normal'): Promise<void> {
  await showProject(page, defaultProject(quality));
  await selectNode(page, 'mount');
}

async function chooseMount(label: string): Promise<void> {
  await page.locator('#p-mount').click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(page.locator('#p-mount')).toHaveText(new RegExp(label));
  await expectReady(page);
}

test('Mount → Pendant on a cord builds the hub, the shade and the canopy', async () => {
  await startFrom('draft');
  await chooseMount('Pendant on a cord');

  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Canopy']);
  await expect(page.locator('#p-dropLength')).toHaveValue('600');
  await expect(page.getByTestId('tree-mount')).toContainText('Pendant on a cord');
  await expect(page.getByTestId('tree-part-canopy')).toBeVisible();
  await expect(statsOf(page).getByText(/^⚠/)).toHaveCount(0);
});

test('Mount → Wall arm builds the hub, the shade, the wall plate and the arm', async () => {
  await startFrom('draft');
  await chooseMount('Wall arm');

  await expect(partNames(page)).toHaveText(['Hub', 'Shade', 'Wall plate', 'Wall arm']);
  await expect(statsOf(page).getByText(/arrive in a later step/)).toHaveCount(0);
  await expect(page.locator('#status')).not.toHaveText(/Error/);
});

test('switching back to the velcro strap restores the single-piece shade', async () => {
  await startFrom('normal');
  await chooseMount('Pendant on a cord');
  await chooseMount('Velcro strap');

  await expect(statsOf(page)).toContainText('109,346 triangles');
  await expect(page.getByTestId('part-rows')).toHaveCount(0);
  await expect(page.locator('#p-strapWidth')).toHaveValue('25');
});
