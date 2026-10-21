/**
 * The example gallery replaces the project and the new shade is built.
 */
import { expect, test } from '@playwright/test';
import { loadExample, openApp, statsOf } from './helpers.ts';

test('Examples → Faceted builds the faceted shade', async ({ page }) => {
  await openApp(page);
  await loadExample(page, 'Faceted');

  await expect(page.locator('#p-bottomDiameter')).toHaveValue('170');
  await expect(statsOf(page)).toContainText('89,250 triangles');
});
