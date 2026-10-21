import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { standingDefaults } from '@core/assembly/mounts/standing.ts';
import { createDefaultProject, defaultMount, parseProject } from '@core/model/project.ts';
import { findPrinter } from '@core/schema/printers.ts';
import {
  HISTORY_THROTTLE_MS,
  canRedo,
  canUndo,
  clearHistory,
  redo,
  undo,
  useProjectStore,
} from '../../../src/app/store/projectStore.ts';

const store = () => useProjectStore.getState();
const project = () => store().project;
const steps = () => useProjectStore.temporal.getState().pastStates.length;
const height = () => project().shades[0].style.height;
/** Let the history throttle window pass, so the next commit opens a new step. */
const pause = () => vi.advanceTimersByTime(HISTORY_THROTTLE_MS + 50);

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-21T12:00:00Z') });
  store().replaceProject(createDefaultProject({ id: 'test', name: 'Test lamp' }));
  clearHistory();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('slider drags', () => {
  it('records a transient sequence plus its commit as exactly one undo step', () => {
    expect(height()).toBe(120);
    const before = project().revision;
    for (const h of [121, 123, 126, 130]) {
      store().setClassicParam('height', h, { transient: true });
      vi.advanceTimersByTime(50); // a drag spans many throttle windows
    }
    expect(height()).toBe(130);
    expect(steps()).toBe(0); // paused while dragging
    store().setClassicParam('height', 131);
    expect(height()).toBe(131);
    expect(steps()).toBe(1);
    expect(project().revision).toBe(before + 5);

    undo();
    expect(height()).toBe(120); // back to before the drag, not to 130
    expect(canUndo()).toBe(false);
    redo();
    expect(height()).toBe(131);
    expect(canRedo()).toBe(false);
  });

  it('records nothing for a drag released where it started', () => {
    store().setClassicParam('height', 140, { transient: true });
    store().setClassicParam('height', 120, { transient: true });
    store().endTransient();
    expect(height()).toBe(120);
    expect(steps()).toBe(0);
  });

  it('ends a drag without a commit as one step', () => {
    store().setClassicParam('curve', 0.5, { transient: true });
    store().endTransient();
    expect(steps()).toBe(1);
    undo();
    expect(project().shades[0].style.curve).toBe(0.25);
  });

  it('keeps the history running after a drag', () => {
    store().setClassicParam('height', 150, { transient: true });
    store().setClassicParam('height', 150);
    pause();
    store().setClassicParam('bottomDiameter', 200);
    expect(steps()).toBe(2);
    undo();
    expect(project().shades[0].style.bottomDiameter).toBe(160);
    expect(height()).toBe(150);
  });
});

describe('history', () => {
  it('merges commits inside the throttle window into one step', () => {
    store().setProjectName('L');
    store().setProjectName('La');
    store().setProjectName('Lam');
    expect(steps()).toBe(1);
    pause();
    store().setProjectName('Lamp');
    expect(steps()).toBe(2);
    undo();
    expect(project().name).toBe('Lam');
    undo();
    expect(project().name).toBe('Test lamp');
  });

  it('opens a new step right after an undo, which clears the redo stack', () => {
    store().setClassicParam('height', 150);
    undo();
    store().setClassicParam('height', 160);
    expect(canRedo()).toBe(false);
    expect(steps()).toBe(1);
  });

  it('makes replaceProject undoable, even onto a project with the same revision', () => {
    const text = readFileSync(
      new URL('../../../src/examples/faceted.lamp.json', import.meta.url),
      'utf8',
    );
    const example = { ...parseProject(text), revision: project().revision };
    const loads = store().loads;
    store().replaceProject(example);
    expect(store().loads).toBe(loads + 1); // the camera rig frames loaded projects
    expect(project().id).toBe('faceted');
    expect(project().revision).toBeGreaterThan(0);
    expect(store().dirty).toBe(false);
    expect(steps()).toBe(1);
    undo();
    expect(project().id).toBe('test');
    redo();
    expect(project().name).toBe(example.name);
  });

  it('clears dirty when the saved revision is still current, without an undo step', () => {
    store().setClassicParam('height', 150);
    expect(store().dirty).toBe(true);
    const saved = project().revision;
    pause();
    store().setClassicParam('height', 151); // edited while the save was in flight
    store().markSaved(saved);
    expect(store().dirty).toBe(true);
    store().markSaved(project().revision);
    expect(store().dirty).toBe(false);
    expect(steps()).toBe(2);
  });

  it('ignores a commit that changes nothing', () => {
    store().setClassicParam('height', 120);
    expect(steps()).toBe(0);
  });
});

describe('mutations', () => {
  it('setPrinter bumps the revision, copies the profile and is undoable', () => {
    const mini = findPrinter('bambu-a1-mini')!;
    const before = project().revision;
    store().setPrinter(mini);
    expect(project().revision).toBe(before + 1);
    expect(project().printer).toEqual(mini);
    expect(project().printer.bed).not.toBe(mini.bed);
    expect(store().dirty).toBe(true);
    undo();
    expect(project().printer.id).toBe('bambu-a1');
  });

  it('maps flat classic parameters into the project', () => {
    store().setClassicParam('style', 'faceted');
    store().setClassicParam('fitTest', 'yes');
    store().setClassicParam('quality', 'draft');
    store().setClassicParam('strapWidth', 20);
    const p = project();
    expect(p.shades[0].style.surface.style).toBe('faceted');
    expect(p.fitTest).toBe(true);
    expect(p.quality).toEqual({ preview: 'draft', export: 'normal' });
    expect(p.mount).toMatchObject({ kind: 'ceilingStrap', strapWidth: 20 });
  });

  it('sets quality, fit test and colour, each bumping the revision', () => {
    const r = project().revision;
    store().setQuality('export', 'fine');
    store().setFitTest(true);
    store().setShadeColour('#7fa7c9');
    expect(project().quality.export).toBe('fine');
    expect(project().fitTest).toBe(true);
    expect(project().shades[0].colour).toBe('#7fa7c9');
    expect(project().revision).toBe(r + 3);
  });
});

describe('mounts', () => {
  it('setMount swaps in the new mount with its defaults, keeps the rest and is one undo step', () => {
    store().setClassicParam('height', 150);
    pause();
    const before = project();
    store().setMount('ceilingCord');
    const p = project();
    expect(p.mount).toEqual(defaultMount('ceilingCord'));
    expect(p.shades).toEqual(before.shades);
    expect(p.light).toEqual(before.light);
    expect(p.hub).toEqual(before.hub);
    expect(p.joints).toEqual(before.joints);
    expect(steps()).toBe(2);
    undo();
    expect(project().mount).toEqual(before.mount);
    expect(height()).toBe(150);
  });

  it('setMount to the current mount changes nothing', () => {
    const revision = project().revision;
    store().setMount('ceilingStrap');
    expect(project().revision).toBe(revision);
    expect(steps()).toBe(0);
  });

  it('setMountParam edits the current mount by its flat key, ignoring unknown keys', () => {
    store().setMount('ceilingCord');
    pause();
    store().setMountParam('canopyDiameter', 110);
    store().setMountParam('grip', 'collet');
    expect(project().mount).toMatchObject({
      kind: 'ceilingCord',
      grip: 'collet',
      canopy: { diameter: 110 },
    });
    const revision = project().revision;
    store().setMountParam('strapWidth', 20); // not a cord parameter
    expect(project().revision).toBe(revision);
  });

  it('setMountParam drags are one undo step', () => {
    store().setMount('ceilingCord');
    pause();
    for (const d of [610, 650, 700]) store().setMountParam('dropLength', d, { transient: true });
    store().setMountParam('dropLength', 720);
    expect(project().mount).toMatchObject({ dropLength: 720 });
    pause();
    undo();
    expect(project().mount).toMatchObject({ dropLength: 600 });
  });

  it('switching the standing variant applies its defaults to the unedited fields, one step', () => {
    store().setMount('standing');
    pause();
    store().setMountParam('baseDiameter', 200); // edited: stays
    pause();
    store().setMountParam('standingVariant', 'floor');
    const floor = standingDefaults('floor');
    expect(project().mount).toEqual({
      ...floor,
      base: { ...floor.base, diameter: 200 },
    });
    expect(project().mount).toMatchObject({
      variant: 'floor',
      base: { diameter: 200, height: 30, pocketDepth: 22, lid: 'snap' },
      stem: { totalHeight: 1300, segmentLength: 220, diameter: 32, cableDiameter: 6 },
    });
    expect(steps()).toBe(3);
    undo();
    expect(project().mount).toEqual({
      ...defaultMount('standing'),
      base: { ...defaultMount('standing').base, diameter: 200 },
    });
    redo();
    pause();
    // Back to a table lamp: the floor defaults go, the edited Ø and a new edit stay.
    store().setMountParam('stemTotalHeight', 900);
    pause();
    store().setMountParam('standingVariant', 'table');
    expect(project().mount).toMatchObject({
      variant: 'table',
      base: { diameter: 200, height: 22, pocketDepth: 14 },
      stem: { totalHeight: 900, segmentLength: 200, diameter: 28 },
    });
  });

  it('switching to an unedited floor lamp gives the floor defaults (Ø280 base, taller stem)', () => {
    store().setMount('standing');
    store().setMountParam('standingVariant', 'floor');
    expect(project().mount).toEqual(standingDefaults('floor'));
    // Choosing the same variant again changes nothing else.
    store().setMountParam('standingVariant', 'floor');
    expect(project().mount).toEqual(standingDefaults('floor'));
  });

  it('a shade edit keeps a mount other than the strap', () => {
    store().setMount('wallArm');
    store().setClassicParam('height', 140);
    expect(project().mount.kind).toBe('wallArm');
    expect(height()).toBe(140);
  });
});
