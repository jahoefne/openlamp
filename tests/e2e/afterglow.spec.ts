import { expect, test } from '@playwright/test';
import { collectProblems, expectReady, watchForBuilding } from './helpers.ts';

test('Afterglow keeps the current model, selection and edits while switching lighting quality', async ({
  page,
}) => {
  const problems = collectProblems(page);
  await page.goto('./');
  await expectReady(page);
  const diameter = page.locator('#p-bottomDiameter');
  await diameter.fill('180');
  await diameter.press('Enter');
  await expectReady(page);
  const hash = new URL(page.url()).hash;
  await page.evaluate('window.__afterglowCanvas = document.querySelector("canvas")');
  const sawBuilding = await watchForBuilding(page);
  const toolbar = page.getByRole('toolbar', { name: 'Preview controls' });
  await toolbar.getByRole('button', { name: 'Light off', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'afterglow');
  await expect(page.getByRole('heading', { name: 'Find your afterglow.' })).toBeVisible();
  await expect(page.getByTestId('tree-outerShade')).toHaveAttribute('aria-current', 'true');
  await expect(diameter).toHaveValue('180');
  const simple = toolbar.getByRole('button', { name: /Simple preview/ });
  const was = await simple.getAttribute('aria-pressed');
  await simple.click();
  await expect(simple).toHaveAttribute('aria-pressed', was === 'true' ? 'false' : 'true');
  await page.locator('#inspector h2').click();
  await page.keyboard.press('l');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'atelier');
  await expect(simple).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Made of light.' })).toBeVisible();
  await page.waitForTimeout(300);
  expect(await sawBuilding.seen()).toBe(false);
  expect(new URL(page.url()).hash).toBe(hash);
  expect(await page.evaluate('window.__afterglowCanvas === document.querySelector("canvas")')).toBe(
    true,
  );
  expect(problems).toEqual([]);
});

test('print-bed view suspends Afterglow and portalled menus and dialogs follow the active theme', async ({
  page,
}) => {
  await page.goto('./');
  await expectReady(page);
  const toolbar = page.getByRole('toolbar', { name: 'Preview controls' });
  await toolbar.getByRole('button', { name: 'Light off', exact: true }).click();
  const simple = toolbar.getByRole('button', { name: /Simple preview/ });
  const quality = await simple.getAttribute('aria-pressed');
  await toolbar.getByRole('button', { name: 'Print bed', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'atelier');
  await expect(toolbar.getByRole('button', { name: 'Light off', exact: true })).toBeDisabled();
  await toolbar.getByRole('button', { name: 'Assembled', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'afterglow');
  await expect(simple).toHaveAttribute('aria-pressed', quality!);
  await page.locator('#p-shadeFamily').click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox).toHaveCSS('background-color', 'rgb(40, 44, 35)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Examples', exact: true });
  await expect(dialog).toHaveCSS('background-color', 'rgb(29, 32, 26)');
  await page.keyboard.press('Escape');
  await toolbar.getByRole('button', { name: 'Light on', exact: true }).click();
  await page.locator('#p-shadeFamily').click();
  await expect(listbox).toHaveCSS('background-color', 'rgb(238, 238, 229)');
});

test('Afterglow fits tablet and phone layouts with both lighting qualities available', async ({
  page,
}) => {
  await page.goto('./');
  await expectReady(page);
  const toolbar = page.getByRole('toolbar', { name: 'Preview controls' });
  await toolbar.getByRole('button', { name: 'Light off', exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByTestId('tree-outerShade').click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(29, 32, 26)');
  await page.getByRole('button', { name: 'Close the inspector' }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(toolbar.getByRole('button', { name: /Simple preview/ })).toBeVisible();
    await expect(page.locator('#inspector #p-bottomDiameter')).toBeVisible();
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    const box = await toolbar.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
});
