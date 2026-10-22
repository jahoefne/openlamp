/**
 * The slatted shade (M3a): valid, leak-free builds over twist, louvre angle
 * and slat count; the slats, the rings and the collar sliced; the lean, gap,
 * ring and thickness rules; the shade in the hub without overlap; the
 * "Slatted drum" example.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { MIN_SLAT_SPAN } from '@core/assembly/shades/index.ts';
import { scoped, type Kernel, type Manifold } from '@core/geometry/kernel.ts';
import {
  MAX_SLAT_COUNT,
  MAX_SLAT_LEAN,
  MIN_SLAT_GAP,
  SLAT_RING_LIP,
  buildSlattedShade,
  deriveSlattedShade,
  slattedShadeFootprint,
  type SlattedShadeDerived,
} from '@core/geometry/parts/shades/slatted.ts';
import type { Quality } from '@core/geometry/quality.ts';
import { SHADE_JOINT_TYPES, type Assembly, type ShadeJointType } from '@core/model/assembly.ts';
import type { SlattedShadeParams } from '@core/model/parts.ts';
import {
  parseProject,
  shadeStyleForFamily,
  type Project,
  type SlattedStyle,
} from '@core/model/project.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import {
  assembled,
  byId,
  contourMinRadii,
  maxOverhangDeg,
  withBuilt,
} from '../../helpers/parts.ts';

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

/** The pendant example (cord, puck, bayonet, Ø150 → Ø136 × 110) with a slatted shade. */
function slatted(edit: (s: SlattedStyle, p: Project) => void = () => {}): Project {
  const p = example('pendant-cord');
  const style = shadeStyleForFamily(p.shades[0].style, 'slatted');
  edit(style, p);
  p.shades[0].style = style;
  return p;
}

function slattedParams(a: Assembly): SlattedShadeParams {
  const part = a.parts.find((p) => p.id === 'shade');
  if (part?.kind !== 'shade' || part.params.variant !== 'slatted') throw new Error('no slats');
  return part.params;
}

const shadeOnly = (a: Assembly) => a.parts.filter((p) => p.id === 'shade');

/** The mesh's steepest overhang between the rings (the slats' faces only, by their centres). */
function slatOverhang(manifold: Manifold, d: SlattedShadeDerived): number {
  const lo = d.ringHeight + 0.5;
  const hi = d.H - d.ringHeight - 0.5;
  return maxOverhangDeg(manifold, {
    ignore: (tri) => {
      const z = (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
      return z < lo || z > hi;
    },
  });
}

describe('the slatted shade builds', () => {
  const cases: [number, number, number, Quality][] = [];
  for (const q of ['draft', 'normal'] as const) {
    for (const twist of [0, 15, -30]) {
      for (const louvre of [0, 20]) {
        for (const n of [12, 24, 48]) cases.push([twist, louvre, n, q]);
      }
    }
  }

  it.each(cases)(
    'twist %d°, louvre %d°, %d slats at %s quality: a valid solid without leaks, one contour per slat',
    (twist, louvre, n, q) => {
      const a = assemble(
        slatted((s) => {
          s.twist = twist;
          s.louvreAngle = louvre;
          s.slatCount = n;
          // 48 slats need narrower ones to stay apart at the Ø136 top ring.
          s.slatWidth = n === 48 ? 6 : 12;
        }),
        { quality: q },
      );
      expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
      const params = slattedParams(a);
      const d = deriveSlattedShade(params);
      expect(d.slatCount).toBe(n);
      expect(d.gapMin).toBeGreaterThanOrEqual(MIN_SLAT_GAP);
      withBuilt(k, tracker, shadeOnly(a), q, ([shade]) => {
        const { stats, manifold } = shade!;
        expect(stats.status).toBe('NoError');
        // Open end (the bottom ring) on the bed, the collar on top.
        expect(stats.bbox.min[2]).toBeCloseTo(0, 6);
        expect(stats.bbox.max[2]).toBeCloseTo(d.zTop, 6);
        // The footprint is the bounding box: the slats stay inside the rings.
        const f = slattedShadeFootprint(params);
        expect(stats.bbox.max[0] - stats.bbox.min[0]).toBeLessThanOrEqual(f.x + 1e-6);
        expect(stats.bbox.max[0] - stats.bbox.min[0]).toBeCloseTo(params.bottomDiameter, 1);
        expect(f.z).toBeCloseTo(stats.bbox.max[2], 6);
        expect(stats.maxOverhangDeg).toBeCloseTo(Math.max(d.leanDeg, 45), 9);
        expect(slatOverhang(manifold, d)).toBeLessThanOrEqual(d.leanDeg + 0.5);
        scoped(k, (s) => {
          // Halfway up only the slats: exactly one separate contour each.
          const mid = s.add(manifold.slice(d.H / 2));
          expect(mid.toPolygons()).toHaveLength(n);
        });
      });
    },
  );
});

describe('the slatted shade’s rings and collar', () => {
  const a = assemble(slatted(), { quality: 'normal' });
  const params = slattedParams(a);
  const d = deriveSlattedShade(params);

  it('has 24 slats of 12 × 2.4 mm halfway up', () => {
    withBuilt(k, tracker, shadeOnly(a), 'normal', ([shade]) => {
      scoped(k, (s) => {
        const mid = s.add(shade!.manifold.slice(d.H / 2));
        const polys = mid.toPolygons();
        expect(polys).toHaveLength(24);
        const area = s.add(new k.CrossSection([polys[0]!])).area();
        expect(area).toBeCloseTo(12 * 2.4, 3);
      });
    });
  });

  it('holds the slats in the rings and ends in the collar’s bore and seat', () => {
    withBuilt(k, tracker, shadeOnly(a), 'normal', ([shade]) => {
      const m = shade!.manifold;
      scoped(k, (s) => {
        // The bottom ring: one annulus from its inner radius to the bottom Ø.
        const bottom = s.add(m.slice(d.ringHeight / 4));
        expect(bottom.toPolygons()).toHaveLength(2);
        expect(bottom.bounds().max[0]).toBeCloseTo(d.rBot, 6);
        expect(contourMinRadii(bottom)[0]).toBeCloseTo(d.rBotInner, 1);
        expect(d.rBot - d.rBotInner).toBeGreaterThan(
          params.slatThickness + 2 * SLAT_RING_LIP - 1e-9,
        );
        // The top ring, likewise.
        const top = s.add(m.slice(d.H - d.ringHeight / 4));
        expect(top.toPolygons()).toHaveLength(2);
        expect(top.bounds().max[0]).toBeCloseTo(d.rTop, 6);
        expect(contourMinRadii(top)[0]).toBeCloseTo(d.rTopInner, 1);
        // Under the collar plane: the seat flush with the hub ring, the bore the collar's.
        const seat = s.add(m.slice(d.zCollar - 0.2));
        expect(seat.bounds().max[0]).toBeCloseTo(d.rSeat, 6);
        expect(contourMinRadii(seat)[0]).toBeCloseTo(d.rCollarBore, 1);
        expect(d.rCollarBore).toBeCloseTo(params.collar.radius - params.collar.wall, 9);
        // The collar tube from its bore to the collar radius (the lugs aside).
        const collar = contourMinRadii(s.add(m.slice(d.zCollar + 1)));
        expect(collar[0]).toBeCloseTo(d.rCollarBore, 2);
        expect(collar[1]).toBeCloseTo(d.rCollar, 2);
      });
    });
  });

  it.each(SHADE_JOINT_TYPES)(
    'hangs from the hub on a %s joint without overlapping it',
    (type: ShadeJointType) => {
      const p = slatted();
      p.joints.shadeToHub = type;
      const lamp = assemble(p, { quality: 'draft' });
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
});

describe('the slatted shade’s rules', () => {
  const codes = (a: Assembly) => a.warnings.map((w) => w.code);

  it('warns when the slats lean more than 50° (a short shade twisted 60°)', () => {
    const a = assemble(
      slatted((s) => {
        s.height = 60;
        s.twist = 60;
      }),
      { quality: 'draft' },
    );
    const d = deriveSlattedShade(slattedParams(a));
    expect(d.leanDeg).toBeGreaterThan(MAX_SLAT_LEAN);
    expect(a.warnings.find((w) => w.code === 'slat-lean')).toMatchObject({
      severity: 'warning',
      partId: 'shade',
      paramPath: 'shades.0.style.twist',
    });
    withBuilt(k, tracker, shadeOnly(a), 'draft', ([shade]) => {
      expect(shade!.stats.status).toBe('NoError');
      expect(shade!.stats.maxOverhangDeg).toBeCloseTo(d.leanDeg, 9);
      expect(slatOverhang(shade!.manifold, d)).toBeGreaterThan(MAX_SLAT_LEAN - 5);
    });
    // The default shade (twist 0 on 110 mm) leans a few degrees only.
    expect(codes(assemble(slatted()))).not.toContain('slat-lean');
  });

  it('reduces the slat count when the slats would touch at the narrowest ring', () => {
    const a = assemble(
      slatted((s) => {
        s.slatCount = 60;
      }),
      { quality: 'draft' },
    );
    const w = a.warnings.find((x) => x.paramPath === 'shades.0.style.slatCount');
    expect(w).toMatchObject({ severity: 'warning', code: 'adjusted', partId: 'shade' });
    expect(w!.message).toMatch(/^slatCount reduced to \d+ /);
    const params = slattedParams(a);
    expect(params.slatCount).toBeLessThan(60);
    const d = deriveSlattedShade(params);
    expect(d.gapMin).toBeGreaterThanOrEqual(MIN_SLAT_GAP);
    expect(d.maxSlats).toBe(params.slatCount);
    // One more would touch.
    expect(deriveSlattedShade({ ...params, slatCount: params.slatCount + 1 }).gapMin).toBeLessThan(
      MIN_SLAT_GAP,
    );
    withBuilt(k, tracker, shadeOnly(a), 'draft', ([shade]) => {
      scoped(k, (s) => {
        const mid = s.add(shade!.manifold.slice(d.H / 2));
        expect(mid.toPolygons()).toHaveLength(params.slatCount);
      });
    });
  });

  it('counts the gap at the top as the collar widens it', () => {
    // A top too narrow for the collar is widened first; the slats are counted on the wider ring.
    const a = assemble(
      slatted((s) => {
        s.topDiameter = 60;
        s.slatCount = 96;
      }),
      { quality: 'draft' },
    );
    const params = slattedParams(a);
    expect(params.topDiameter).toBe(78);
    expect(deriveSlattedShade(params).gapMin).toBeGreaterThanOrEqual(MIN_SLAT_GAP);
  });

  it('keeps 10 mm of slat between the rings', () => {
    const a = assemble(
      slatted((s) => {
        s.height = 40;
        s.ringHeight = 30;
      }),
      { quality: 'draft' },
    );
    expect(a.warnings.find((w) => w.paramPath === 'shades.0.style.ringHeight')).toMatchObject({
      code: 'adjusted',
      partId: 'shade',
    });
    const params = slattedParams(a);
    expect(params.ringHeight).toBe((40 - MIN_SLAT_SPAN) / 2);
  });

  it('notes slats thinner than two nozzle widths and long bridges under the top ring', () => {
    // With a 0.6 mm nozzle a 1 mm slat gets fewer than two perimeters.
    const thin = assemble(
      slatted((s, p) => {
        s.slatThickness = 1;
        p.printer = { ...p.printer, nozzle: 0.6 };
      }),
    );
    expect(thin.warnings.find((w) => w.code === 'slat-thickness')).toMatchObject({
      severity: 'info',
      paramPath: 'shades.0.style.slatThickness',
    });
    expect(codes(assemble(slatted()))).not.toContain('slat-thickness');
    const sparse = assemble(
      slatted((s) => {
        s.slatCount = 8;
      }),
    );
    expect(sparse.warnings.find((w) => w.code === 'bridge')).toMatchObject({
      severity: 'info',
      partId: 'shade',
    });
    expect(codes(assemble(slatted()))).not.toContain('bridge');
  });

  it('never builds more than the slat count’s maximum, whatever its params say', () => {
    const params = slattedParams(assemble(slatted(), { quality: 'draft' }));
    const d = deriveSlattedShade({ ...params, slatCount: 1e9 });
    expect(d.slatCount).toBe(MAX_SLAT_COUNT);
    expect(deriveSlattedShade({ ...params, slatCount: Number.NaN }).slatCount).toBe(1);
    const built = buildSlattedShade(k, { ...params, slatCount: 1e6 }, 'draft');
    try {
      expect(built.stats.status).toBe('NoError');
      expect(built.stats.derived.slatCount).toBe(MAX_SLAT_COUNT);
    } finally {
      built.manifold.delete();
    }
  });
});

describe('the Slatted drum example', () => {
  it('hangs a twisted slatted shade from a split hub on a cord and builds', () => {
    const p = example('slatted-drum');
    expect(p.name).toBe('Slatted drum');
    expect(p.mount.kind).toBe('ceilingCord');
    expect(p.light.kind).toBe('puck');
    expect(p.hub.fused).toBe(false);
    expect(p.joints.shadeToHub).toBe('bayonet');
    expect(p.shades[0]).toMatchObject({
      colour: '#b98a52',
      style: { family: 'slatted', twist: 15 },
    });
    const a = assemble(p, { quality: 'draft' });
    expect(a.parts.map((x) => x.id)).toEqual(['hub', 'shade', 'canopy']);
    expect(a.warnings).toEqual([]);
    expect(slattedParams(a)).toMatchObject({ variant: 'slatted', twist: 15, slatCount: 24 });
    withBuilt(k, tracker, a.parts, 'draft', (built) => {
      for (const b of built) expect(b.stats.status, b.part.id).toBe('NoError');
    });
  });
});
