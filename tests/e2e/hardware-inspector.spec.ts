import { expect, test, type Page } from '@playwright/test';
import {
  defaultProject,
  exampleProject,
  expectReady,
  selectNode,
  showProject,
  watchForBuilding,
} from './helpers.ts';

async function choose(page: Page, id: string, option: string) {
  await page.locator(id).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expectReady(page);
}
const section = (page: Page, name: string) =>
  page.getByRole('region', { name: `${name} settings`, exact: true });

test('mounts lead with placement and shape; construction edits and undo stay intact', async ({
  page,
}) => {
  await showProject(page, defaultProject('draft'));
  await selectNode(page, 'mount');
  await expect(page.locator('#p-strapWidth')).toBeVisible();
  await expect(page.locator('#p-loopWall')).toBeHidden();
  const sawBuilding = await watchForBuilding(page);
  const hash = new URL(page.url()).hash;
  await section(page, 'Construction').locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#p-loopWall')).toBeVisible();
  await page.waitForTimeout(350);
  expect(await sawBuilding.seen()).toBe(false);
  expect(new URL(page.url()).hash).toBe(hash);
  await page.locator('#p-loopWall').fill('3');
  await page.locator('#p-loopWall').press('Enter');
  await expectReady(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#p-loopWall')).toHaveValue('2.4');
  await choose(page, '#p-mount', 'Pendant on a cord');
  await expect(page.locator('#p-dropLength')).toBeVisible();
  await expect(page.locator('#p-canopyDiameter')).toBeVisible();
  await expect(page.locator('#p-canopyScrewSpacing')).toBeHidden();
  await expect(page.locator('#p-cordDiameter')).toBeHidden();
  await choose(page, '#p-mount', 'Wall arm');
  await expect(page.locator('#p-armLength')).toBeVisible();
  await expect(page.locator('#p-armRiseAngle')).toHaveCount(0);
  await choose(page, '#p-armShape', 'Angled');
  await expect(page.locator('#p-armRiseAngle')).toBeVisible();
  await expect(page.locator('#p-plateThickness')).toBeHidden();
  await choose(page, '#p-mount', 'Standing lamp');
  await expect(page.locator('#p-stemTotalHeight')).toBeVisible();
  await expect(page.locator('#p-baseDiameter')).toBeVisible();
  await expect(page.locator('#p-stemSegmentLength')).toBeHidden();
});

test('light hardware dimensions stay visible while fit settings retain precise edits and presets', async ({
  page,
}) => {
  await showProject(page, exampleProject('pendant-cord'));
  await selectNode(page, 'light');
  await expect(page.locator('#p-puckDiameter')).toBeVisible();
  await expect(page.locator('#p-puckClearance')).toBeHidden();
  await section(page, 'Puck fit').locator('summary').click();
  await page.waitForTimeout(350);
  await page.locator('#p-puckClearance').fill('0.9');
  await page.locator('#p-puckClearance').press('Enter');
  await expectReady(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#p-puckClearance')).toHaveValue('0.7');
  await choose(page, '#p-light', 'E27 bulb');
  await expect(page.locator('#p-bulbFitting')).toBeVisible();
  await expect(page.locator('#p-bulbHeatClearance')).toBeVisible();
  await expect(page.locator('#p-bulbHoleDiameter')).toBeHidden();
  await expect(page.locator('#p-bulbCableDiameter')).toBeHidden();
  await section(page, 'Lampholder fit').locator('summary').click();
  await page.locator('#p-bulbHoleDiameter').fill('41.5');
  await page.locator('#p-bulbHoleDiameter').press('Enter');
  await expectReady(page);
  await choose(page, '#p-light', 'E14 bulb');
  await expect(page.locator('#p-bulbHoleDiameter')).toHaveValue('41.5');
  await expect(page.locator('#p-bulbDiameter')).toHaveValue('35');
  await choose(page, '#p-light', 'LED strip');
  await expect(section(page, 'Lampholder fit')).toHaveCount(0);
  await expect(page.locator('#p-stripRingDiameter')).toBeVisible();
  await expect(page.locator('#p-stripWidth')).toBeVisible();
  await expect(page.locator('#p-stripChannelDepth')).toBeHidden();
});

test('hub assembly choices reveal only applicable thread, collar and vent settings', async ({
  page,
}) => {
  await showProject(page, defaultProject('draft'));
  await selectNode(page, 'hub');
  await expect(section(page, 'Hub construction')).toHaveCount(0);
  await page.locator('#p-fused').click();
  await expectReady(page);
  await expect(page.locator('#p-shadeToHub')).toBeVisible();
  await expect(page.locator('#p-jointTolerance')).toBeVisible();
  await expect(page.locator('#p-collarWall')).toBeHidden();
  await choose(page, '#p-shadeToHub', 'Thread');
  await expect(page.locator('#p-threadPitch')).toBeHidden();
  const thread = section(page, 'Thread details');
  const sawBuilding = await watchForBuilding(page);
  await thread.locator('summary').click();
  await page.waitForTimeout(350);
  expect(await sawBuilding.seen()).toBe(false);
  await page.locator('#p-threadPitch').fill('3');
  await page.locator('#p-threadPitch').press('Enter');
  await expectReady(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#p-threadPitch')).toHaveValue('2.5');
  await choose(page, '#p-shadeToHub', 'Bayonet');
  await expect(thread).toHaveCount(0);
  await expect(page.locator('#p-threadPitch')).toHaveCount(0);
  await showProject(page, exampleProject('two-tone-bell'));
  await section(page, 'Hub construction').locator('summary').click();
  await expect(page.locator('#p-radialGap')).toBeVisible();
  await expect(page.locator('#p-ventCount')).toHaveCount(0);
  await selectNode(page, 'light');
  await choose(page, '#p-light', 'E27 bulb');
  await selectNode(page, 'hub');
  await section(page, 'Hub construction').locator('summary').click();
  await expect(page.locator('#p-ventCount')).toBeVisible();
});

test('notes for mount, light and hub technical fields stay visible while collapsed', async ({
  page,
}) => {
  const wall = exampleProject('wall-lamp');
  if (wall.mount.kind !== 'wallArm') throw new Error('Expected wall arm');
  wall.mount.plate.thickness = 3;
  await showProject(page, wall);
  await selectNode(page, 'mount');
  await expect(page.locator('#p-plateThickness')).toBeHidden();
  await expect(section(page, 'Construction').getByRole('status')).toContainText('stands out');
  await expect(section(page, 'Construction').getByRole('status')).toBeVisible();
  const strip = exampleProject('strip-drum');
  if (strip.light.kind !== 'strip') throw new Error('Expected LED strip');
  strip.light.channelDepth = 2;
  await showProject(page, strip);
  await selectNode(page, 'light');
  await expect(page.locator('#p-stripChannelDepth')).toBeHidden();
  await expect(section(page, 'Channel & cable').getByRole('status')).toContainText(
    'Channel depth raised',
  );
  await expect(section(page, 'Channel & cable').getByRole('status')).toBeVisible();
  const hub = exampleProject('pendant-cord');
  hub.joints.shadeToHub = 'thread';
  hub.joints.threadPitch = 2;
  hub.joints.threadDepth = 1;
  await showProject(page, hub);
  await selectNode(page, 'hub');
  await expect(page.locator('#p-threadDepth')).toBeHidden();
  await expect(section(page, 'Thread details').getByRole('status')).toContainText(
    'threadDepth reduced',
  );
  await expect(section(page, 'Thread details').getByRole('status')).toBeVisible();
  await section(page, 'Thread details').locator('summary').click();
  await expect(section(page, 'Thread details').getByRole('status')).toHaveCount(1);
});
