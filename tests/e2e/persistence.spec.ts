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
import { expect, test, type Page } from '@playwright/test';
import {
  defaultProject,
  expectReady,
  openApp,
  projectHash,
  selectNode,
  sharedPage,
} from './helpers.ts';

const FULL_FIXTURE = fileURLToPath(new URL('../fixtures/v1-full.lamp.json', import.meta.url));
/** The default lamp at draft quality, as a share link. */
const DRAFT_DEFAULT = `./${projectHash(defaultProject('draft'))}`;

test('an edit is mirrored to the #p= hash and survives a reload', async ({ page }) => {
  await openApp(page, DRAFT_DEFAULT);
  await selectNode(page, 'outerShade');
  const hashBefore = new URL(page.url()).hash;
  const input = page.locator('#p-bottomDiameter');
  await input.fill('200');
  await input.press('Enter');

  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#p=/);
  await expect.poll(() => new URL(page.url()).hash).not.toBe(hashBefore);

  await page.reload();
  await expectReady(page);
  await selectNode(page, 'outerShade');
  await expect(input).toHaveValue('200');
});

test('a legacy ?bottomDiameter= link loads and is rewritten to #p=', async ({ page }) => {
  await openApp(page, './?bottomDiameter=200&style=smooth&quality=draft');
  await selectNode(page, 'outerShade');

  await expect(page.locator('#p-bottomDiameter')).toHaveValue('200');
  await expect(page.locator('#p-style')).toHaveText(/Smooth/);
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#p=/);
  expect(new URL(page.url()).pathname).toBe('/openlamp/');
});

test.describe('project files', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    page = await sharedPage(browser, testInfo, { acceptDownloads: true });
    // Chromium has the File System Access API, whose native save dialog a test
    // cannot drive: hide it so Save takes the download fallback.
    await page.addInitScript(
      "Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })",
    );
    await openApp(page, DRAFT_DEFAULT);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('Save downloads the project as a .lamp.json file', async () => {
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

  test('Open loads a .lamp.json file', async () => {
    await page.getByTestId('open-file').setInputFiles(FULL_FIXTURE);

    await expect(page.getByLabel('Project name')).toHaveValue('Everything set');
    await expectReady(page);
    await selectNode(page, 'outerShade');
    await expect(page.locator('#p-bottomDiameter')).toHaveValue('210');
  });
});

test.describe(() => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('Share copies a link that reopens the project', async ({ page, browser }) => {
    await openApp(page, DRAFT_DEFAULT);
    await selectNode(page, 'outerShade');
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
      await selectNode(fresh, 'outerShade');
      await expect(fresh.locator('#p-bottomDiameter')).toHaveValue('190');
    } finally {
      await context.close();
    }
  });
});
