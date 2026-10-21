/**
 * Shared steps of the e2e specs.
 *
 * The specs run against the production build under the `/openlamp/` base:
 * navigate relatively (`page.goto('./')`) so the base path is kept.
 *
 * To keep the suite fast, most spec files run their tests in order on one
 * page (`test.describe.configure({ mode: 'serial' })` + `sharedPage` in
 * `beforeAll`), so the geometry kernel loads once per file, and open each
 * test's lamp through a share link (`showProject`: the `#p=` hash, which the
 * running app picks up without a reload), at draft quality wherever no
 * triangle count is asserted. The worker's part cache makes going back to a
 * lamp already built free.
 */
import { readFileSync } from 'node:fs';
import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
// lz-string is CommonJS: Node gives an ES module its `module.exports` as the default export.
import lzString from 'lz-string';
import type { Quality } from '../../src/core/geometry/quality.ts';
import {
  createDefaultProject,
  parseProject,
  serializeProject,
  type Project,
} from '../../src/core/model/project.ts';

/** The build status line ("Loading kernel…", "Building…", "Ready · …"). */
export const statusOf = (page: Page): Locator => page.locator('#status');

/** The stats (footprint, housing, material, overhang, mesh, part rows, warnings). */
export const statsOf = (page: Page): Locator => page.locator('#stats');

/** The value cell of one stats row, e.g. `statRow(page, 'Footprint')`. */
export const statRow = (page: Page, label: string): Locator =>
  page.locator(`#stats dt:text-is("${label}") + dd`);

/** The names in the status panel's part table. */
export const partNames = (page: Page): Locator => page.getByTestId('part-rows').locator('tbody th');

/** Wait until every part is built and the status reads "Ready …". */
export async function expectReady(page: Page): Promise<void> {
  await expect(statusOf(page)).toHaveText(/^Ready/);
}

/** Open the app (or `path` under the base) and wait for the first build. */
export async function openApp(page: Page, path = './'): Promise<void> {
  await page.goto(path);
  await expectReady(page);
}

/**
 * A page of its own for a serial spec file (create it in `beforeAll`): the
 * project's `use` options (base URL, viewport) apply as they do to the `page`
 * fixture.
 */
export async function sharedPage(
  browser: Browser,
  testInfo: TestInfo,
  options: BrowserContextOptions = {},
): Promise<Page> {
  const { baseURL, viewport, deviceScaleFactor, userAgent } = testInfo.project.use;
  const context = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    ...(viewport ? { viewport } : {}),
    ...(deviceScaleFactor ? { deviceScaleFactor } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...options,
  });
  return context.newPage();
}

// ---------------------------------------------------------------- projects

const EXAMPLES = new URL('../../src/examples/', import.meta.url);

/** An example lamp (`src/examples/<id>.lamp.json`), previewed at `quality` (default draft). */
export function exampleProject(id: string, quality: Quality = 'draft'): Project {
  const project = parseProject(readFileSync(new URL(`${id}.lamp.json`, EXAMPLES), 'utf8'));
  project.quality.preview = quality;
  return project;
}

/** The default lamp (the fused bell), previewed at `quality` (default normal: its counts are asserted). */
export function defaultProject(quality: Quality = 'normal'): Project {
  const project = createDefaultProject({
    id: 'e2e-default',
    updatedAt: '2026-10-21T00:00:00.000Z',
  });
  project.quality.preview = quality;
  return project;
}

/** The share-link hash of a project (`#p=` + lz-string), as the app writes it. */
export function projectHash(project: Project): string {
  return `#p=${lzString.compressToEncodedURIComponent(serializeProject(project))}`;
}

/**
 * Show `project` and wait for its build: the first time by opening the app on
 * its share link, after that by setting the hash of the running app (which
 * loads it as an example would, keeping the kernel and the part cache).
 */
export async function showProject(page: Page, project: Project): Promise<void> {
  const hash = projectHash(project);
  if (!page.url().includes('/openlamp/')) {
    await openApp(page, `./${hash}`);
    return;
  }
  const json = JSON.stringify(hash);
  await page.evaluate(`location.hash = ${json}`);
  // The app answers by loading the project, which rewrites the hash (a new revision) …
  await page.waitForFunction(`location.hash !== ${json}`);
  // … and React shows it (and the parts it still has to build) by the next frame.
  await page.evaluate('new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)))');
  await expect(page.getByLabel('Project name')).toHaveValue(project.name);
  await expectReady(page);
}

// ---------------------------------------------------------------- the lamp tree

/** A lamp-tree node's row (`project`, `printer`, `mount`, `light`, `outerShade`, `innerShade`, `hub`). */
export const treeNode = (page: Page, node: string): Locator => page.getByTestId(`tree-${node}`);

/** The inspector, showing the node `node`. */
export const inspectorOf = (page: Page, node: string): Locator =>
  page.locator(`#inspector > [data-node="${node}"]`);

/** Select a lamp-tree node and wait for its inspector. */
export async function selectNode(page: Page, node: string): Promise<void> {
  await treeNode(page, node).click();
  await expect(treeNode(page, node)).toHaveAttribute('aria-current', 'true');
  await expect(inspectorOf(page, node)).toBeVisible();
}

// ---------------------------------------------------------------- builds and dialogs

/**
 * Start watching the status for "Building…"; the returned function resolves
 * once it has been seen. Call this *before* the edit and the returned function
 * after it: a MutationObserver records the state, so even a build that is over
 * in a few hundred milliseconds (or between two slow software-rendered frames)
 * is caught.
 */
export async function watchForBuilding(
  page: Page,
): Promise<{ (): Promise<void>; seen(): Promise<boolean> }> {
  // A string, not a function: the Node tsconfig has no DOM types.
  await page.evaluate(`(() => {
    const el = document.getElementById('status');
    window.__openlampSawBuilding = false;
    window.__openlampObserver?.disconnect();
    window.__openlampObserver = new MutationObserver(() => {
      if (el.textContent.startsWith('Building')) window.__openlampSawBuilding = true;
    });
    window.__openlampObserver.observe(el, { childList: true, characterData: true, subtree: true });
  })()`);
  const wait = async () => {
    await page.waitForFunction('window.__openlampSawBuilding === true');
  };
  wait.seen = async () => Boolean(await page.evaluate('window.__openlampSawBuilding'));
  return wait;
}

/** The triangle count of the shown part, from the "Mesh" stats row. */
export async function shownTriangles(page: Page): Promise<number> {
  const text = (await statRow(page, 'Mesh').textContent()) ?? '';
  const match = /([\d,]+) triangles/.exec(text);
  if (!match?.[1]) throw new Error(`No triangle count in "${text}"`);
  return Number(match[1].replaceAll(',', ''));
}

/** Examples → the example named `name`; waits for its build. */
export async function loadExample(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Examples' });
  await dialog
    .getByRole('button')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Project name')).toHaveValue(name);
  await expectReady(page);
}

/** The printer chip in the project bar (its name plus the bed, e.g. "A1 256×256×256"). */
export const printerChip = (page: Page): Locator =>
  page.getByRole('banner').getByRole('button', { name: /\d+×\d+×\d+/ });

/** Printer chip → the curated printer named `name` (e.g. "A1 mini"). */
export async function choosePrinter(page: Page, name: string): Promise<void> {
  await printerChip(page).click();
  const dialog = page.getByRole('dialog', { name: 'Printer' });
  await dialog
    .getByRole('button')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await expect(dialog).toBeHidden();
  await expect(printerChip(page).getByText(name, { exact: true })).toBeVisible();
}

/**
 * Collect everything that means the page is broken: console errors, uncaught
 * exceptions, failed requests and non-2xx responses (a wrong base path shows
 * up as 404s for the scripts, the worker or the .wasm, or as redirects).
 */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`uncaught: ${err.message}`));
  page.on('requestfailed', (req) =>
    problems.push(`request failed: ${req.url()} (${req.failure()?.errorText ?? 'unknown'})`),
  );
  page.on('response', (res) => {
    if (!res.ok()) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  return problems;
}
