/**
 * The printer drives the bed-fit badge: the 240 mm "Wide & shallow" shade
 * fits the A1 (256 mm bed) but not the A1 mini (180 mm).
 */
import { expect, test } from '@playwright/test';
import { choosePrinter, loadExample, openApp } from './helpers.ts';

test('the bed-fit badge follows the printer', async ({ page }) => {
  await openApp(page);
  await loadExample(page, 'Wide & shallow');
  const badge = page.getByTestId('bed-fit');
  await expect(badge).toContainText('Fits');

  await choosePrinter(page, 'A1 mini');
  await expect(badge).toContainText('Exceeds');
  await expect(badge).toContainText('A1 mini');

  await choosePrinter(page, 'A1');
  await expect(badge).toContainText('Fits');
  await expect(badge).not.toContainText('mini');
});
