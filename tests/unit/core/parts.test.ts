import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { screwJoint } from '@core/assembly/interfaces.ts';
import { buildPart } from '@core/geometry/build.ts';
import { screwPattern } from '@core/geometry/joints/screw.ts';
import {
  dispose,
  liveObjects,
  scoped,
  type CrossSection,
  type Kernel,
  type Manifold,
} from '@core/geometry/kernel.ts';
import { deriveHub, type HubDerived } from '@core/geometry/parts/hub.ts';
import {
  deriveRevolvedShade,
  type RevolvedShadeDerived,
} from '@core/geometry/parts/shades/revolved.ts';
import type { Quality } from '@core/geometry/quality.ts';
import {
  SHADE_JOINT_TYPES,
  type Assembly,
  type PartSpec,
  type PartStats,
  type ShadeJointType,
} from '@core/model/assembly.ts';
import type { HubParams, RevolvedShadeParams } from '@core/model/parts.ts';
import { createDefaultProject, type Project } from '@core/model/project.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

function splitProject(type: ShadeJointType, edit: (p: Project) => void = () => {}): Project {
  const p = createDefaultProject({ id: 'test', updatedAt: '2026-10-21T00:00:00.000Z' });
  p.hub.fused = false;
  p.joints.shadeToHub = type;
  edit(p);
  return p;
}

interface Built {
  part: PartSpec;
  manifold: Manifold;
  stats: PartStats;
}

/** Build every part of an assembly, run the checks, dispose, and assert nothing leaked. */
function withParts(a: Assembly, quality: Quality, check: (built: Built[]) => void): void {
  const liveBefore = liveObjects();
  const kernelBefore = tracker.live();
  const built: Built[] = [];
  try {
    for (const part of a.parts) built.push({ part, ...buildPart(k, part, quality) });
    // Only the results themselves are still alive.
    expect(liveObjects()).toBe(liveBefore + built.length);
    expect(tracker.live()).toBe(kernelBefore + built.length);
    check(built);
  } finally {
    for (const b of built) dispose(b.manifold);
  }
  expect(liveObjects()).toBe(liveBefore);
  expect(tracker.live()).toBe(kernelBefore);
}

const byId = (built: readonly Built[], id: string) => {
  const b = built.find((x) => x.part.id === id);
  if (!b) throw new Error(`no part ${id}`);
  return b;
};

/** Smallest vertex radius of each contour of a section, sorted from the inside out. */
function contourMinRadii(section: CrossSection): number[] {
  return section
    .toPolygons()
    .map((poly) => Math.min(...poly.map(([x, y]) => Math.hypot(x, y))))
    .sort((a, b) => a - b);
}

describe('the fused default project (regression gate)', () => {
  it('builds exactly the classic shade through assemble() and buildPart()', () => {
    const a = assemble(createDefaultProject(), { quality: 'normal' });
    withParts(a, 'normal', ([shade]) => {
      expect(shade!.part).toMatchObject({ id: 'shade', kind: 'shade' });
      expect(shade!.stats.status).toBe('NoError');
      expect(shade!.stats.triangles).toBe(109346);
      expect(shade!.stats.volumeMm3).toBe(61738.017122572855);
    });
  });
});

describe.each(SHADE_JOINT_TYPES)('split lamp with a %s joint', (type) => {
  const a = assemble(splitProject(type), { quality: 'normal' });
  const iface = a.interfaces.shadeToHub!;

  it('builds both parts as valid solids that do not overlap when assembled', () => {
    withParts(a, 'normal', (built) => {
      const hub = byId(built, 'hub');
      const shade = byId(built, 'shade');
      expect(hub.stats.status).toBe('NoError');
      expect(shade.stats.status).toBe('NoError');
      scoped(k, (s) => {
        const matrix = shade.part.assembledTransform as Parameters<Manifold['transform']>[0];
        const placed = s.add(shade.manifold.transform(matrix));
        const overlap = s.add(k.Manifold.intersection(hub.manifold, placed)).volume();
        // Bayonet and thread: none (the parts touch on the seat plane only); the
        // press fit's crush ribs: a sliver by design.
        expect(overlap).toBeLessThan(1);
        if (type !== 'snap') expect(overlap).toBeLessThan(1e-3);

        // Halfway up the collar, the ring's bore is the clearance outside the collar.
        const z = iface.length / 2 + 1e-3;
        const hubBore = contourMinRadii(s.add(hub.manifold.slice(z)))[0]!;
        const collar = contourMinRadii(s.add(placed.slice(z)));
        // Contours of the collar from the inside out: its bore, its outer surface.
        expect(collar).toHaveLength(2);
        expect(Math.abs(hubBore - collar[1]! - iface.tolerance)).toBeLessThan(0.005);
      });
    });
  });
});

describe('the hub alone', () => {
  it('stands on its collar ring with the housing, pocket and strap loops on top', () => {
    const a = assemble(splitProject('bayonet'), { quality: 'draft' });
    const part = a.parts.find((p) => p.kind === 'hub')!;
    const params = part.params as HubParams;
    const d: HubDerived = deriveHub(params);
    withParts({ ...a, parts: [part] }, 'draft', ([hub]) => {
      const { stats, manifold } = hub!;
      expect(stats.status).toBe('NoError');
      expect(stats.derived).toEqual(d);
      const { min, max } = stats.bbox;
      expect(min[2]).toBeCloseTo(0, 6);
      expect(max[2]).toBeCloseTo(d.zTop, 6);
      expect(max[0] - min[0]).toBeCloseTo(2 * d.ringOuterRadius, 1);
      expect(part.bedFootprint!.x).toBeGreaterThanOrEqual(max[0] - min[0] - 1e-6);
      expect(part.bedFootprint!.y).toBeGreaterThanOrEqual(max[1] - min[1] - 1e-6);
      expect(d.collarInnerRadius).toBeCloseTo(34.4, 9);
      scoped(k, (s) => {
        // Just below the mount face: the housing (Ø 2·rBoss along X) with the belt loops on ±Y.
        const top = s.add(manifold.slice(d.zTop - 1)).bounds();
        expect(top.max[0] - top.min[0]).toBeCloseTo(2 * d.rBoss, 0);
        const mount = params.mountFace;
        expect(top.max[1] - top.min[1]).toBeCloseTo(
          2 * (d.rBoss + mount.strapThickness + mount.loopWall),
          3,
        );
        // Through the pocket: the bore is the pocket radius.
        const pocket = contourMinRadii(s.add(manifold.slice(d.zFloor + 1)));
        expect(pocket[0]).toBeCloseTo(d.rPocket, 1);
      });
    });
  });
});

describe('a short hub (thick wall, shallow shoulder)', () => {
  const a = assemble(
    splitProject('bayonet', (p) => {
      p.hub.wallThickness = 5;
      p.hub.shoulderAngle = 40;
    }),
    { quality: 'draft' },
  );
  const hubPart = a.parts.find((p) => p.kind === 'hub')!;
  const params = hubPart.params as HubParams;
  const d = deriveHub(params);

  it('stands tall enough for the strap tunnels to open above its cone', () => {
    const { loopLength, strapThickness, loopWall } = params.mountFace;
    expect(d.zTop - loopLength - strapThickness - loopWall).toBeGreaterThanOrEqual(
      d.zBossStart + 1 - 1e-9,
    );
    // The ledge grew instead of the pocket.
    expect(d.zTop - d.zFloor).toBeCloseTo(d.pocketDepth, 9);
    expect(d.zFloor - d.zHoleBottom).toBeGreaterThan(params.insert.ledgeThickness);
  });

  it('keeps its belt loops out of the shade collar', () => {
    withParts(a, 'draft', (built) => {
      const hub = byId(built, 'hub');
      const shade = byId(built, 'shade');
      expect(hub.stats.status).toBe('NoError');
      scoped(k, (s) => {
        const matrix = shade.part.assembledTransform as Parameters<Manifold['transform']>[0];
        const placed = s.add(shade.manifold.transform(matrix));
        expect(s.add(k.Manifold.intersection(hub.manifold, placed)).volume()).toBeLessThan(1e-3);
      });
    });
  });
});

describe('the shade alone', () => {
  it('stands on its open end with the collar on top', () => {
    const a = assemble(splitProject('bayonet'), { quality: 'draft' });
    const part = a.parts.find((p) => p.id === 'shade')!;
    const params = part.params as RevolvedShadeParams;
    const d: RevolvedShadeDerived = deriveRevolvedShade(params);
    withParts({ ...a, parts: [part] }, 'draft', ([shade]) => {
      const { stats, manifold } = shade!;
      expect(stats.status).toBe('NoError');
      const { min, max } = stats.bbox;
      expect(min[2]).toBeCloseTo(0, 6);
      expect(max[2]).toBeCloseTo(d.zTop, 6);
      expect(d.zTop).toBeCloseTo(d.zCollar + 8, 9);
      // Ribs stand out by half their depth at the open end.
      expect(max[0] - min[0]).toBeCloseTo(params.bottomDiameter + params.surface.ribDepth, 3);
      expect(part.bedFootprint!.z).toBeCloseTo(max[2] - min[2], 6);
      scoped(k, (s) => {
        // The seat: flush with the hub ring's outer radius, just below the collar plane.
        const seat = s.add(manifold.slice(d.zCollar - 0.2)).bounds();
        expect(seat.max[0]).toBeCloseTo(d.rSeat, 1);
        // The collar: a tube from its bore to the collar radius, lugs aside.
        const collar = contourMinRadii(s.add(manifold.slice(d.zCollar + 1)));
        expect(collar[0]).toBeCloseTo(d.rCollarBore, 2);
        expect(collar[1]).toBeCloseTo(d.rCollar, 2);
      });
    });
  });
});

describe('screwPattern', () => {
  const iface = screwJoint('test', { male: 'a', female: 'b' }, 40, { heatSet: true });

  it.each([
    ['male', 'top'],
    ['male', 'bottom'],
    ['female', 'top'],
    ['female', 'bottom'],
  ] as const)('cuts a valid %s side opening on the %s face', (side, face) => {
    const liveBefore = tracker.live();
    scoped(k, (s) => {
      const block = s.add(s.add(k.Manifold.cube([60, 60, 8], true)).translate([0, 0, 4]));
      const cutters = screwPattern(k, iface, side, { z: [0, 8], face, segs: 32 }).map((c) =>
        s.add(c),
      );
      expect(cutters).toHaveLength(4);
      const cut = s.add(k.Manifold.difference([block, ...cutters]));
      expect(cut.status()).toBe('NoError');
      expect(cut.volume()).toBeLessThan(block.volume());
      expect(cut.genus()).toBe(side === 'male' ? 4 : 0);
    });
    expect(tracker.live()).toBe(liveBefore);
  });

  it('uses tapping holes without heat-set inserts', () => {
    const plain = screwJoint('test', { male: 'a', female: 'b' }, 40, { heatSet: false });
    expect(plain.screw!.insertPocket).toBeUndefined();
    scoped(k, (s) => {
      const block = s.add(s.add(k.Manifold.cube([60, 60, 8], true)).translate([0, 0, 4]));
      const cutters = screwPattern(k, plain, 'female', { z: [0, 8], face: 'top', segs: 32 });
      const cut = s.add(k.Manifold.difference([block, ...cutters.map((c) => s.add(c))]));
      expect(cut.status()).toBe('NoError');
    });
  });
});
