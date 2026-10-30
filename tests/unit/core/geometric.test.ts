/**
 * The geometric shade (M3b): polyhedral, pleated and lattice shades build
 * valid, leak-free solids at draft and normal quality across their extremes;
 * slices show the polygon's corners, the pleats' crests alternating from band
 * to band and the lattice's holes row by row; the rules (twist limit, hole
 * pitch, the polygon's widened top, the hole cap and the infos and warnings);
 * every form hangs from the hub without overlapping it; the clearance
 * profile against the mesh; the "Origami pendant" and "Lattice drum"
 * examples; the default lattice's build time.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INNER_SHADE_ID, assemble } from '@core/assembly/assemble.ts';
import { withInnerShade } from '@core/assembly/innerShade.ts';
import { geometricShadeProfile } from '@core/assembly/shades/geometric.ts';
import { SHADE_MODULES, type ShadeCtx } from '@core/assembly/shades/index.ts';
import { scoped, type CrossSection, type Kernel } from '@core/geometry/kernel.ts';
import {
  GEOMETRIC_MAX_LEAN,
  LATTICE_MARGIN,
  MAX_LATTICE_HOLES,
  deriveGeometricShade,
  geometricShadeFootprint,
  latticeGrid,
  pleatedSegments,
  pleatedSurface,
  polyhedralDivisions,
} from '@core/geometry/parts/shades/geometric.ts';
import type { Quality } from '@core/geometry/quality.ts';
import { SHADE_JOINT_TYPES, type Assembly, type ShadeJointType } from '@core/model/assembly.ts';
import type { GeometricShadeParams } from '@core/model/parts.ts';
import {
  defaultShadeStyle,
  parseProject,
  shadeStyleForFamily,
  type GeometricStyle,
  type Project,
} from '@core/model/project.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import { assembled, byId, withBuilt, type Built } from '../../helpers/parts.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

const example = (id: string): Project =>
  parseProject(
    readFileSync(new URL(`../../../src/examples/${id}.lamp.json`, import.meta.url), 'utf8'),
  );

/** The pendant example (cord, puck, bayonet, Ø150 → Ø136 × 110) with a geometric shade. */
function geometric(edit: Partial<GeometricStyle> = {}, project = example('pendant-cord')): Project {
  project.shades[0].style = {
    ...shadeStyleForFamily(project.shades[0].style, 'geometric'),
    ...edit,
  };
  return project;
}

function geometricParams(a: Assembly, id = 'shade'): GeometricShadeParams {
  const part = a.parts.find((p) => p.id === id);
  if (part?.kind !== 'shade' || part.params.variant !== 'geometric') throw new Error('no shade');
  return part.params;
}

const shadeOnly = (a: Assembly) => a.parts.filter((p) => p.id === 'shade');
const errors = (a: Assembly) => a.warnings.filter((w) => w.severity === 'error');
const codes = (a: Assembly) => a.warnings.map((w) => w.code);

type Polygon = [number, number][];

const signedArea = (poly: Polygon) =>
  poly.reduce((sum, [x, y], i) => {
    const [x1, y1] = poly[(i + 1) % poly.length]!;
    return sum + (x * y1 - x1 * y) / 2;
  }, 0);

/** The outermost contour of a section (the largest one). */
function outerContour(section: CrossSection): Polygon {
  const polys = section.toPolygons() as Polygon[];
  return polys.reduce((a, b) => (Math.abs(signedArea(a)) >= Math.abs(signedArea(b)) ? a : b));
}

/** A contour's radius around the axis: its crests (crossings of the mid radius) and extremes. */
function radialWave(poly: Polygon): {
  crests: number;
  min: number;
  max: number;
  peakAngle: number;
} {
  const pts = poly
    .map(([x, y]) => ({ a: Math.atan2(y, x), r: Math.hypot(x, y) }))
    .sort((p, q) => p.a - q.a);
  const rs = pts.map((p) => p.r);
  const min = Math.min(...rs);
  const max = Math.max(...rs);
  const mid = (min + max) / 2;
  let crests = 0;
  for (let i = 0; i < rs.length; i++) if (rs[i]! < mid && rs[(i + 1) % rs.length]! >= mid) crests++;
  const peak = pts.find((p) => p.r === max)!;
  return { crests, min, max, peakAngle: peak.a };
}

/** Valid, on the bed, collar on top, inside its footprint, overhang as derived. */
function expectSolid(built: Built, params: GeometricShadeParams, q: Quality): void {
  const { stats } = built;
  const d = deriveGeometricShade(params, q);
  expect(stats.status).toBe('NoError');
  expect(stats.bbox.min[2]).toBeCloseTo(0, 6);
  expect(stats.bbox.max[2]).toBeCloseTo(d.zTop, 6);
  const f = geometricShadeFootprint(params);
  expect(stats.bbox.max[0] - stats.bbox.min[0]).toBeLessThanOrEqual(f.x + 1e-6);
  expect(stats.bbox.max[1] - stats.bbox.min[1]).toBeLessThanOrEqual(f.y + 1e-6);
  expect(f.z).toBeCloseTo(stats.bbox.max[2], 6);
  expect(stats.maxOverhangDeg).toBeCloseTo(Math.max(d.wallLeanDeg, 45), 9);
}

describe('the geometric family', () => {
  it('is registered with its own parts (no stand-in)', () => {
    expect(SHADE_MODULES.geometric.pending).toBeUndefined();
    expect(SHADE_MODULES.geometric.partKinds).toEqual(['shade']);
    const a = assemble(geometric({ variant: 'pleated' }));
    expect(codes(a)).not.toContain('family-pending');
    expect(a.parts.map((p) => p.id)).toEqual(['hub', 'shade', 'canopy']);
  });

  it('carries only the chosen form’s fields in the params (the others leave the buildKey alone)', () => {
    const poly = geometricParams(assemble(geometric({ variant: 'polyhedral' })));
    expect(poly).toMatchObject({ pattern: 'polyhedral', sides: 8, twist: 20 });
    expect(Object.keys(poly)).not.toEqual(expect.arrayContaining(['pleatCount']));
    expect('holeShape' in poly || 'bands' in poly).toBe(false);
    const pleat = geometricParams(assemble(geometric({ variant: 'pleated' })));
    expect(pleat).toMatchObject({ pattern: 'pleated', pleatCount: 16, pleatDepth: 6, bands: 5 });
    expect('sides' in pleat || 'holePitch' in pleat).toBe(false);
    const lattice = geometricParams(assemble(geometric({ variant: 'lattice' })));
    expect(lattice).toMatchObject({
      pattern: 'lattice',
      holeShape: 'hex',
      holeSize: 6,
      holePitch: 11,
    });
    expect('twist' in lattice || 'pleatDepth' in lattice).toBe(false);
    // A pleated shade's buildKey ignores the polyhedral fields.
    const key = (edit: Partial<GeometricStyle>) =>
      assemble(geometric({ variant: 'pleated', ...edit })).parts.find((p) => p.id === 'shade')!
        .buildKey;
    expect(key({ sides: 5, twist: -40, holeSize: 9 })).toBe(key({}));
    expect(key({ bands: 3 })).not.toBe(key({}));
  });
});

describe('the polyhedral shade builds', () => {
  const cases: [number, number, Quality][] = [];
  for (const q of ['draft', 'normal'] as const) {
    for (const sides of [3, 8, 24]) for (const twist of [0, 60, -60]) cases.push([sides, twist, q]);
  }

  it.each(cases)(
    '%d sides, twist %d° at %s quality: a valid solid without leaks, the polygon halfway up',
    (sides, twist, q) => {
      const a = assemble(geometric({ variant: 'polyhedral', sides, twist }), { quality: q });
      expect(errors(a)).toEqual([]);
      const params = geometricParams(a);
      const d = deriveGeometricShade(params, q);
      // The polygon presents its inscribed Ø to the collar, which clears the ring.
      expect(d.rShoulder).toBeGreaterThanOrEqual(params.collar.seatRadius + 1 - 1e-9);
      withBuilt(k, tracker, shadeOnly(a), q, ([shade]) => {
        expectSolid(shade!, params, q);
        // Halfway up (on a division plane of the twisted extrusion): the
        // wall's outer contour has exactly `sides` corners, at the twist's angle.
        const slices = polyhedralDivisions(params, q) + 1;
        const dz = d.H / slices;
        const z = slices === 1 ? d.H / 2 : Math.max(1, Math.round(d.H / 2 / dz)) * dz + 1e-3;
        scoped(k, (s) => {
          const section = s.add(shade!.manifold.slice(z));
          expect(section.toPolygons()).toHaveLength(2); // the wall: outside and inside
          // Its corners: what is left when the straight runs are merged.
          const outer = outerContour(s.add(section.simplify(0.02)));
          expect(outer).toHaveLength(sides);
          const r = d.rBot + ((d.rTop - d.rBot) * z) / d.H;
          const top = outer.reduce((a, b) => (Math.hypot(...a) >= Math.hypot(...b) ? a : b));
          expect(Math.hypot(...top)).toBeCloseTo(r, 1);
          // A corner sits at the twist so far (mod one side).
          const sector = 360 / sides;
          const angle =
            ((((Math.atan2(top[1], top[0]) * 180) / Math.PI) % sector) + sector) % sector;
          const want = ((((twist * z) / d.H) % sector) + sector) % sector;
          const off = Math.min(Math.abs(angle - want), sector - Math.abs(angle - want));
          expect(off).toBeLessThan(0.5);
          // The roof's neck and the seat under the collar plane are round.
          const seat = s.add(shade!.manifold.slice(d.zCollar - 0.2));
          expect(seat.bounds().max[0]).toBeCloseTo(d.rSeat, 1);
        });
      });
    },
  );

  it('keeps the wall thick at the top too (its own inner scale), the roof at 45°', () => {
    const a = assemble(geometric({ variant: 'polyhedral', sides: 6, twist: 0 }), {
      quality: 'normal',
    });
    const params = geometricParams(a);
    const d = deriveGeometricShade(params);
    withBuilt(k, tracker, shadeOnly(a), 'normal', ([shade]) => {
      scoped(k, (s) => {
        for (const z of [2, d.H / 2, d.H - 2]) {
          const section = s.add(shade!.manifold.slice(z));
          // Inner and outer hexagon: their areas differ by the wall times the
          // perimeter (the wall is horizontal-thick `t` at every height).
          const [a1, a2] = (section.toPolygons() as Polygon[])
            .map((p) => Math.abs(signedArea(p)))
            .sort((x, y) => y - x);
          const rIn = (d.rBot + ((d.rTop - d.rBot) * z) / d.H) * Math.cos(Math.PI / 6);
          const perimeter = 12 * rIn * Math.tan(Math.PI / 6);
          expect((a1! - a2!) / perimeter).toBeCloseTo(d.t, 1);
        }
      });
    });
  });
});

describe('the pleated shade builds', () => {
  const cases: [number, number, Quality][] = [];
  for (const q of ['draft', 'normal'] as const) {
    for (const n of [8, 16, 40]) for (const bands of [1, 5]) cases.push([n, bands, q]);
  }

  it.each(cases)(
    '%d pleats, %d bands at %s quality: a valid solid without leaks, Yoshimura crests',
    (n, bands, q) => {
      const a = assemble(geometric({ variant: 'pleated', pleatCount: n, bands }), { quality: q });
      expect(errors(a)).toEqual([]);
      const params = geometricParams(a);
      const d = deriveGeometricShade(params, q);
      const surface = pleatedSurface(params, q);
      expect(surface.segments % (2 * n)).toBe(0);
      expect(surface.segments).toBe(pleatedSegments(n, q));
      expect(surface.boundaries).toHaveLength(bands + 1);
      withBuilt(k, tracker, shadeOnly(a), q, ([shade]) => {
        expectSolid(shade!, params, q);
        scoped(k, (s) => {
          const h = d.H / bands;
          for (let b = 0; b < bands; b++) {
            // Just above a band boundary: `n` crests a pleat depth deep, their
            // phase alternating from boundary to boundary (half a pleat).
            const at = s.add(shade!.manifold.slice(b * h + 0.2));
            expect(at.toPolygons()).toHaveLength(2);
            const wave = radialWave(outerContour(at));
            expect(wave.crests).toBe(n);
            expect(wave.max - wave.min).toBeGreaterThan(params.pleatDepth! - 0.5);
            const half = Math.PI / n;
            const phase = ((wave.peakAngle % (2 * half)) + 2 * half) % (2 * half);
            const want = (b % 2) * half;
            const off = Math.min(Math.abs(phase - want), 2 * half - Math.abs(phase - want));
            expect(off).toBeLessThan(0.1 * half);
            // Halfway up a full band the diamonds' diagonal folds cross: twice
            // as many crests (the top band folds out into the round top).
            if (b < bands - 1) {
              const mid = s.add(shade!.manifold.slice(b * h + h / 2));
              expect(radialWave(outerContour(mid)).crests).toBe(2 * n);
            }
          }
          // The top of the wall is round, the roof's seat under the collar too.
          const top = radialWave(outerContour(s.add(shade!.manifold.slice(d.H - 0.05))));
          expect(top.max - top.min).toBeLessThan(0.5);
          const seat = s.add(shade!.manifold.slice(d.zCollar - 0.2));
          expect(seat.bounds().max[0]).toBeCloseTo(d.rSeat, 1);
        });
      });
    },
  );
});

describe('the lattice shade builds', () => {
  const cases: ['hex' | 'round', 'tight' | 'loose', Quality][] = [];
  for (const q of ['draft', 'normal'] as const) {
    for (const shape of ['hex', 'round'] as const) {
      for (const pitch of ['tight', 'loose'] as const) cases.push([shape, pitch, q]);
    }
  }

  it.each(cases)(
    '%s holes, %s pitch at %s quality: a valid solid without leaks, one gap per hole in a row',
    (holeShape, pitch, q) => {
      const holeSize = 6;
      const a = assemble(
        geometric({
          variant: 'lattice',
          holeShape,
          holeSize,
          holePitch: pitch === 'tight' ? 7.6 : 20,
        }),
        { quality: q },
      );
      expect(errors(a)).toEqual([]);
      expect(codes(a)).not.toContain('adjusted');
      const params = geometricParams(a);
      const d = deriveGeometricShade(params, q);
      const grid = latticeGrid(params);
      expect(grid.holes).toBeGreaterThan(0);
      expect(grid.holes).toBeLessThanOrEqual(MAX_LATTICE_HOLES);
      // Every hole at least LATTICE_MARGIN from the bed and from the roof.
      for (const row of grid.rows) {
        expect(row.z - grid.halfHeight).toBeGreaterThanOrEqual(LATTICE_MARGIN - 1e-9);
        expect(row.z + grid.halfHeight).toBeLessThanOrEqual(d.H - LATTICE_MARGIN + 1e-9);
      }
      withBuilt(k, tracker, shadeOnly(a), q, ([shade]) => {
        expectSolid(shade!, params, q);
        scoped(k, (s) => {
          // Through a row of holes: the wall falls apart into one piece per hole.
          const row = grid.rows[Math.floor(grid.rows.length / 2)]!;
          const cut = s.add(shade!.manifold.slice(row.z));
          expect(cut.toPolygons().length).toBeGreaterThan(1);
          expect(cut.toPolygons()).toHaveLength(row.count);
          // Below the first row the wall is whole (outside and inside).
          expect(s.add(shade!.manifold.slice(LATTICE_MARGIN / 2)).toPolygons()).toHaveLength(2);
        });
      });
    },
  );
});

describe('the geometric shade in the hub', () => {
  it.each(['polyhedral', 'pleated', 'lattice'] as const)(
    'a %s shade hangs from the hub without overlapping it',
    (variant) => {
      const lamp = assemble(geometric({ variant }), { quality: 'draft' });
      const parts = lamp.parts.filter((x) => x.id === 'hub' || x.id === 'shade');
      withBuilt(k, tracker, parts, 'draft', (built) => {
        const hub = byId(built, 'hub');
        const shade = byId(built, 'shade');
        expect(hub.stats.status).toBe('NoError');
        expect(shade.stats.status).toBe('NoError');
        scoped(k, (s) => {
          const h = s.add(assembled(hub));
          const sh = s.add(assembled(shade));
          expect(s.add(k.Manifold.intersection(h, sh)).volume()).toBeLessThan(1);
        });
      });
    },
  );

  it.each(SHADE_JOINT_TYPES)('a polyhedral shade sits on a %s joint', (type: ShadeJointType) => {
    const p = geometric({ variant: 'polyhedral', sides: 5, twist: 30 });
    p.joints.shadeToHub = type;
    const lamp = assemble(p, { quality: 'draft' });
    expect(errors(lamp)).toEqual([]);
    const parts = lamp.parts.filter((x) => x.id === 'hub' || x.id === 'shade');
    withBuilt(k, tracker, parts, 'draft', (built) => {
      scoped(k, (s) => {
        const h = s.add(assembled(byId(built, 'hub')));
        const sh = s.add(assembled(byId(built, 'shade')));
        expect(s.add(k.Manifold.intersection(h, sh)).volume()).toBeLessThan(1);
      });
    });
  });
});

describe('the geometric shade’s rules', () => {
  it('limits a polyhedral twist to ±90°', () => {
    const a = assemble(geometric({ variant: 'polyhedral', twist: -150 }), { quality: 'draft' });
    expect(a.warnings.find((w) => w.paramPath === 'shades.0.style.twist')).toMatchObject({
      severity: 'warning',
      code: 'adjusted',
      partId: 'shade',
    });
    expect(geometricParams(a).twist).toBe(-90);
    // The other forms keep their (hidden) twist without a word.
    const p = assemble(geometric({ variant: 'pleated', twist: -150 }), { quality: 'draft' });
    expect(p.warnings.filter((w) => w.paramPath === 'shades.0.style.twist')).toEqual([]);
  });

  it('widens a polygon’s top until its inscribed Ø clears the hub ring', () => {
    const a = assemble(geometric({ variant: 'polyhedral', sides: 3 }), { quality: 'draft' });
    const w = a.warnings.find((x) => x.paramPath === 'shades.0.style.topDiameter');
    expect(w).toMatchObject({ severity: 'warning', code: 'adjusted', partId: 'shade' });
    const params = geometricParams(a);
    // The kit's bayonet ring needs 78 mm; a triangle presents half its top Ø.
    expect(params.topDiameter).toBe(156);
    expect(params.topDiameter * Math.cos(Math.PI / 3)).toBeGreaterThanOrEqual(78);
    // Eight sides at Ø136 present 125.6 mm: nothing to widen.
    const eight = assemble(geometric({ variant: 'polyhedral', sides: 8 }), { quality: 'draft' });
    expect(eight.warnings.filter((x) => x.paramPath === 'shades.0.style.topDiameter')).toEqual([]);
    // A round top widens to exactly the ring's need.
    const round = assemble(geometric({ variant: 'pleated', topDiameter: 70 }), {
      quality: 'draft',
    });
    expect(geometricParams(round).topDiameter).toBe(78);
  });

  it('raises a lattice’s pitch to the hole plus two walls', () => {
    const a = assemble(geometric({ variant: 'lattice', holeSize: 10, holePitch: 8 }), {
      quality: 'draft',
    });
    const w = a.warnings.find((x) => x.paramPath === 'shades.0.style.holePitch');
    expect(w).toMatchObject({ severity: 'warning', code: 'adjusted', partId: 'shade' });
    expect(w!.message).toMatch(/^holePitch raised to 12 mm /);
    expect(geometricParams(a).holePitch).toBe(12);
  });

  it('thins out a lattice of more than 600 holes (an info) and still builds it', () => {
    const a = assemble(geometric({ variant: 'lattice', holeSize: 3, holePitch: 5 }), {
      quality: 'draft',
    });
    const params = geometricParams(a);
    const grid = latticeGrid(params);
    expect(grid.requested).toBeGreaterThan(MAX_LATTICE_HOLES);
    expect(grid.capped).toBe(true);
    expect(grid.holes).toBeLessThanOrEqual(MAX_LATTICE_HOLES);
    expect(grid.pitch).toBeGreaterThan(5);
    expect(a.warnings.find((w) => w.code === 'lattice-cap')).toMatchObject({
      severity: 'info',
      partId: 'shade',
      paramPath: 'shades.0.style.holePitch',
    });
    withBuilt(k, tracker, shadeOnly(a), 'draft', ([shade]) => {
      expect(shade!.stats.status).toBe('NoError');
      scoped(k, (s) => {
        const row = grid.rows[Math.floor(grid.rows.length / 2)]!;
        expect(s.add(shade!.manifold.slice(row.z)).toPolygons()).toHaveLength(row.count);
      });
    });
    // The default lattice stays under the cap.
    expect(codes(assemble(geometric({ variant: 'lattice' })))).not.toContain('lattice-cap');
  });

  it('says when no row of holes fits, and when big holes may sag', () => {
    const empty = assemble(geometric({ variant: 'lattice', height: 30, holeSize: 20 }), {
      quality: 'draft',
    });
    expect(latticeGrid(geometricParams(empty)).holes).toBe(0);
    expect(empty.warnings.find((w) => w.code === 'lattice-empty')).toMatchObject({
      severity: 'info',
      paramPath: 'shades.0.style.height',
    });
    withBuilt(k, tracker, shadeOnly(empty), 'draft', ([shade]) => {
      expect(shade!.stats.status).toBe('NoError');
    });
    const big = assemble(geometric({ variant: 'lattice', holeSize: 12, holePitch: 16 }));
    expect(big.warnings.find((w) => w.code === 'bridge')).toMatchObject({
      severity: 'info',
      paramPath: 'shades.0.style.holeSize',
    });
    expect(codes(assemble(geometric({ variant: 'lattice' })))).not.toContain('bridge');
  });

  it('warns about pleats that lean more than 50° and notes shallow ones', () => {
    const steep = assemble(geometric({ variant: 'pleated', pleatDepth: 20, bands: 12 }), {
      quality: 'draft',
    });
    const d = deriveGeometricShade(geometricParams(steep), 'draft');
    expect(d.wallLeanDeg).toBeGreaterThan(GEOMETRIC_MAX_LEAN);
    expect(steep.warnings.find((w) => w.code === 'pleat-overhang')).toMatchObject({
      severity: 'warning',
      paramPath: 'shades.0.style.pleatDepth',
    });
    withBuilt(k, tracker, shadeOnly(steep), 'draft', ([shade]) => {
      expect(shade!.stats.status).toBe('NoError');
      expect(shade!.stats.maxOverhangDeg).toBeCloseTo(d.wallLeanDeg, 9);
    });
    const shallow = assemble(geometric({ variant: 'pleated', pleatDepth: 1 }));
    expect(shallow.warnings.find((w) => w.code === 'pleat-depth')).toMatchObject({
      severity: 'info',
      paramPath: 'shades.0.style.pleatDepth',
    });
    const fine = codes(assemble(geometric({ variant: 'pleated' })));
    expect(fine).not.toContain('pleat-overhang');
    expect(fine).not.toContain('pleat-depth');
  });

  it('warns about pleats closer than two nozzle widths (the pattern period)', () => {
    // No printer's 0.4 mm nozzle gets there within the parameter ranges; a
    // 4 mm one does with 48 pleats at the Ø110 top (7.2 mm apart).
    const a = assemble(geometric({ variant: 'pleated', pleatCount: 48, topDiameter: 110 }));
    expect(codes(a)).not.toContain('pattern-period');
    const params = geometricParams(a);
    const ctx = {
      role: 'outer',
      id: 'shade',
      style: { ...defaultShadeStyle('geometric'), variant: 'pleated', pleatCount: 48 },
      wallThickness: params.wallThickness,
      collar: params.collar,
      joint: params.joint,
      quality: 'draft',
      printer: { ...geometric().printer, nozzle: 4 },
    } as unknown as ShadeCtx<'geometric'>;
    expect(
      SHADE_MODULES.geometric.validate(ctx).find((w) => w.code === 'pattern-period'),
    ).toMatchObject({
      severity: 'warning',
      paramPath: 'shades.0.style.pleatCount',
    });
  });

  it('warns about polygon facets that lean more than 50°', () => {
    const a = assemble(
      geometric({ variant: 'polyhedral', bottomDiameter: 320, topDiameter: 100, height: 40 }),
      { quality: 'draft' },
    );
    const d = deriveGeometricShade(geometricParams(a), 'draft');
    expect(d.wallLeanDeg).toBeGreaterThan(GEOMETRIC_MAX_LEAN);
    expect(a.warnings.find((w) => w.code === 'facet-overhang')).toMatchObject({
      severity: 'warning',
      paramPath: 'shades.0.style.twist',
    });
    expect(codes(assemble(geometric({ variant: 'polyhedral' })))).not.toContain('facet-overhang');
  });
});

describe('the geometric shade’s profile', () => {
  it.each(['polyhedral', 'pleated', 'lattice'] as const)(
    'bounds the %s mesh from outside and inside at every height',
    (variant) => {
      const a = assemble(geometric({ variant }), { quality: 'normal' });
      const params = geometricParams(a);
      const profile = geometricShadeProfile(params);
      const d = deriveGeometricShade(params);
      expect(profile.depth).toBeCloseTo(d.zCollar, 9);
      withBuilt(k, tracker, shadeOnly(a), 'normal', ([shade]) => {
        scoped(k, (s) => {
          for (let z = 0.5; z < d.zCollar - 0.5; z += 3.7) {
            const radii = (s.add(shade!.manifold.slice(z)).toPolygons() as Polygon[]).flatMap((p) =>
              p.map(([x, y]) => Math.hypot(x, y)),
            );
            const zShade = z - d.zCollar;
            expect(Math.max(...radii), `z ${z}`).toBeLessThanOrEqual(
              profile.outerAt(zShade) + 0.05,
            );
            expect(Math.min(...radii), `z ${z}`).toBeGreaterThanOrEqual(
              profile.innerAt(zShade) - 0.05,
            );
          }
        });
      });
    },
  );

  it('lets a revolved inner shade be checked against a geometric outer one', () => {
    const p = withInnerShade(geometric({ variant: 'pleated' }));
    const a = assemble(p, { quality: 'draft' });
    expect(codes(a)).not.toContain('shade-clearance-unchecked');
    expect(a.parts.map((x) => x.id)).toContain(INNER_SHADE_ID);
    expect(errors(a)).toEqual([]);
  });
});

describe('the geometric examples', () => {
  it('the origami pendant hangs a white pleated shade on a cord', () => {
    const project = example('origami-pendant');
    expect(project.name).toBe('Fold');
    expect(project.mount.kind).toBe('ceilingCord');
    expect(project.light.kind).toBe('puck');
    expect(project.hub.fused).toBe(false);
    expect(project.joints.shadeToHub).toBe('bayonet');
    expect(project.shades[0]).toMatchObject({
      colour: '#ffffff',
      style: { family: 'geometric', variant: 'pleated' },
    });
    const a = assemble(project, { quality: 'draft' });
    expect(a.parts.map((p) => p.id)).toEqual(['hub', 'shade', 'canopy']);
    expect(a.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
    withBuilt(k, tracker, a.parts, 'draft', (built) => {
      for (const b of built) expect(b.stats.status, b.part.id).toBe('NoError');
      expect(byId(built, 'shade').stats.maxOverhangDeg).toBeLessThanOrEqual(GEOMETRIC_MAX_LEAN);
    });
  });

  it('the lattice drum hangs a hex lattice under its cap on a cord', () => {
    const project = example('lattice-drum');
    expect(project.name).toBe('Væv');
    expect(project.shades[0].style).toMatchObject({ family: 'geometric', variant: 'lattice' });
    const a = assemble(project, { quality: 'normal' });
    expect(a.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
    expect(codes(a)).not.toContain('lattice-cap');
    const grid = latticeGrid(geometricParams(a));
    expect(grid.holes).toBeGreaterThan(300);
    withBuilt(k, tracker, shadeOnly(a), 'normal', ([shade]) => {
      expect(shade!.stats.status).toBe('NoError');
      expect(shade!.stats.maxOverhangDeg).toBeLessThanOrEqual(GEOMETRIC_MAX_LEAN);
    });
  });
});

describe('the lattice’s build time', () => {
  it('builds the default lattice at normal quality in under 2 s', { timeout: 60_000 }, () => {
    const p = example('pendant-cord');
    p.shades[0].style = { ...defaultShadeStyle('geometric'), variant: 'lattice' };
    const a = assemble(p, { quality: 'normal' });
    const holes = latticeGrid(geometricParams(a)).holes;
    expect(holes).toBeGreaterThan(400);
    withBuilt(k, tracker, shadeOnly(a), 'normal', ([shade]) => {
      expect(shade!.stats.status).toBe('NoError');
      console.info(`default lattice (${holes} holes) at normal: ${shade!.stats.buildMs} ms`);
      expect.soft(shade!.stats.buildMs).toBeLessThan(2000);
    });
  });
});
