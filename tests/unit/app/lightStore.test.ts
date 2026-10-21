/**
 * The project store's light actions: the Light select (`setLight`) and the
 * bulb's and strip's own fields (`setLightParam`), with the size / fitting
 * presets and the hub's vents.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProject, defaultMount, lightDefaults } from '@core/model/project.ts';
import {
  HISTORY_THROTTLE_MS,
  canUndo,
  clearHistory,
  undo,
  useProjectStore,
} from '../../../src/app/store/projectStore.ts';

const store = () => useProjectStore.getState();
const project = () => store().project;
const steps = () => useProjectStore.temporal.getState().pastStates.length;
const pause = () => vi.advanceTimersByTime(HISTORY_THROTTLE_MS + 50);

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-21T12:00:00Z') });
  const p = createDefaultProject({ id: 'test', name: 'Test lamp' });
  p.mount = defaultMount('ceilingCord');
  store().replaceProject(p);
  clearHistory();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setLight', () => {
  it('switches to an E27 bulb with its defaults and eight vents, one undo step', () => {
    store().setLight('E27');
    expect(project().light).toEqual(lightDefaults('bulb', 'E27'));
    expect(project().hub.ventCount).toBe(8);
    expect(steps()).toBe(1);
    undo();
    expect(project().light.kind).toBe('puck');
    expect(project().hub.ventCount).toBe(0);
    expect(canUndo()).toBe(false);
  });

  it('another bulb size keeps the fields you changed; the same choice changes nothing', () => {
    store().setLight('E27');
    pause();
    store().setLightParam('bulbLength', 120);
    pause();
    const revision = project().revision;
    store().setLight('E27');
    expect(project().revision).toBe(revision);
    store().setLight('E14');
    expect(project().light).toMatchObject({
      kind: 'bulb',
      size: 'E14',
      holeDiameter: 28.5,
      skirtDiameter: 38,
      bulbLength: 120,
    });
    expect(project().hub.ventCount).toBe(8);
  });

  it('the strip and back to the puck: no vents', () => {
    store().setLight('E14');
    pause();
    store().setLight('strip');
    expect(project().light).toEqual(lightDefaults('strip'));
    expect(project().hub.ventCount).toBe(0);
    pause();
    store().setLight('puck');
    expect(project().light).toEqual(createDefaultProject().light);
  });
});

describe('setLightParam', () => {
  it('a new fitting presets the hole unless you changed it', () => {
    store().setLight('E27');
    pause();
    store().setLightParam('bulbFitting', 'm10Nipple');
    expect(project().light).toMatchObject({ fitting: 'm10Nipple', holeDiameter: 10.5 });
    pause();
    store().setLightParam('bulbHoleDiameter', 11);
    pause();
    store().setLightParam('bulbFitting', 'shadeRing');
    expect(project().light).toMatchObject({ fitting: 'shadeRing', holeDiameter: 11 });
  });

  it('edits the strip by its flat keys, ignoring keys of other lights and the puck', () => {
    store().setLightParam('stripWidth', 8);
    expect(project().light.kind).toBe('puck');
    store().setLight('strip');
    pause();
    store().setLightParam('stripWidth', 8);
    store().setLightParam('bulbLength', 99);
    expect(project().light).toEqual({ ...lightDefaults('strip'), stripWidth: 8 });
  });

  it('a drag is one undo step', () => {
    store().setLight('E27');
    pause();
    for (const v of [13, 14, 15]) store().setLightParam('bulbSkirtHeight', v, { transient: true });
    store().setLightParam('bulbSkirtHeight', 16);
    expect(steps()).toBe(2);
    undo();
    expect(project().light).toEqual(lightDefaults('bulb', 'E27'));
  });
});
