import { describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { layoutParts } from '@core/assembly/layout.ts';
import { classicShadeFootprint, derive } from '@core/geometry/parts/classicShade.ts';
import { IDENTITY, type Placement } from '@core/model/assembly.ts';
import { createDefaultProject, projectToClassicParams, type Project } from '@core/model/project.ts';
import { normalizeClassicShade } from '@core/schema/normalize.ts';
import { findPrinter } from '@core/schema/printers.ts';

function project(printerId = 'bambu-a1', edit: (p: Project) => void = () => {}): Project {
  const p = createDefaultProject({
    id: 'test',
    name: 'Test',
    updatedAt: '2026-10-21T00:00:00.000Z',
  });
  p.printer = findPrinter(printerId)!;
  edit(p);
  return p;
}

const wide = (p: Project) => {
  p.shades[0].style.bottomDiameter = 240;
};

describe('assemble', () => {
  it('resolves the default project into one classic shade part', () => {
    const p = project();
    const a = assemble(p);
    expect(a.parts).toHaveLength(1);
    const part = a.parts[0]!;
    expect(part).toMatchObject({
      id: 'shade',
      kind: 'classicShade',
      instances: 1,
      colour: '#f4efe6',
    });
    expect(part.params).toEqual(normalizeClassicShade(projectToClassicParams(p)).values);
    expect(part.params.quality).toBe(p.quality.preview);
    expect(part.hash).toMatch(/^[0-9a-f]{14}$/);
    expect(part.assembledTransform).toEqual([...IDENTITY]);
    // Centred on the 256 mm bed.
    expect(part.printTransform.slice(12)).toEqual([128, 128, 0, 1]);
    expect(part.bedFootprint).toEqual(classicShadeFootprint(part.params));
    expect(part.bedFootprint!.x).toBeCloseTo(161.6, 6);
    expect(part.bedFootprint!.z).toBeCloseTo(derive(part.params).zTop, 9);
    expect(a.warnings).toEqual([]);
  });

  it('warns when a 240 mm shade does not fit an A1 mini', () => {
    const a = assemble(project('bambu-a1-mini', wide));
    const bedFit = a.warnings.filter((w) => w.code === 'bed-fit');
    expect(bedFit).toHaveLength(1);
    expect(bedFit[0]).toMatchObject({ severity: 'warning', partId: 'shade' });
    expect(bedFit[0]!.message).toContain('too large in X and Y');
    expect(a.parts[0]!.warnings).toEqual(bedFit);
    expect(a.layout.overflow).toEqual(['shade']);
  });

  it('has no bed-fit warning for the same shade on an A1', () => {
    const a = assemble(project('bambu-a1', wide));
    expect(a.warnings.filter((w) => w.code === 'bed-fit')).toEqual([]);
    expect(a.layout.overflow).toEqual([]);
  });

  it('reports a part that is too tall', () => {
    const a = assemble(
      project('bambu-a1-mini', (p) => {
        p.shades[0].style.height = 160;
      }),
    );
    expect(a.warnings.find((w) => w.code === 'bed-fit')?.message).toContain('too large in Z');
  });

  it('gives identical buildKeys to projects that differ only in name and colour', () => {
    const a = assemble(project());
    const b = assemble(
      project('bambu-a1-mini', (p) => {
        p.id = 'other';
        p.name = 'Another lamp';
        p.shades[0].colour = '#123456';
        p.colours = { shade: '#ff0000' };
      }),
    );
    expect(b.parts[0]!.buildKey).toBe(a.parts[0]!.buildKey);
    expect(b.parts[0]!.hash).toBe(a.parts[0]!.hash);
    expect(b.parts[0]!.colour).toBe('#ff0000');
  });

  it('gives different buildKeys for different geometry or quality', () => {
    const base = assemble(project()).parts[0]!.buildKey;
    expect(assemble(project('bambu-a1', wide)).parts[0]!.buildKey).not.toBe(base);
    expect(assemble(project(), { quality: 'fine' }).parts[0]!.buildKey).not.toBe(base);
  });

  it('reports normalisation warnings with their project path', () => {
    const a = assemble(
      project('bambu-a1', (p) => {
        p.shades[0].style.topDiameter = 40;
      }),
    );
    expect(a.parts[0]!.params.topDiameter).toBe(68);
    expect(a.warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['clamped', 'shades.0.style.topDiameter'],
      ['adjusted', 'shades.0.style.topDiameter'],
    ]);
  });

  it('uses the fit-test ring footprint in fit-test mode', () => {
    const a = assemble(
      project('bambu-a1', (p) => {
        p.fitTest = true;
      }),
    );
    expect(a.parts[0]!.displayName).toBe('Fit-test ring');
    expect(a.parts[0]!.bedFootprint!.y).toBeCloseTo(75, 6);
    expect(a.parts[0]!.bedFootprint!.z).toBeCloseTo(13.3, 6);
  });
});

describe('layoutParts', () => {
  const overlaps = (a: Placement, b: Placement, gap: number) =>
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap - 1e-9 &&
    Math.abs(a.y - b.y) < (a.depth + b.depth) / 2 + gap - 1e-9;
  const inside = (p: Placement, bed: readonly number[]) =>
    p.x - p.width / 2 >= 0 &&
    p.y - p.depth / 2 >= 0 &&
    p.x + p.width / 2 <= bed[0]! &&
    p.y + p.depth / 2 <= bed[1]!;

  it('packs two footprints on one bed without overlap', () => {
    const bed = [256, 256, 256] as const;
    const layout = layoutParts(
      [
        { id: 'a', x: 120, y: 100 },
        { id: 'b', x: 80, y: 100 },
      ],
      bed,
    );
    expect(layout.overflow).toEqual([]);
    const [a, b] = layout.placements;
    expect([a!.id, b!.id]).toEqual(['a', 'b']);
    expect(overlaps(a!, b!, 10)).toBe(false);
    expect(inside(a!, bed) && inside(b!, bed)).toBe(true);
  });

  it('starts a new shelf when a row is full and reports what does not fit', () => {
    const bed = [256, 256, 256] as const;
    const layout = layoutParts(
      [
        { id: 'a', x: 150, y: 150 },
        { id: 'b', x: 150, y: 90 },
        { id: 'c', x: 150, y: 150 },
        { id: 'huge', x: 300, y: 100 },
      ],
      bed,
    );
    expect(layout.overflow).toEqual(['c', 'huge']);
    const placed = layout.placements.filter((p) => !layout.overflow.includes(p.id));
    expect(placed.map((p) => p.id)).toEqual(['a', 'b']);
    expect(overlaps(placed[0]!, placed[1]!, 10)).toBe(false);
    expect(placed.every((p) => inside(p, bed))).toBe(true);
    // Overflowing parts are still placed (centred) so they can be exported.
    expect(layout.placements).toHaveLength(4);
  });

  it('turns a part 90° when only that fits', () => {
    const layout = layoutParts([{ id: 'a', x: 250, y: 150 }], [200, 300, 200]);
    expect(layout.overflow).toEqual([]);
    expect(layout.placements[0]).toMatchObject({ rotated: true, width: 150, depth: 250 });
  });
});
