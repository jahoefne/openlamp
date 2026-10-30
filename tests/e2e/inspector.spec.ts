import { expect, test } from '@playwright/test';
import {
  exampleProject,
  expectReady,
  selectNode,
  showProject,
  watchForBuilding,
} from './helpers.ts';

test('shape comes first; technical sections support keyboard access, edits and undo', async ({
  page,
}) => {
  await page.goto('./');
  await expectReady(page);
  const height = (await page.locator('#p-height').boundingBox())!;
  const family = (await page.locator('#p-shadeFamily').boundingBox())!;
  expect(height.y + height.height).toBeLessThan(family.y);
  await expect(page.locator('#p-wallThickness')).toBeHidden();
  await expect(page.locator('#p-ribDepth')).toBeHidden();
  const construction = page.getByRole('region', { name: 'Construction settings' });
  const sawBuilding = await watchForBuilding(page);
  const hash = new URL(page.url()).hash;
  await construction.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#p-wallThickness')).toBeVisible();
  await construction.locator('summary').press('Space');
  await expect(page.locator('#p-wallThickness')).toBeHidden();
  await page.waitForTimeout(350);
  expect(await sawBuilding.seen()).toBe(false);
  expect(new URL(page.url()).hash).toBe(hash);
  await construction.locator('summary').click();
  await page.locator('#p-wallThickness').fill('1.2');
  await page.locator('#p-wallThickness').press('Enter');
  await expectReady(page);
  await expect(page.locator('#p-wallThickness')).toHaveValue('1.2');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#p-wallThickness')).toHaveValue('0.8');
  await page.getByRole('button', { name: 'Light off', exact: true }).click();
  await expect(construction.locator('details')).toHaveAttribute('open', '');
  await expect(page.locator('#p-wallThickness')).toHaveValue('0.8');
});

test('family-specific controls and inner-shade editing keep their visibility and parameter paths', async ({
  page,
}) => {
  await showProject(page, exampleProject('slatted-drum'));
  await expect(page.locator('#p-slatCount')).toBeVisible();
  await expect(page.locator('#p-ringHeight')).toBeHidden();
  await page.locator('#p-shadeFamily').click();
  await page.getByRole('option', { name: 'Geometric', exact: true }).click();
  await expectReady(page);
  await page.locator('#p-geometricVariant').click();
  await page.getByRole('option', { name: 'Lattice of holes', exact: true }).click();
  await expect(page.locator('#p-holeSize')).toBeVisible();
  await expect(page.locator('#p-holePitch')).toBeHidden();
  const pattern = page.getByRole('region', { name: 'Pattern details settings' });
  await pattern.locator('summary').click();
  await expect(page.locator('#p-holePitch')).toBeVisible();
  await page.locator('#p-geometricVariant').click();
  await page.getByRole('option', { name: 'Polyhedral (twisted polygon)', exact: true }).click();
  await expect(pattern).toHaveCount(0);
  await expect(page.locator('#p-sides')).toBeVisible();
  await expect(page.locator('#p-holePitch')).toHaveCount(0);
  await showProject(page, exampleProject('ph-layered'));
  await expect(page.locator('#p-tiers')).toBeVisible();
  await expect(page.locator('#p-tierDrop')).toBeVisible();
  await expect(page.locator('#p-tierSpacers')).toBeHidden();
  await showProject(page, exampleProject('two-tone-bell'));
  await selectNode(page, 'innerShade');
  await expect(page.locator('#p-inner-bottomDiameter')).toBeVisible();
  await expect(page.locator('#p-inner-wallThickness')).toBeHidden();
  await page.getByRole('region', { name: 'Construction settings' }).locator('summary').click();
  await expect(page.locator('#p-inner-wallThickness')).toBeVisible();
  await page.locator('#p-inner-bottomDiameter').fill('125');
  await page.locator('#p-inner-bottomDiameter').press('Enter');
  await expectReady(page);
  await selectNode(page, 'outerShade');
  await expect(page.locator('#p-bottomDiameter')).toHaveValue('190');
  await selectNode(page, 'innerShade');
  await expect(page.locator('#p-inner-bottomDiameter')).toHaveValue('125');
});

test('notes for technical fields remain visible when their section is collapsed', async ({
  page,
}) => {
  const project = exampleProject('slatted-drum');
  project.printer.nozzle = 0.8;
  if (project.shades[0].style.family !== 'slatted') throw new Error('Expected slatted fixture');
  project.shades[0].style.slatThickness = 0.8;
  await showProject(page, project);
  const section = page.getByRole('region', { name: 'Construction settings' });
  await expect(section.getByRole('status')).toContainText('fewer than two perimeters');
  await expect(section.getByRole('status')).toBeVisible();
  await expect(page.locator('#p-slatThickness')).toBeHidden();
  await section.locator('summary').click();
  await expect(page.locator('#p-slatThickness')).toBeVisible();
  await expect(section.getByRole('status')).toBeVisible();
  await section.locator('summary').click();
  await expect(section.getByRole('status')).toBeVisible();
});
