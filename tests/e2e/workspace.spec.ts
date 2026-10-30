import { expect, test } from '@playwright/test';
import { exampleProject, expectReady, showProject, watchForBuilding } from './helpers.ts';

test('Atelier opens on the shade, with expandable navigation and print details', async ({
  page,
}) => {
  await page.goto('./');
  await expectReady(page);
  await expect(page.locator('#p-bottomDiameter')).toBeVisible();
  const details = page.getByRole('button', { name: 'Print details' });
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#stats')).toBeHidden();
  await expect(page.getByTestId('bed-fit')).toBeVisible();
  await details.click();
  await expect(page.locator('#stats')).toBeVisible();
  await details.click();
  await page.getByRole('button', { name: 'Expand the lamp tree' }).click();
  await expect(page.getByRole('button', { name: 'Collapse the lamp tree' })).toBeVisible();
  await expect(page.getByTestId('tree-outerShade')).toHaveAttribute('aria-current', 'true');
});

test('preview controls switch views without rebuilding, and warnings stay visible', async ({
  page,
}) => {
  await page.goto('./');
  await expectReady(page);
  const sawBuilding = await watchForBuilding(page);
  const toolbar = page.getByRole('toolbar', { name: 'Preview controls' });
  await toolbar.getByRole('button', { name: 'Print bed' }).click();
  await expect(toolbar.getByRole('button', { name: 'Print bed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(toolbar.getByRole('button', { name: 'Light off' })).toBeDisabled();
  await toolbar.getByRole('button', { name: 'Assembled' }).click();
  await toolbar.getByRole('button', { name: 'Light off' }).click();
  await expect(toolbar.getByRole('button', { name: 'Light on' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await toolbar.getByRole('button', { name: 'Frame lamp' }).click();
  await page.waitForTimeout(300);
  expect(await sawBuilding.seen()).toBe(false);
  const oversized = exampleProject('wide-shallow');
  oversized.printer.bed = [100, 100, 100];
  await showProject(page, oversized);
  await expect(page.locator('#stats')).toBeHidden();
  await expect(page.getByTestId('bed-fit')).toContainText('Exceeds');
  await expect(
    page
      .getByRole('region', { name: 'Build status' })
      .getByText(/exceeds|too big|build volume/i)
      .first(),
  ).toBeVisible();
});

test('tablet inspector and phone workspace remain usable without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('./');
  await expectReady(page);
  await page.getByTestId('tree-outerShade').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#p-bottomDiameter')).toBeVisible();
  await page.getByRole('button', { name: 'Close the inspector' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('#inspector #p-bottomDiameter')).toBeVisible();
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    const toolbar = await page.getByRole('toolbar', { name: 'Preview controls' }).boundingBox();
    expect(toolbar!.x).toBeGreaterThanOrEqual(0);
    expect(toolbar!.x + toolbar!.width).toBeLessThanOrEqual(width);
  }
});
