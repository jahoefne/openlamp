/**
 * The pendant on a cord: assembly (snapshots, placement), the hub's cord
 * boss, the canopy and the collet's cord grip.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { CORD_GRIP_TRAVEL, ceilingCordMount } from '@core/assembly/mounts/ceilingCord.ts';
import { scoped, type Kernel } from '@core/geometry/kernel.ts';
import { deriveCanopy } from '@core/geometry/parts/canopy.ts';
import { deriveCordGrip } from '@core/geometry/parts/cordGrip.ts';
import { deriveHub } from '@core/geometry/parts/hub.ts';
import { cordBossDims } from '@core/geometry/parts/mountFaces.ts';
import type { Assembly } from '@core/model/assembly.ts';
import type { CanopyParams, HubParams } from '@core/model/parts.ts';
import {
  createDefaultProject,
  defaultMount,
  type MountOf,
  type Project,
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

type CordMount = MountOf<'ceilingCord'>;

function pendant(edit: (mount: CordMount, p: Project) => void = () => {}): Project {
  const p = createDefaultProject({
    id: 'test',
    name: 'Test',
    updatedAt: '2026-10-21T00:00:00.000Z',
  });
  const mount = defaultMount('ceilingCord');
  edit(mount, p);
  p.mount = mount;
  return p;
}

const collet = (m: CordMount) => {
  m.grip = 'collet';
};

/** The assembly without the numbers that only restate the params (as in assemble.test.ts). */
function summary(a: Assembly) {
  return {
    parts: a.parts.map(({ buildKey, ...part }) => ({ ...part, buildKeyLength: buildKey.length })),
    interfaces: a.interfaces,
    layout: a.layout,
    derived: a.derived,
    context: a.context,
    warnings: a.warnings,
  };
}

function hubParams(a: Assembly): HubParams {
  const part = a.parts.find((p) => p.id === 'hub');
  if (part?.kind !== 'hub') throw new Error('no hub');
  return part.params;
}

function canopyParams(a: Assembly): CanopyParams {
  const part = a.parts.find((p) => p.id === 'canopy');
  if (part?.kind !== 'canopy') throw new Error('no canopy');
  return part.params;
}

describe('assemble (pendant on a cord)', () => {
  it('splits the lamp (fused is a strap-only option) and adds the canopy', () => {
    const p = pendant();
    expect(p.hub.fused).toBe(true);
    const a = assemble(p);
    expect(a.parts.map((x) => [x.id, x.kind, x.displayName])).toEqual([
      ['hub', 'hub', 'Hub'],
      ['shade', 'shade', 'Shade'],
      ['canopy', 'canopy', 'Canopy'],
    ]);
    expect(hubParams(a).mountFace).toEqual({ kind: 'cordBoss', cordDiameter: 4 });
    expect(a.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
  });

  it('hangs the canopy dropLength above the hub and the ceiling on top of it', () => {
    const a = assemble(pendant());
    const hd = deriveHub(hubParams(a));
    const canopyZ = hd.hubHeight + 600;
    expect(a.derived).toMatchObject({
      hubHeight: hd.hubHeight,
      cordZ0: hd.hubHeight,
      cordZ1: canopyZ,
      canopyZ,
      ceilingZ: canopyZ + 25,
      ceilingGap: 0,
      cordDiameter: 4,
      puckZ: hd.zPuck,
    });
    expect(a.context).toEqual({
      kind: 'ceiling',
      ceilingZ: canopyZ + 25,
      cord: { z0: hd.hubHeight, z1: canopyZ, diameter: 4 },
    });
    // The canopy is flipped (ceiling face up) and lifted to the ceiling.
    const t = a.parts.find((x) => x.id === 'canopy')!.assembledTransform;
    expect(t).toEqual([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, canopyZ + 25, 1]);
  });

  it('adds the cord grip on a thread joint with a collet', () => {
    const a = assemble(pendant(collet));
    expect(a.parts.map((x) => x.id)).toEqual(['hub', 'shade', 'canopy', 'cordGrip']);
    const iface = a.interfaces.canopyToGrip!;
    expect(iface).toMatchObject({
      type: 'thread',
      nominalDiameter: 16,
      length: 10,
      tolerance: 0.3,
      thread: { pitch: 2.5, depth: 0.8, flank: 45, hand: 'right' },
      male: 'canopy',
      female: 'cordGrip',
    });
    const grip = a.parts.find((x) => x.id === 'cordGrip')!;
    if (grip.kind !== 'cordGrip') throw new Error('no grip');
    expect(grip.params.joint).toEqual(iface);
    expect(canopyParams(a).collet?.joint).toEqual(iface);
    expect(grip.printNotes.join(' ')).toContain('PETG');
  });

  it('keeps the screw slots inside the canopy', () => {
    const adjusted = ceilingCordMount.normalize!({
      ...defaultMount('ceilingCord'),
      canopy: { diameter: 60, height: 25, screwSpacing: 80 },
    });
    expect(adjusted.mount.canopy.screwSpacing).toBe(39);
    expect(adjusted.warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['adjusted', 'mount.canopy.screwSpacing'],
    ]);
    const a = assemble(
      pendant((m) => {
        m.canopy.screwSpacing = 140;
      }),
    );
    expect(canopyParams(a).screwSpacing).toBe(69);
    expect(a.warnings.map((w) => w.paramPath)).toContain('mount.canopy.screwSpacing');
  });

  it("prints the shade joint's test pair in fit-test mode, without the canopy", () => {
    const a = assemble(
      pendant((_m, p) => {
        p.fitTest = true;
      }),
    );
    expect(a.parts.map((x) => x.id)).toEqual(['fitMale', 'fitFemale']);
    expect(a.derived.bottomZ).toBe(-3);
  });

  it('matches the knot snapshot', () => {
    expect(summary(assemble(pendant()))).toMatchSnapshot();
  });

  it('matches the collet snapshot', () => {
    expect(summary(assemble(pendant(collet)))).toMatchSnapshot();
  });
});

describe.each(['draft', 'normal'] as const)('the pendant parts at %s quality', (quality) => {
  it.each(['knot', 'collet'] as const)('build as valid solids without leaks (%s)', (grip) => {
    const a = assemble(
      pendant((m) => {
        m.grip = grip;
      }),
      { quality },
    );
    withBuilt(k, tracker, a.parts, quality, (built) => {
      for (const b of built) expect(b.stats.status, b.part.id).toBe('NoError');
      expect(built.map((b) => b.part.id)).toEqual(
        grip === 'collet' ? ['hub', 'shade', 'canopy', 'cordGrip'] : ['hub', 'shade', 'canopy'],
      );
    });
  });
});

describe('the canopy', () => {
  it.each(['knot', 'collet'] as const)(
    'prints ceiling face down without overhangs beyond 45° (%s)',
    (grip) => {
      const a = assemble(
        pendant((m) => {
          m.grip = grip;
        }),
        { quality: 'normal' },
      );
      const part = a.parts.find((x) => x.id === 'canopy')!;
      const { H } = deriveCanopy(canopyParams(a));
      withBuilt(k, tracker, [part], 'normal', ([canopy]) => {
        const { stats, manifold } = canopy!;
        expect(stats.maxOverhangDeg).toBeLessThanOrEqual(45);
        // Everything but the collet's thread (above the top), measured on the mesh.
        const neck = (tri: readonly (readonly number[])[]) => tri.every((v) => v[2]! >= H - 1e-3);
        expect(maxOverhangDeg(manifold, { ignore: neck })).toBeLessThanOrEqual(45 + 0.5);
        expect(stats.bbox.min[2]).toBeCloseTo(0, 6);
      });
    },
  );

  it('has the cord hole, the recess for the knot and two screw slots', () => {
    const a = assemble(pendant(), { quality: 'draft' });
    const part = a.parts.find((x) => x.id === 'canopy')!;
    const d = deriveCanopy(canopyParams(a));
    withBuilt(k, tracker, [part], 'draft', ([canopy]) => {
      scoped(k, (s) => {
        // Just under the top: the cord hole (Ø cord + 1) and the outside.
        const top = contourMinRadii(s.add(canopy!.manifold.slice(d.H - 0.5)));
        expect(top[0]).toBeCloseTo(2.5, 1);
        // Low down: the recess (45°) inside, the screw slots around it.
        const low = s.add(canopy!.manifold.slice(1));
        const radii = contourMinRadii(low);
        expect(radii[0]).toBeCloseTo(d.rRecess - 1, 0);
        // Recess, outline + 2 slots (the slots are holes in the body).
        expect(low.toPolygons()).toHaveLength(4);
      });
    });
  });
});

describe('the collet and the cord grip', () => {
  it('do not overlap when assembled (the threads mate with clearance)', () => {
    const a = assemble(pendant(collet), { quality: 'normal' });
    const parts = a.parts.filter((x) => x.id === 'canopy' || x.id === 'cordGrip');
    withBuilt(k, tracker, parts, 'normal', (built) => {
      scoped(k, (s) => {
        const canopy = s.add(assembled(byId(built, 'canopy')));
        const grip = s.add(assembled(byId(built, 'cordGrip')));
        expect(s.add(k.Manifold.intersection(canopy, grip)).volume()).toBeLessThan(1);
        // The grip sits `travel` under the canopy's room side, around the neck.
        const gb = grip.boundingBox();
        expect(gb.max[2]).toBeCloseTo(a.derived.canopyZ! - CORD_GRIP_TRAVEL, 3);
      });
    });
  });

  it('the grip prints open end down without overhangs beyond 45°', () => {
    const a = assemble(pendant(collet), { quality: 'normal' });
    const part = a.parts.find((x) => x.id === 'cordGrip')!;
    if (part.kind !== 'cordGrip') throw new Error('no grip');
    const d = deriveCordGrip(part.params);
    const depth = part.params.joint.thread!.depth;
    // The thread's twisted facets (see maxOverhangDeg) are left out.
    const thread = (tri: readonly (readonly number[])[]) =>
      tri.every((v) => {
        const r = Math.hypot(v[0]!, v[1]!);
        return r > d.rBore - 0.05 && r < d.rBore + depth + 0.05;
      });
    withBuilt(k, tracker, [part], 'normal', ([grip]) => {
      expect(grip!.stats.status).toBe('NoError');
      expect(maxOverhangDeg(grip!.manifold, { ignore: thread })).toBeLessThanOrEqual(45 + 0.5);
    });
  });
});

describe('the hub of a pendant', () => {
  it('has a cord hole of Ø cord + 1 through its boss into the knot cavity', () => {
    const a = assemble(pendant(), { quality: 'normal' });
    const params = hubParams(a);
    const face = params.mountFace;
    if (face.kind !== 'cordBoss') throw new Error('no cord boss');
    const d = deriveHub(params);
    const { rHole, rKnot, knotHeight } = cordBossDims(face);
    const part = a.parts.find((x) => x.id === 'hub')!;
    withBuilt(k, tracker, [part], 'normal', ([hub]) => {
      const { manifold, stats } = hub!;
      expect(stats.status).toBe('NoError');
      expect(stats.bbox.max[2]).toBeCloseTo(d.hubHeight, 6);
      scoped(k, (s) => {
        // In the boss, above the knot cavity: the hole, then the boss's outside.
        const boss = contourMinRadii(s.add(manifold.slice(d.zFace - 1)));
        expect(boss).toHaveLength(2);
        expect(boss[0]).toBeCloseTo(rHole, 1);
        expect(boss[0]).toBeCloseTo((face.cordDiameter + 1) / 2, 1);
        // In the knot cavity: Ø 3.5 × cord.
        const cavity = contourMinRadii(s.add(manifold.slice(d.zApex - rKnot + knotHeight / 2)));
        expect(cavity[0]).toBeCloseTo(rKnot, 1);
        // The hole goes all the way: the hub's top is an annulus around it, and
        // nothing closes it between the cavity and the top.
        for (const z of [d.zFace - 0.2, d.zApex - rKnot + knotHeight + 0.5, d.zApex - 1]) {
          const radii = contourMinRadii(s.add(manifold.slice(z)));
          expect(radii[0], `z ${z}`).toBeGreaterThan(rHole - 0.1);
        }
        // The pocket is open to the light face: its bore at the puck's height is the pocket's.
        const pocket = contourMinRadii(s.add(manifold.slice(d.zPuck)));
        expect(pocket[0]).toBeCloseTo(d.rPocket, 0);
      });
    });
  });
});
