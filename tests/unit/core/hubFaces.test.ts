/**
 * The hub's four mount faces (strap, cord boss, male thread stub, female
 * thread bore) and the mount framework that picks them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { HUB_THREAD_BORE, HUB_THREAD_STUB } from '@core/assembly/interfaces.ts';
import { MOUNT_MODULES } from '@core/assembly/mounts/index.ts';
import { scoped, type Kernel } from '@core/geometry/kernel.ts';
import { deriveHub } from '@core/geometry/parts/hub.ts';
import { PUCK_CRUSH } from '@core/geometry/parts/lightInserts.ts';
import type { Assembly } from '@core/model/assembly.ts';
import type { HubMountFaceKind, HubParams } from '@core/model/parts.ts';
import { createDefaultProject, defaultMount, type Project } from '@core/model/project.ts';
import { MOUNT_KINDS, type MountKind } from '@core/schema/defs.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import { contourMaxRadii, contourMinRadii, withBuilt } from '../../helpers/parts.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

const FACE_OF: Readonly<Record<MountKind, HubMountFaceKind>> = {
  ceilingStrap: 'strap',
  ceilingCord: 'cordBoss',
  wallArm: 'threadMale',
  standing: 'threadFemale',
};

function mounted(kind: MountKind): Project {
  const p = createDefaultProject({ id: 'test', updatedAt: '2026-10-21T00:00:00.000Z' });
  p.hub.fused = false; // the strap's hub too
  p.mount = defaultMount(kind);
  return p;
}

function hubOf(a: Assembly) {
  const part = a.parts.find((p) => p.id === 'hub');
  if (part?.kind !== 'hub') throw new Error('no hub');
  return { part, params: part.params as HubParams };
}

describe('the mount registry', () => {
  it('has one module per mount kind', () => {
    for (const kind of MOUNT_KINDS) expect(MOUNT_MODULES[kind].kind).toBe(kind);
  });

  it('the strap holds LED pucks only (an error for any other light)', () => {
    const p = mounted('ceilingStrap');
    const ok = assemble(p);
    expect(ok.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    const strap = MOUNT_MODULES.ceilingStrap;
    const ctx = {
      mount: defaultMount('ceilingStrap'),
      light: { kind: 'bulb' } as unknown as Project['light'],
      envelope: {
        rCore: 30,
        insertDepth: 10,
        cableDiameter: 6,
        cablePath: 'axial' as const,
        heatZone: { z0: -125, z1: -35, rMin: 45 },
      },
      joints: p.joints,
      printer: p.printer,
      colours: {},
      quality: 'draft' as const,
    };
    expect(strap.validate(ctx)).toEqual([
      expect.objectContaining({ severity: 'error', code: 'mount-light', paramPath: 'mount.kind' }),
    ]);
  });

  it.each(MOUNT_KINDS)('%s puts its face on the hub', (kind) => {
    const a = assemble(mounted(kind));
    expect(hubOf(a).params.mountFace.kind).toBe(FACE_OF[kind]);
    expect(a.parts.slice(0, 2).map((p) => p.id)).toEqual(['hub', 'shade']);
  });
});

describe.each(['draft', 'normal'] as const)('hub mount faces at %s quality', (quality) => {
  it.each(MOUNT_KINDS)('the %s hub is a valid solid without leaks', (kind) => {
    const a = assemble(mounted(kind), { quality });
    const { part, params } = hubOf(a);
    const d = deriveHub(params);
    withBuilt(k, tracker, [part], quality, ([hub]) => {
      expect(hub!.stats.status).toBe('NoError');
      expect(hub!.stats.bbox.min[2]).toBeCloseTo(0, 6);
      expect(hub!.stats.bbox.max[2]).toBeCloseTo(d.hubHeight, 3);
      expect(part.bedFootprint!.z).toBeCloseTo(d.hubHeight, 6);
    });
  });
});

describe('closed mount faces', () => {
  it('roof the pocket at 45° and press the puck in from the light face', () => {
    const a = assemble(mounted('ceilingCord'), { quality: 'normal' });
    const { part, params } = hubOf(a);
    const d = deriveHub(params);
    const puck = params.insert;
    if (puck.kind !== 'puck') throw new Error('no puck');
    const ribDepth = puck.clearance + PUCK_CRUSH;
    // The puck rests against the roof, `clearance` above the top of the pocket wall.
    expect(d.zPuck).toBeCloseTo(d.zTop + puck.clearance - puck.height, 9);
    expect(d.zApex).toBeCloseTo(d.zTop + d.rPocket, 9);
    withBuilt(k, tracker, [part], 'normal', ([hub]) => {
      scoped(k, (s) => {
        const m = hub!.manifold;
        // Below the puck the bore is open (no ledge): the pocket's radius.
        expect(contourMinRadii(s.add(m.slice(d.zFloor + 0.2)))[0]).toBeCloseTo(d.rPocket, 1);
        // Among the crush ribs: the ribs reach clearance + crush into the pocket.
        const ribs = contourMinRadii(s.add(m.slice(d.zTop - 1)))[0]!;
        expect(ribs).toBeCloseTo(d.rPocket - ribDepth, 1);
        // In the dome, 10 mm above the pocket: the inner roof is 10 mm narrower.
        const dome = contourMinRadii(s.add(m.slice(d.zTop + 10)))[0]!;
        expect(dome).toBeCloseTo(d.rPocket - 10, 0);
      });
    });
  });

  it('the wall arm: a hollow male stub (root Ø16, 12 mm) on a shoulder', () => {
    const a = assemble(mounted('wallArm'), { quality: 'normal' });
    const { part, params } = hubOf(a);
    const face = params.mountFace;
    if (face.kind !== 'threadMale') throw new Error('no stub');
    expect(face.joint).toMatchObject({
      type: 'thread',
      nominalDiameter: HUB_THREAD_STUB.diameter,
      length: HUB_THREAD_STUB.length,
      male: 'hub',
    });
    const d = deriveHub(params);
    expect(d.hubHeight).toBeCloseTo(d.zFace + 12, 9);
    const depth = face.joint.thread!.depth;
    withBuilt(k, tracker, [part], 'normal', ([hub]) => {
      scoped(k, (s) => {
        // Halfway up the stub: the cable bore inside, the thread outside it.
        const slice = s.add(hub!.manifold.slice(d.zFace + 6));
        const inner = contourMinRadii(slice);
        const outer = contourMaxRadii(slice);
        expect(inner).toHaveLength(2);
        expect(inner[0]).toBeCloseTo((face.cableDiameter + 1) / 2, 1);
        expect(inner[1]).toBeGreaterThan(8 - 0.35);
        expect(inner[1]).toBeLessThan(8 + 0.05);
        expect(outer[1]).toBeCloseTo(8 + depth, 1);
      });
    });
  });

  it('the standing lamp: a female bore (root Ø20 + clearance, 14 mm deep) in a boss', () => {
    const a = assemble(mounted('standing'), { quality: 'normal' });
    const { part, params } = hubOf(a);
    const face = params.mountFace;
    if (face.kind !== 'threadFemale') throw new Error('no bore');
    expect(face.joint).toMatchObject({
      type: 'thread',
      nominalDiameter: HUB_THREAD_BORE.diameter,
      length: HUB_THREAD_BORE.length,
      female: 'hub',
    });
    const d = deriveHub(params);
    const rBore = 10 + face.joint.tolerance;
    const depth = face.joint.thread!.depth;
    withBuilt(k, tracker, [part], 'normal', ([hub]) => {
      scoped(k, (s) => {
        // Halfway down the bore: the threaded bore inside the boss.
        const slice = s.add(hub!.manifold.slice(d.zFace - 7));
        const inner = contourMinRadii(slice);
        const innerMax = contourMaxRadii(slice);
        expect(inner).toHaveLength(2);
        expect(inner[0]).toBeCloseTo(rBore, 1);
        expect(innerMax[0]).toBeCloseTo(rBore + depth, 1);
        expect(inner[1]).toBeGreaterThan(rBore + depth + 2);
      });
    });
  });
});
