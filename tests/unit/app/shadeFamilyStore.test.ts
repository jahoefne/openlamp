/**
 * The project store's shade-family actions: the Style family select
 * (`setShadeFamily`, one undo step, the diameters and height carried over)
 * and the family's own fields (`setShadeParam` by the family's flat keys).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { createDefaultProject, revolvedStyle } from '@core/model/project.ts';
import {
  HISTORY_THROTTLE_MS,
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
  store().replaceProject(createDefaultProject({ id: 'test', name: 'Test lamp' }));
  clearHistory();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setShadeFamily', () => {
  it('switches the outer shade to another family in one undo step, keeping its wall and colour', () => {
    const before = project().shades[0];
    pause();
    store().setShadeFamily('outer', 'slatted');
    expect(steps()).toBe(1);
    const shade = project().shades[0];
    expect(shade.style).toMatchObject({
      family: 'slatted',
      bottomDiameter: 160,
      topDiameter: 92,
      height: 120,
      slatCount: 24,
    });
    expect(shade.wallThickness).toBe(before.wallThickness);
    expect(shade.colour).toBe(before.colour);
    // The fused default splits into a hub and the slatted shade.
    expect(assemble(project()).parts.map((p) => p.id)).toEqual(['hub', 'shade']);

    undo();
    expect(project().shades[0].style).toEqual(before.style);
    expect(assemble(project()).parts).toHaveLength(1);
  });

  it('does nothing for the family the shade already has, or an inner shade that is not there', () => {
    const revision = project().revision;
    store().setShadeFamily('outer', 'revolved');
    store().setShadeFamily('inner', 'slatted');
    expect(project().revision).toBe(revision);
    expect(steps()).toBe(0);
  });

  it('switches the inner shade on its own', () => {
    store().addInnerShade();
    pause();
    store().setShadeFamily('inner', 'geometric');
    expect(project().shades[1]!.style.family).toBe('geometric');
    expect(project().shades[0].style.family).toBe('revolved');
  });
});

describe('the classic shade’s form with another family', () => {
  it('edits the puck and the strap without touching a slatted outer shade', () => {
    store().setShadeFamily('outer', 'slatted');
    const style = project().shades[0].style;
    pause();
    store().setClassicParam('puckDiameter', 60);
    store().setClassicParam('strapWidth', 20);
    expect(project().light).toMatchObject({ kind: 'puck', diameter: 60 });
    expect(project().mount).toMatchObject({ kind: 'ceilingStrap', strapWidth: 20 });
    expect(project().shades[0].style).toEqual(style);
  });
});

describe('setShadeParam by family', () => {
  it('sets a slatted shade’s own fields and ignores another family’s keys', () => {
    store().setShadeFamily('outer', 'slatted');
    pause();
    store().setShadeParam('outer', 'slatCount', 30);
    store().setShadeParam('outer', 'slatTwist', 20);
    const style = project().shades[0].style;
    expect(style).toMatchObject({ family: 'slatted', slatCount: 30, twist: 20 });
    const revision = project().revision;
    store().setShadeParam('outer', 'patternCount', 12); // a revolved key
    expect(project().revision).toBe(revision);
  });

  it('still sets a revolved shade’s keys', () => {
    store().addInnerShade();
    store().setShadeParam('inner', 'height', 77);
    expect(revolvedStyle(project().shades[1]!).height).toBe(77);
    store().setShadeParam('inner', 'slatCount', 30); // not a revolved key
    expect('slatCount' in project().shades[1]!.style).toBe(false);
  });
});
