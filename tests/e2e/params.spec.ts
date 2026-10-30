/**
 * Editing the outer shade in its inspector: a number edit rebuilds, a select
 * hides the rows it makes irrelevant, ⌘Z / Ctrl+Z undoes an edit; the
 * example gallery replaces the lamp; the printer drives the bed-fit badge.
 * One page for the whole file; each test opens its lamp by share link.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  choosePrinter,
  defaultProject,
  exampleProject,
  expectReady,
  loadExample,
  selectNode,
  sharedPage,
  showProject,
  statRow,
  statsOf,
  statusOf,
  watchForBuilding,
} from './helpers.ts';

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});

test.afterAll(async () => {
  await page.context().close();
});

test.describe('the outer shade', () => {
  test.beforeEach(async () => {
    // Draft: the same footprints as at normal quality, half the triangles.
    await showProject(page, defaultProject('draft'));
    await selectNode(page, 'outerShade');
  });

  test('a number edit rebuilds the shade and changes its footprint', async () => {
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

  test('the smooth style hides the Ribs / facets row', async () => {
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

  test('⌘Z / Ctrl+Z undoes a parameter edit', async () => {
    const input = page.locator('#p-bottomDiameter');
    // Undo steps are throttled (300 ms): keep the edit out of the step that loaded the lamp.
    await page.waitForTimeout(350);
    await input.fill('200');
    await input.press('Enter'); // commits and blurs, so the shortcut reaches the app
    await expect(input).toHaveValue('200');
    await expectReady(page);

    await page.keyboard.press('ControlOrMeta+z');

    await expect(input).toHaveValue('160');
    await expect(statusOf(page)).toHaveText(/^Ready/);
    await expect(statRow(page, 'Footprint')).toContainText('161.6 × 161.6 mm');
  });
});

test('Examples → Klint builds the faceted shade', async () => {
  await loadExample(page, 'Klint');
  await selectNode(page, 'outerShade');

  await expect(page.locator('#p-bottomDiameter')).toHaveValue('170');
  await expect(statsOf(page)).toContainText('89,250 triangles');
});

test('the bed-fit badge follows the printer', async () => {
  // The 240 mm "Wide & shallow" shade fits the A1 (256 mm bed) but not the A1 mini (180 mm).
  await showProject(page, exampleProject('wide-shallow'));
  const badge = page.getByTestId('bed-fit');
  await expect(badge).toContainText('Fits');

  await choosePrinter(page, 'A1 mini');
  await expect(badge).toContainText('Exceeds');
  await expect(badge).toContainText('A1 mini');
  await expect(page.getByTestId('tree-fit-shade')).toContainText('too big');

  await choosePrinter(page, 'A1');
  await expect(badge).toContainText('Fits');
  await expect(badge).not.toContainText('mini');
});
