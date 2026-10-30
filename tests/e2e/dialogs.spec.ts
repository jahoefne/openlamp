import { expect, test } from '@playwright/test';
import { collectProblems, expectReady } from './helpers.ts';

test('the illustrated gallery selects a lamp and can undo back to the previous design', async ({
  page,
}) => {
  const problems = collectProblems(page);
  await page.goto('./');
  await expectReady(page);
  const previous = await page.getByLabel('Project name').inputValue();
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  const gallery = page.getByRole('dialog', { name: 'Examples', exact: true });
  const tableLamp = gallery
    .getByRole('button')
    .filter({ has: page.getByText('Table lamp', { exact: true }) });
  await tableLamp.scrollIntoViewIfNeeded();
  await expect(tableLamp.locator('svg')).toBeVisible();
  await page.waitForTimeout(350);
  await tableLamp.click();
  await expect(gallery).toBeHidden();
  await expectReady(page);
  await expect(page.getByLabel('Project name')).toHaveValue('Table lamp');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByLabel('Project name')).toHaveValue(previous);
  await expectReady(page);
  expect(problems).toEqual([]);
});

test('the printer picker validates and applies a custom build volume', async ({ page }) => {
  await page.goto('./');
  await expectReady(page);
  await page.getByRole('button', { name: /Choose printer:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Printer', exact: true });
  await dialog.locator('summary').click();
  await dialog.getByLabel('Name', { exact: true }).fill('Studio printer');
  await dialog.getByLabel('Bed X (mm)').fill('0');
  await expect(dialog.getByRole('button', { name: 'Use custom printer' })).toBeDisabled();
  await dialog.getByLabel('Bed X (mm)').fill('100');
  await dialog.getByLabel('Bed Y (mm)').fill('100');
  await dialog.getByLabel('Height Z (mm)').fill('100');
  await dialog.getByRole('button', { name: 'Use custom printer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('bed-fit')).toContainText('Exceeds');
  await page.getByRole('button', { name: /Choose printer:/ }).click();
  await expect(dialog.getByText('Check part sizes', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Bed X (mm)')).toHaveValue('100');
  await dialog
    .getByRole('button')
    .filter({ has: page.getByText('A1', { exact: true }) })
    .click();
  await expect(page.getByTestId('bed-fit')).toContainText('Fits');
});

test('dialogs and export options fit a touch phone in Atelier and Afterglow', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL!,
    viewport: { width: 320, height: 740 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.goto('./');
    await expectReady(page);
    for (const theme of ['atelier', 'afterglow']) {
      if (theme === 'afterglow')
        await page.getByRole('button', { name: 'Light off', exact: true }).tap();
      await expect(page.locator('html')).toHaveAttribute('data-appearance', theme);
      for (const [trigger, title] of [
        ['Examples', 'Examples'],
        ['Choose printer:', 'Printer'],
      ]) {
        await page.getByRole('button', { name: new RegExp(trigger!) }).tap();
        const dialog = page.getByRole('dialog', { name: title!, exact: true });
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(320);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(740);
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
      }
      await page.getByRole('button', { name: /^Export/ }).tap();
      const menu = page.getByRole('menu');
      const box = (await menu.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      await page.getByRole('menuitem', { name: /Print sheet/ }).tap();
      const sheet = page.getByRole('dialog', { name: 'Print sheet', exact: true });
      await expect(sheet).toBeVisible();
      expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
      await expect(sheet).toBeHidden();
    }
  } finally {
    await context.close();
  }
});
