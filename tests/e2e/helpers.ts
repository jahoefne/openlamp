/**
 * Shared steps of the e2e specs. Every spec starts from a fresh browser
 * context (no storage), so each test sees the default project unless it loads
 * another one.
 *
 * The specs run against the production build under the `/openlamp/` base:
 * navigate relatively (`page.goto('./')`) so the base path is kept.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** The build status overlay ("Loading kernel…", "Building…", "Ready · …"). */
export const statusOf = (page: Page): Locator => page.locator('#status');

/** The stats overlay (footprint, housing, material, overhang, mesh, bed fit). */
export const statsOf = (page: Page): Locator => page.locator('#stats');

/** The value cell of one stats row, e.g. `statRow(page, 'Footprint')`. */
export const statRow = (page: Page, label: string): Locator =>
  page.locator(`#stats dt:text-is("${label}") + dd`);

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
 * Start watching the status for "Building…"; the returned function resolves
 * once it has been seen. Call this *before* the edit and the returned function
 * after it: a MutationObserver records the state, so even a build that is over
 * in a few hundred milliseconds (or between two slow software-rendered frames)
 * is caught.
 */
export async function watchForBuilding(page: Page): Promise<() => Promise<void>> {
  // A string, not a function: the Node tsconfig has no DOM types.
  await page.evaluate(`(() => {
    const el = document.getElementById('status');
    window.__openlampSawBuilding = false;
    new MutationObserver(() => {
      if (el.textContent.startsWith('Building')) window.__openlampSawBuilding = true;
    }).observe(el, { childList: true, characterData: true, subtree: true });
  })()`);
  return async () => {
    await page.waitForFunction('window.__openlampSawBuilding === true');
  };
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
  page.getByRole('button', { name: /\d+×\d+×\d+/ });

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
