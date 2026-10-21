/**
 * Export → Download STL writes a well-formed binary STL: an 80-byte header,
 * the triangle count n (little-endian uint32 at offset 80) and n 50-byte
 * records.
 */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openApp, shownTriangles } from './helpers.ts';

test('Export → Download STL downloads a binary STL of the shade', async ({ page }) => {
  await openApp(page);

  await page.getByRole('button', { name: /^Export/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download STL/ }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^openlamp-.*\.stl$/);
  const stl = await readFile(await download.path());
  expect(stl.length).toBeGreaterThan(84);
  const n = stl.readUInt32LE(80);
  expect(n).toBeGreaterThan(0);
  expect(stl.length).toBe(84 + 50 * n);
  // Preview and export quality are both "normal" by default: same mesh.
  expect(n).toBe(await shownTriangles(page));
});
