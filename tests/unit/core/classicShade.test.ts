import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dispose, liveObjects, scoped, type Kernel } from '@core/geometry/kernel.ts';
import {
  buildClassicShade,
  classicShadeFootprint,
  derive,
  type ClassicShadeParams,
} from '@core/geometry/parts/classicShade.ts';
import { SURFACE_STYLES } from '@core/geometry/surface.ts';
import { CLASSIC_SHADE_DEFAULTS } from '@core/schema/defs.ts';
import { normalizeClassicShade } from '@core/schema/normalize.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

function params(input: Partial<ClassicShadeParams> = {}): ClassicShadeParams {
  return normalizeClassicShade({ ...CLASSIC_SHADE_DEFAULTS, ...input }).values;
}

/** Build, run the checks, dispose, and assert nothing leaked. */
function withShade(
  p: ClassicShadeParams,
  check: (built: ReturnType<typeof buildClassicShade>) => void,
): void {
  const liveBefore = liveObjects();
  const kernelBefore = tracker.live();
  const built = buildClassicShade(k, p);
  try {
    // Only the result itself is still alive.
    expect(liveObjects()).toBe(liveBefore + 1);
    expect(tracker.live()).toBe(kernelBefore + 1);
    check(built);
  } finally {
    dispose(built.manifold);
  }
  expect(liveObjects()).toBe(liveBefore);
  expect(tracker.live()).toBe(kernelBefore);
}

describe('buildClassicShade', () => {
  it('builds the default shade at draft quality', () => {
    withShade(params({ quality: 'draft' }), ({ stats }) => {
      expect(stats.status).toBe('NoError');
    });
  });

  it('reproduces the default shade exactly at normal quality', () => {
    const p = params({ quality: 'normal' });
    const d = derive(p);
    withShade(p, ({ manifold, stats }) => {
      expect(stats.status).toBe('NoError');
      expect(stats.triangles).toBe(109346);
      expect(stats.volumeMm3).toBeCloseTo(61738.017, 3);
      const { min, max } = stats.bbox;
      expect(min[2]).toBeCloseTo(0, 6);
      expect(max[2] - min[2]).toBeCloseTo(d.zTop, 6);
      // Ribs stand out by half their depth at the bottom edge.
      expect(max[0] - min[0]).toBeCloseTo(p.bottomDiameter + p.ribDepth, 3);
      expect(stats.derived.zTop).toBe(d.zTop);

      // Just below the top: the housing (Ø 2·rBoss along X) with the belt loops on ±Y.
      scoped(k, (s) => {
        const section = s.add(manifold.slice(d.zTop - 1));
        const b = section.bounds();
        expect(b.max[0] - b.min[0]).toBeCloseTo(2 * d.rBoss, 0);
        expect(b.min[0]).toBeCloseTo(-d.rBoss, 3);
        expect(b.max[1] - b.min[1]).toBeCloseTo(2 * (d.rBoss + p.strapThickness + p.loopWall), 3);
      });
    });
  });

  it.each(SURFACE_STYLES)('builds the %s style', (style) => {
    withShade(params({ style, quality: 'draft' }), ({ stats }) => {
      expect(stats.status).toBe('NoError');
      if (style === 'smooth') {
        expect(stats.bbox.max[0] - stats.bbox.min[0]).toBeCloseTo(160, 3);
      }
    });
  });

  it('builds the fit-test ring standing on the bed', () => {
    const p = params({ fitTest: 'yes', quality: 'draft' });
    withShade(p, ({ stats }) => {
      expect(stats.status).toBe('NoError');
      expect(stats.bbox.min[2]).toBeCloseTo(0, 6);
      expect(stats.derived.zOffset).toBeLessThan(0);
      const f = classicShadeFootprint(p);
      expect(stats.bbox.max[0] - stats.bbox.min[0]).toBeCloseTo(f.x, 3);
      expect(stats.bbox.max[1] - stats.bbox.min[1]).toBeCloseTo(f.y, 3);
      expect(stats.bbox.max[2] - stats.bbox.min[2]).toBeCloseTo(f.z, 3);
    });
  });

  it('estimates a footprint that contains the built bounding box', () => {
    for (const style of SURFACE_STYLES) {
      const p = params({ style, curve: 0.8, patternCount: 8, quality: 'draft' });
      const f = classicShadeFootprint(p);
      withShade(p, ({ stats }) => {
        const { min, max } = stats.bbox;
        expect(max[0] - min[0]).toBeLessThanOrEqual(f.x + 1e-6);
        expect(max[1] - min[1]).toBeLessThanOrEqual(f.y + 1e-6);
        expect(max[2] - min[2]).toBeCloseTo(f.z, 6);
      });
    }
  });
});

describe('scoped', () => {
  it('deletes everything it tracked when the builder throws', () => {
    const liveBefore = liveObjects();
    const kernelBefore = tracker.live();
    expect(() =>
      scoped(k, (s) => {
        const a = s.add(k.Manifold.cube(10));
        s.keep(s.add(a.translate([1, 0, 0])));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(liveObjects()).toBe(liveBefore);
    expect(tracker.live()).toBe(kernelBefore);
  });

  it('swap deletes the old object at once and keeps the new one tracked', () => {
    const kernelBefore = tracker.live();
    const kept = scoped(k, (s) => {
      let body = s.add(k.Manifold.cube(10));
      body = s.swap(body, body.translate([0, 0, 1]));
      expect(tracker.live()).toBe(kernelBefore + 1);
      return s.keep(body);
    });
    expect(kept.boundingBox().min[2]).toBeCloseTo(1, 9);
    dispose(kept);
    expect(tracker.live()).toBe(kernelBefore);
  });

  it('the kernel tracker sees objects nobody tracked', () => {
    const before = tracker.live();
    const leaked = k.Manifold.cube(1).translate([1, 1, 1]); // the cube itself leaks
    expect(tracker.live()).toBe(before + 2);
    leaked.delete();
    expect(tracker.live()).toBe(before + 1);
  });
});
