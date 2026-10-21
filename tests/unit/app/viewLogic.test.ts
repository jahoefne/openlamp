/**
 * The view logic behind the lamp tree, the exploded view and the bed view:
 * which node a part belongs to, how the selection moves, how far each part
 * moves apart, where each copy lies on the bed.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { withInnerShade } from '@core/assembly/innerShade.ts';
import { applyToPoint, translation } from '@core/assembly/transforms.ts';
import type { BBox, PartSpec } from '@core/model/assembly.ts';
import { createDefaultProject, parseProject, type Project } from '@core/model/project.ts';
import { findPrinter } from '@core/schema/printers.ts';
import {
  ROOT_NODE,
  mainPartOf,
  nodeOfPart,
  shownNode,
  structuralParts,
} from '../../../src/app/store/nodes.ts';
import { useUiStore } from '../../../src/app/store/uiStore.ts';
import { BED_SIDE_GAP, bedScene } from '../../../src/app/viewport/bedView.ts';
import { EXPLODE_STEP, explodeOffsets } from '../../../src/app/viewport/explode.ts';

const example = (id: string): Project =>
  parseProject(
    readFileSync(new URL(`../../../src/examples/${id}.lamp.json`, import.meta.url), 'utf8'),
  );

const ids = (parts: readonly PartSpec[]) => parts.map((p) => p.id);

/** A part's box as its footprint, centred on its print origin, standing on the bed. */
const footprintBox = (p: PartSpec): BBox => {
  const f = p.bedFootprint!;
  return { min: [-f.x / 2, -f.y / 2, 0], max: [f.x / 2, f.y / 2, f.z] };
};

describe('the lamp tree nodes', () => {
  it('maps every part to its node: hub, shades, mount parts, test pieces', () => {
    const table = assemble(withInnerShade(example('table-lamp')));
    expect(table.parts.map((p) => [p.id, nodeOfPart(p)])).toEqual([
      ['hub', 'hub'],
      ['shade', 'outerShade'],
      ['innerShade', 'innerShade'],
      ['stem', 'mount'],
      ['stemFoot', 'mount'],
      ['base', 'mount'],
      ['baseLid', 'mount'],
    ]);
    expect(ids(structuralParts(table.parts))).toEqual(['stem', 'stemFoot', 'base', 'baseLid']);
    expect(mainPartOf('hub', table.parts)?.id).toBe('hub');
    expect(mainPartOf('outerShade', table.parts)?.id).toBe('shade');
    expect(mainPartOf('innerShade', table.parts)?.id).toBe('innerShade');
    expect(mainPartOf('mount', table.parts)).toBeUndefined();

    // The fused print is the outer shade; the fit-test pieces belong to the joint.
    const fused = assemble(createDefaultProject());
    expect(fused.parts.map(nodeOfPart)).toEqual(['outerShade']);
    expect(structuralParts(fused.parts)).toEqual([]);
    const pair = example('pendant-cord');
    pair.fitTest = true;
    const fit = assemble(pair);
    expect(fit.parts.map((p) => [p.id, nodeOfPart(p)])).toEqual([
      ['fitMale', 'hub'],
      ['fitFemale', 'hub'],
    ]);
    expect(ids(structuralParts(fit.parts))).toEqual(['fitMale', 'fitFemale']);
    expect(mainPartOf('hub', fit.parts)).toBeUndefined();
  });

  it('shows the outer shade for the inner shade node when there is no inner shade', () => {
    expect(shownNode('innerShade', false)).toBe('outerShade');
    expect(shownNode('innerShade', true)).toBe('innerShade');
    expect(shownNode('mount', false)).toBe('mount');
  });
});

describe('the selection', () => {
  const ui = () => useUiStore.getState();
  beforeEach(() => ui().clearSelection());

  it('starts at the project node, picks parts by their node and clears back', () => {
    expect(ui().selection).toBe(ROOT_NODE);
    expect(ui().selectedPart).toBeNull();
    const base = assemble(example('table-lamp')).parts.find((p) => p.id === 'base')!;
    ui().selectPart(base);
    expect(ui()).toMatchObject({ selection: 'mount', selectedPart: 'base' });
    ui().select('hub', 'hub');
    expect(ui()).toMatchObject({ selection: 'hub', selectedPart: 'hub' });
    ui().select('printer');
    expect(ui()).toMatchObject({ selection: 'printer', selectedPart: null });
    ui().clearSelection();
    expect(ui()).toMatchObject({ selection: 'project', selectedPart: null });
  });

  it('toggles the bed view', () => {
    expect(ui().viewMode).toBe('assembled');
    ui().toggleViewMode();
    expect(ui().viewMode).toBe('bed');
    ui().toggleViewMode();
    expect(ui().viewMode).toBe('assembled');
  });
});

describe('explodeOffsets', () => {
  const box = (z0: number, z1: number): BBox => ({ min: [-5, -5, z0], max: [5, 5, z1] });
  const at = (z: number) => [translation(0, 0, z)];

  it('moves the parts apart by rank around the median, nothing at 0', () => {
    const items = [
      { id: 'top', transforms: at(100), bbox: box(0, 10) },
      { id: 'bottom', transforms: at(0), bbox: box(0, 10) },
      { id: 'middle', transforms: at(50), bbox: box(0, 10) },
    ];
    expect(explodeOffsets(items, 0).size).toBe(0);
    expect(Object.fromEntries(explodeOffsets(items, 1))).toEqual({
      bottom: -EXPLODE_STEP,
      middle: 0,
      top: EXPLODE_STEP,
    });
    const half = explodeOffsets(items, 0.5);
    expect(half.get('top')).toBeCloseTo(EXPLODE_STEP / 2, 9);
    // An even count has no part in the middle: half steps either side.
    const four = explodeOffsets([...items, { id: 'up', transforms: at(200), bbox: box(0, 1) }], 1);
    expect([...four.values()].sort((a, b) => a - b)).toEqual([-90, -30, 30, 90]);
  });

  it('ranks a part by the centre of all its copies, turned parts by their transformed box', () => {
    const items = [
      // Two copies at z 0 and 300: centre 155.
      { id: 'stem', transforms: [translation(0, 0, 0), translation(0, 0, 300)], bbox: box(0, 10) },
      { id: 'low', transforms: at(100), bbox: box(0, 10) },
      // Turned over (z → −z) and lifted: its box spans 190 … 200.
      {
        id: 'flipped',
        transforms: [[1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 200, 1]],
        bbox: box(0, 10),
      },
    ];
    expect(Object.fromEntries(explodeOffsets(items, 1))).toEqual({
      low: -EXPLODE_STEP,
      stem: 0,
      flipped: EXPLODE_STEP,
    });
  });

  it('keeps a standing lamp in order from the lid up to the shade', () => {
    const a = assemble(example('table-lamp'));
    const offsets = explodeOffsets(
      a.parts.map((p) => ({ id: p.id, transforms: p.instanceTransforms, bbox: footprintBox(p) })),
      1,
    );
    const order = [...offsets.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
    expect(order[0]).toBe('baseLid');
    expect(order.indexOf('base')).toBeLessThan(order.indexOf('stemFoot'));
    expect(order.indexOf('stemFoot')).toBeLessThan(order.indexOf('stem'));
    expect(order.indexOf('stem')).toBeLessThan(order.indexOf('hub'));
  });
});

describe('bedScene', () => {
  it('puts every copy where the plate layout does, centred on the bed', () => {
    const a = assemble(example('table-lamp'));
    const boxes = new Map(a.parts.map((p) => [p.id, footprintBox(p)]));
    const scene = bedScene(a.parts, a.layout.bed, (id) => boxes.get(id));
    const [bx, by] = a.layout.bed;
    for (const part of a.parts) {
      const entry = scene.parts.get(part.id)!;
      expect(entry.matrices, part.id).toHaveLength(part.instances);
      const placements = a.layout.placements.filter((p) => p.id === part.id);
      for (const [i, m] of entry.matrices.entries()) {
        const p = placements[i]!;
        const centre = applyToPoint(m, [0, 0, 0]);
        const outside = a.layout.overflow.includes(part.id);
        if (!outside) {
          expect(centre[0], part.id).toBeCloseTo(p.x - bx / 2, 9);
          expect(centre[1], part.id).toBeCloseTo(p.y - by / 2, 9);
        }
        // Print orientation: z stays z, turned only about z.
        expect(m[10]).toBe(1);
        expect(Math.abs(m[0]!)).toBeCloseTo(p.rotated ? 0 : 1, 9);
      }
      expect(entry.overflow, part.id).toBe(a.layout.overflow.includes(part.id));
    }
  });

  it('lays the parts that do not fit beside the bed, front to back', () => {
    const a = assemble(example('table-lamp'));
    // A small bed: the shade and the base no longer fit next to the others (or at all).
    const bed = findPrinter('bambu-a1-mini')!.bed;
    const scene = bedScene(a.parts, bed, () => undefined);
    const outside = [...scene.parts.entries()].filter(([, e]) => e.overflow);
    expect(outside.length).toBeGreaterThan(0);
    let lastY = -Infinity;
    for (const [id, entry] of outside) {
      for (const m of entry.matrices) {
        const [x, y] = applyToPoint(m, [0, 0, 0]);
        expect(x, id).toBeGreaterThan(bed[0] / 2 + BED_SIDE_GAP - 1e-9);
        expect(y, id).toBeGreaterThan(lastY);
        lastY = y!;
      }
    }
  });

  it('centres a copy on its placement by its built box', () => {
    const a = assemble(createDefaultProject());
    const box: BBox = { min: [10, 20, 0], max: [30, 60, 5] };
    const [m] = bedScene(a.parts, a.layout.bed, () => box).parts.get('shade')!.matrices;
    const p = a.layout.placements[0]!;
    const centre = applyToPoint(m!, [20, 40, 0]);
    expect(centre[0]).toBeCloseTo(p.x - a.layout.bed[0] / 2, 9);
    expect(centre[1]).toBeCloseTo(p.y - a.layout.bed[1] / 2, 9);
  });
});
