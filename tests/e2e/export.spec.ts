/**
 * Exports. Download STL writes a well-formed binary STL: an 80-byte header,
 * the triangle count n (little-endian uint32 at offset 80) and n 50-byte
 * records. The ZIP holds one such STL per part plus print-sheet.md. The print
 * sheet dialog shows the same sheet.
 */
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { loadExample, openApp, shownTriangles } from './helpers.ts';

/** The size a binary STL must have for its triangle count. */
function expectWellFormedStl(stl: Uint8Array, name = 'stl'): void {
  expect(stl.length, name).toBeGreaterThan(84);
  const n = new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true);
  expect(n, name).toBeGreaterThan(0);
  expect(stl.length, name).toBe(84 + 50 * n);
}

async function openExportMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Export/ }).click();
}

test('Export → Download STL downloads a binary STL of the shade', async ({ page }) => {
  await openApp(page);

  await openExportMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download STL/ }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^openlamp-.*\.stl$/);
  const stl = await readFile(await download.path());
  expectWellFormedStl(stl);
  // Preview and export quality are both "normal" by default: same mesh.
  expect(stl.readUInt32LE(80)).toBe(await shownTriangles(page));
});

test('Export → ZIP downloads one STL per part and the print sheet', async ({ page }) => {
  await openApp(page);
  await loadExample(page, 'Pendant on a cord');
  const rows = page.getByTestId('part-rows').locator('tbody tr');
  await expect(rows).toHaveCount(3);
  const parts = await rows.count();

  await openExportMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /ZIP of all parts/ }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^openlamp-.*\.zip$/);
  // The notice stays for two seconds: check it before reading the file.
  await expect(page.getByTestId('notice')).toContainText(download.suggestedFilename());
  const zip = await readFile(await download.path());
  expect([...zip.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  const files = unzipSync(new Uint8Array(zip));
  const names = Object.keys(files);
  expect(names).toContain('print-sheet.md');
  const stls = names.filter((n) => n.endsWith('.stl'));
  expect(stls).toHaveLength(parts);
  for (const name of stls) expectWellFormedStl(files[name]!, name);

  const sheet = strFromU8(files['print-sheet.md']!);
  expect(sheet.startsWith('# Pendant on a cord\n')).toBe(true);
  for (const name of stls) expect(sheet).toContain(`\`${name}\``);
});

test('Export → Print sheet… shows the parts table and downloads the sheet', async ({ page }) => {
  await openApp(page);
  await loadExample(page, 'Pendant on a cord');

  await openExportMenu(page);
  await page.getByRole('menuitem', { name: /Print sheet/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Print sheet' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('heading', { level: 1, name: 'Pendant on a cord', exact: true }),
  ).toBeVisible();

  // The parts table: one row per part plus the total, with the built parts' grams.
  const table = dialog.getByRole('table').first();
  await expect(table.getByRole('columnheader', { name: 'Part', exact: true })).toBeVisible();
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(4);
  for (const [i, name] of ['Hub', 'Shade', 'Canopy'].entries()) {
    await expect(rows.nth(i).locator('td').first()).toHaveText(name);
    await expect(rows.nth(i)).toContainText(/\d+ g/);
  }
  await expect(dialog.getByRole('heading', { name: 'Assembly', exact: true })).toBeVisible();
  // The colour swatches.
  await expect(table.locator('code span').first()).toHaveCSS('background-color', /rgb/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download .md' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('openlamp-pendant-on-a-cord-print-sheet.md');
  const md = await readFile(await download.path(), 'utf8');
  expect(md.startsWith('# Pendant on a cord\n')).toBe(true);

  // Print calls window.print(); on paper only the sheet shows, without the dialog's buttons.
  await page.evaluate('window.__printed = 0; window.print = () => { window.__printed += 1; }');
  await dialog.getByRole('button', { name: 'Print', exact: true }).click();
  expect(await page.evaluate('window.__printed')).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#root')).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Print', exact: true })).toBeHidden();
  await expect(table).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#root')).toBeVisible();

  // Closing hands the app back (no pointer lock left behind by the menu → dialog hand-over).
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Examples' })).toBeVisible();
});
