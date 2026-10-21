/**
 * Editing parameters in the inspector: a number edit rebuilds, a select
 * hides the rows it makes irrelevant, ⌘Z / Ctrl+Z undoes an edit.
 */
import { expect, test } from '@playwright/test';
import { expectReady, openApp, statRow, statusOf, watchForBuilding } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('a number edit rebuilds the shade and changes its footprint', async ({ page }) => {
  const input = page.locator('#p-bottomDiameter');
  const footprint = statRow(page, 'Footprint');
  await expect(input).toHaveValue('160');
  const before = await footprint.textContent();

  const sawBuilding = await watchForBuilding(page);
  await input.fill('200');
  await input.press('Enter');
  await sawBuilding();
  await expectReady(page);

  await expect(footprint).not.toHaveText(before ?? '');
  await expect(footprint).toContainText('201.6 × 201.6 mm');
});

test('the smooth style hides the Ribs / facets row', async ({ page }) => {
  const ribs = page.locator('#p-patternCount');
  await expect(ribs).toBeVisible();
  await expect(page.getByText('Ribs / facets')).toBeVisible();

  await page.locator('#p-style').click();
  await page.getByRole('option', { name: 'Smooth' }).click();

  await expect(page.locator('#p-style')).toHaveText(/Smooth/);
  await expect(ribs).toHaveCount(0);
  await expect(page.getByText('Ribs / facets')).toHaveCount(0);
  await expectReady(page);
});

test('⌘Z / Ctrl+Z undoes a parameter edit', async ({ page }) => {
  const input = page.locator('#p-bottomDiameter');
  await input.fill('200');
  await input.press('Enter'); // commits and blurs, so the shortcut reaches the app
  await expect(input).toHaveValue('200');
  await expectReady(page);

  await page.keyboard.press('ControlOrMeta+z');

  await expect(input).toHaveValue('160');
  await expect(statusOf(page)).toHaveText(/^Ready/);
  await expect(statRow(page, 'Footprint')).toContainText('161.6 × 161.6 mm');
});
