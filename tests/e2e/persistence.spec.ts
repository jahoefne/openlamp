/**
 * Projects outlive the page: the URL hash (`#p=` + lz-string
 * `compressToEncodedURIComponent(serializeProject(project))`), legacy
 * `?bottomDiameter=…` links, Save / Open of `.lamp.json` files and Share links.
 *
 * Written against the M1.5 persistence contract: a hidden
 * `<input type="file" data-testid="open-file">`, Save downloads
 * `<slug>.lamp.json`, Share copies the link and says "Link copied".
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectReady, openApp } from './helpers.ts';

const FULL_FIXTURE = fileURLToPath(new URL('../fixtures/v1-full.lamp.json', import.meta.url));

// enable after M1.5
test.fixme('an edit is mirrored to the #p= hash and survives a reload', async ({ page }) => {
  await openApp(page);
  const hashBefore = new URL(page.url()).hash;
  const input = page.locator('#p-bottomDiameter');
  await input.fill('200');
  await input.press('Enter');

  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#p=/);
  await expect.poll(() => new URL(page.url()).hash).not.toBe(hashBefore);

  await page.reload();
  await expectReady(page);
  await expect(input).toHaveValue('200');
});

// enable after M1.5
test.fixme('a legacy ?bottomDiameter= link loads and is rewritten to #p=', async ({ page }) => {
  await openApp(page, './?bottomDiameter=200&style=smooth');

  await expect(page.locator('#p-bottomDiameter')).toHaveValue('200');
  await expect(page.locator('#p-style')).toHaveText(/Smooth/);
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#p=/);
  expect(new URL(page.url()).pathname).toBe('/openlamp/');
});

// enable after M1.5
test.fixme('Save downloads the project as a .lamp.json file', async ({ page }) => {
  // Chromium has the File System Access API, whose native save dialog a test
  // cannot drive: hide it so Save takes the download fallback.
  await page.addInitScript(
    "Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })",
  );
  await openApp(page);
  const name = await page.getByLabel('Project name').inputValue();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^[a-z0-9-]+\.lamp\.json$/);
  const saved = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    version: unknown;
    name: unknown;
    shades: unknown[];
  };
  expect(saved.version).toEqual(expect.any(Number));
  expect(saved.name).toBe(name);
  expect(saved.shades).toHaveLength(1);
});

// enable after M1.5
test.fixme('Open loads a .lamp.json file', async ({ page }) => {
  await openApp(page);

  await page.getByTestId('open-file').setInputFiles(FULL_FIXTURE);

  await expect(page.getByLabel('Project name')).toHaveValue('Everything set');
  await expect(page.locator('#p-bottomDiameter')).toHaveValue('210');
  await expectReady(page);
});

test.describe(() => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  // enable after M1.5
  test.fixme('Share copies a link that reopens the project', async ({ page, browser }) => {
    await openApp(page);
    const input = page.locator('#p-bottomDiameter');
    await input.fill('190');
    await input.press('Enter');
    await expectReady(page);

    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByText('Link copied')).toBeVisible();

    const link = String(await page.evaluate('navigator.clipboard.readText()'));
    expect(link).toMatch(/\/openlamp\/#p=/);

    // A fresh context (no autosave) proves the link alone carries the project.
    const context = await browser.newContext();
    try {
      const fresh = await context.newPage();
      await fresh.goto(link);
      await expectReady(fresh);
      await expect(fresh.locator('#p-bottomDiameter')).toHaveValue('190');
    } finally {
      await context.close();
    }
  });
});
