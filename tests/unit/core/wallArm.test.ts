/**
 * The wall lamp: assembly (snapshot, placement, normalisation, warnings), the
 * hub's stub in the arm's end boss, the arm (cable bore, flange, overhangs)
 * and the wall plate (keyholes, cable slot, pockets).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { ARM_BOLT_CIRCLE, wallArmMount } from '@core/assembly/mounts/wallArm.ts';
import { applyToPoint } from '@core/assembly/transforms.ts';
import { screwPositions } from '@core/geometry/joints/screw.ts';
import { scoped, type CrossSection, type Kernel } from '@core/geometry/kernel.ts';
import { deriveHub } from '@core/geometry/parts/hub.ts';
import { deriveWallArm } from '@core/geometry/parts/wallArm.ts';
import { deriveWallPlate } from '@core/geometry/parts/wallPlate.ts';
import type { Assembly, PartSpec } from '@core/model/assembly.ts';
import type { HubParams, WallArmParams, WallPlateParams } from '@core/model/parts.ts';
import {
  createDefaultProject,
  defaultMount,
  parseProject,
  type MountOf,
  type Project,
} from '@core/model/project.ts';
import { ARM_SHAPES } from '@core/schema/defs.ts';
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

type WallMount = MountOf<'wallArm'>;
type Shape = WallMount['arm']['shape'];

function wallLamp(edit: (mount: WallMount, p: Project) => void = () => {}): Project {
  const p = createDefaultProject({
    id: 'test',
    name: 'Test',
    updatedAt: '2026-10-21T00:00:00.000Z',
  });
  const mount = defaultMount('wallArm');
  edit(mount, p);
  p.mount = mount;
  return p;
}

const shaped =
  (shape: Shape, riseAngle = 20) =>
  (m: WallMount) => {
    m.arm.shape = shape;
    m.arm.riseAngle = riseAngle;
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

function part(a: Assembly, id: string): PartSpec {
  const p = a.parts.find((x) => x.id === id);
  if (!p) throw new Error(`no part ${id}`);
  return p;
}
const hubParams = (a: Assembly) => part(a, 'hub').params as HubParams;
const armParams = (a: Assembly) => part(a, 'wallArm').params as WallArmParams;
const plateParams = (a: Assembly) => part(a, 'wallPlate').params as WallPlateParams;

/** Whether a disc of radius r at (x, y) lies in a hole of the section (no material under it). */
function inHole(section: CrossSection, x: number, y: number, r: number): boolean {
  return scoped(k, (s) => {
    const probe = s.add(s.add(k.CrossSection.circle(r, 32)).translate([x, y]));
    const union = s.add(k.CrossSection.union(section, probe));
    return union.area() - section.area() > probe.area() - 1e-3;
  });
}

/** Height (print y, arm frame) of the arm's centre line at print height z. */
function centreY(params: WallArmParams, z: number): number {
  const d = deriveWallArm(params);
  if (d.shapeIndex === 1) return z * Math.tan((d.rise * Math.PI) / 180);
  if (d.shapeIndex === 2) return d.bendRadius - Math.sqrt(d.bendRadius ** 2 - z ** 2);
  return 0;
}

describe('assemble (wall arm)', () => {
  it('adds the wall plate and the arm, on a thread joint to the hub and screws to the plate', () => {
    const a = assemble(wallLamp());
    expect(a.parts.map((x) => [x.id, x.kind, x.displayName])).toEqual([
      ['hub', 'hub', 'Hub'],
      ['shade', 'shade', 'Shade'],
      ['wallPlate', 'wallPlate', 'Wall plate'],
      ['wallArm', 'wallArm', 'Wall arm'],
    ]);
    expect(Object.keys(a.interfaces)).toEqual(['shadeToHub', 'hubToArm', 'armToPlate']);
    const hubToArm = a.interfaces.hubToArm!;
    expect(hubToArm).toMatchObject({
      type: 'thread',
      nominalDiameter: 16,
      length: 12,
      tolerance: 0.3,
      thread: { pitch: 2.5, depth: 0.8, flank: 45, hand: 'right' },
      male: 'hub',
      female: 'wallArm',
    });
    const face = hubParams(a).mountFace;
    expect(face).toEqual({ kind: 'threadMale', joint: hubToArm, cableDiameter: 6 });
    expect(armParams(a).hubJoint).toEqual(hubToArm);
    const screws = a.interfaces.armToPlate!;
    expect(screws).toMatchObject({
      type: 'screw',
      nominalDiameter: ARM_BOLT_CIRCLE,
      screw: { count: 4, hole: 3.4, counterbore: [6, 3], insertPocket: [4, 6] },
      male: 'wallArm',
      female: 'wallPlate',
    });
    expect(armParams(a).plateScrews).toEqual(screws);
    expect(plateParams(a).armScrews).toEqual(screws);
    // The default 250 mm arm stands 264 mm tall on its flange: too tall for the A1.
    expect(a.warnings.map((w) => [w.severity, w.code, w.partId])).toEqual([
      ['warning', 'bed-fit', 'wallArm'],
    ]);
    expect(a.warnings[0]!.message).toContain('too large in Z');
    expect(part(a, 'wallArm').printNotes.join(' ')).toContain('standing on its flange');
    expect(part(a, 'wallPlate').printNotes.join(' ')).toContain('heat-set inserts');
  });

  it('hangs the hub at the origin and puts the plate on the wall plane behind it', () => {
    const a = assemble(wallLamp());
    const hub = part(a, 'hub');
    const hd = deriveHub(hubParams(a));
    const arm = armParams(a);
    const d = deriveWallArm(arm);
    const t = plateParams(a).thickness;
    const wallY = -(250 + t);
    expect(hub.assembledTransform).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(a.context).toEqual({ kind: 'wall', wallY });
    const plateZ = hd.zFace - d.yBoss0;
    expect(a.derived).toMatchObject({
      wallY,
      armLength: 250,
      armRise: 0,
      plateZ,
      armBossZ: hd.zFace,
      cableDiameter: 6,
      puckZ: hd.zPuck,
      hubHeight: hd.hubHeight,
    });
    const near = (p: number[], q: number[]) => p.forEach((v, i) => expect(v).toBeCloseTo(q[i]!, 9));
    // The plate's back face lies on the wall, its front face carries the flange.
    const plateT = part(a, 'wallPlate').assembledTransform;
    near(applyToPoint(plateT, [0, 0, 0]), [0, wallY, plateZ]);
    near(applyToPoint(plateT, [0, 0, t]), [0, wallY + t, plateZ]);
    // Up the plate (print +y) is up in the room.
    near(applyToPoint(plateT, [0, 10, 0]), [0, wallY, plateZ + 10]);
    // The arm's flange sits on the plate; its boss's mouth on the hub's mount face.
    const armT = part(a, 'wallArm').assembledTransform;
    near(applyToPoint(armT, [0, d.yShift, 0]), [0, wallY + t, plateZ]);
    near(applyToPoint(armT, [0, d.yBoss0 + d.yShift, 250]), [0, 0, hd.zFace]);
    near(applyToPoint(armT, [0, d.yBoss1 + d.yShift, 250]), [0, 0, hd.zFace + d.bossHeight]);
    // The lamp's lowest point: the shade's open end (the plate is higher).
    const shadeZ = part(a, 'shade').assembledTransform[14]!;
    expect(a.derived.bottomZ).toBe(shadeZ);
    expect(plateZ - plateParams(a).height / 2).toBeGreaterThan(shadeZ);
  });

  it('raises a rising arm’s boss above its flange', () => {
    for (const shape of ['angled', 'curved'] as const) {
      const a = assemble(wallLamp(shaped(shape, 30)));
      const d = deriveWallArm(armParams(a));
      expect(d.rise).toBe(30);
      expect(d.yEnd).toBeGreaterThan(0);
      // The hub hangs higher than the plate by the arm's rise.
      expect(a.derived.plateZ).toBeCloseTo(deriveHub(hubParams(a)).zFace - d.yBoss0, 9);
      expect(a.derived.armRise).toBe(30);
    }
  });

  it('builds every straight arm alike, whatever its rise angle', () => {
    const a = assemble(wallLamp((m) => (m.arm.riseAngle = 35)));
    expect(armParams(a).riseAngle).toBe(0);
    expect(part(a, 'wallArm').buildKey).toBe(part(assemble(wallLamp()), 'wallArm').buildKey);
  });

  it('clamps the rise to 45° (the arm must print standing on its flange)', () => {
    const a = assemble(wallLamp(shaped('angled', 60)));
    expect(a.warnings).toContainEqual(
      expect.objectContaining({ code: 'clamped', paramPath: 'mount.arm.riseAngle' }),
    );
    expect(armParams(a).riseAngle).toBe(45);
  });

  it('reports an arm too tall for the bed and stays quiet for one that fits', () => {
    const short = assemble(
      wallLamp((m) => {
        m.arm.length = 200;
      }),
    );
    expect(short.warnings).toEqual([]);
    expect(part(short, 'wallArm').bedFootprint!.z).toBeCloseTo(
      200 + deriveWallArm(armParams(short)).rBoss,
      9,
    );
    const tall = assemble(wallLamp((m) => (m.arm.length = 600)));
    expect(tall.warnings).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'bed-fit', partId: 'wallArm' }),
    );
  });

  it('keeps the plate large enough for the flange and the keyholes, and the tube’s wall', () => {
    const adjusted = wallArmMount.normalize!({
      ...defaultMount('wallArm'),
      plate: { width: 50, height: 60, thickness: 6, keyholeSpacing: 200 },
      arm: { shape: 'straight', length: 250, riseAngle: 0, tubeDiameter: 14, cableDiameter: 12 },
    });
    expect(adjusted.mount.plate).toEqual({
      width: 68,
      height: 89,
      thickness: 6,
      keyholeSpacing: 50,
    });
    expect(adjusted.mount.arm.tubeDiameter).toBe(19);
    expect(adjusted.warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['adjusted', 'mount.arm.tubeDiameter'],
      ['adjusted', 'mount.plate.width'],
      ['adjusted', 'mount.plate.height'],
      ['adjusted', 'mount.plate.keyholeSpacing'],
    ]);
    // Spacing too small for the cable hole, and the defaults untouched.
    const small = wallArmMount.normalize!({
      ...defaultMount('wallArm'),
      plate: { width: 80, height: 120, thickness: 6, keyholeSpacing: 20 },
    });
    expect(small.mount.plate.keyholeSpacing).toBe(44);
    const defaults = defaultMount('wallArm');
    expect(wallArmMount.normalize!(defaults)).toEqual({ mount: defaults, warnings: [] });
  });

  it('warns when the cable is thicker than the plate', () => {
    const a = assemble(wallLamp((m) => (m.plate.thickness = 4)));
    expect(a.warnings).toContainEqual(
      expect.objectContaining({
        code: 'cable-slot',
        partId: 'wallPlate',
        paramPath: 'mount.plate.thickness',
      }),
    );
  });

  it("prints the shade joint's test pair in fit-test mode, without the plate and arm", () => {
    const a = assemble(wallLamp((_m, p) => (p.fitTest = true)));
    expect(a.parts.map((x) => x.id)).toEqual(['fitMale', 'fitFemale']);
    expect(Object.keys(a.interfaces)).toEqual(['shadeToHub']);
    expect(a.derived.bottomZ).toBe(-3);
  });

  it('matches the snapshot', () => {
    expect(summary(assemble(wallLamp()))).toMatchSnapshot();
  });
});

describe.each(['draft', 'normal'] as const)('the wall parts at %s quality', (quality) => {
  it.each(ARM_SHAPES)('build as valid solids without leaks (%s arm)', (shape) => {
    const a = assemble(wallLamp(shaped(shape)), { quality });
    withBuilt(k, tracker, a.parts, quality, (built) => {
      expect(built.map((b) => b.part.id)).toEqual(['hub', 'shade', 'wallPlate', 'wallArm']);
      for (const b of built) {
        expect(b.stats.status, b.part.id).toBe('NoError');
        expect(b.stats.bbox.min[2], b.part.id).toBeCloseTo(0, 6);
        // The footprint is an upper bound of the bounding box, centred on the print origin.
        const f = b.part.bedFootprint!;
        const { min, max } = b.stats.bbox;
        expect(max[0] - min[0], b.part.id).toBeLessThanOrEqual(f.x + 1e-6);
        expect(max[1] - min[1], b.part.id).toBeLessThanOrEqual(f.y + 1e-6);
        expect(max[2], b.part.id).toBeLessThanOrEqual(f.z + 1e-6);
        expect(Math.abs(max[1] + min[1]), b.part.id).toBeLessThan(1e-6);
      }
    });
  });
});

describe('the hub’s stub in the arm’s end boss', () => {
  it.each([
    ['straight', 0],
    ['angled', 30],
    ['angled', 45],
    ['curved', 45],
  ] as const)('mates with the thread’s clearance and no overlap (%s, %i°)', (shape, rise) => {
    const a = assemble(wallLamp(shaped(shape, rise)), { quality: 'normal' });
    const iface = a.interfaces.hubToArm!;
    const { zFace } = deriveHub(hubParams(a));
    const parts = a.parts.filter((p) => p.id === 'hub' || p.id === 'wallArm');
    withBuilt(k, tracker, parts, 'normal', (built) => {
      scoped(k, (s) => {
        const hub = s.add(assembled(byId(built, 'hub')));
        const arm = s.add(assembled(byId(built, 'wallArm')));
        expect(s.add(k.Manifold.intersection(hub, arm)).volume()).toBeLessThan(1);
        // Halfway up the stub: the bore's root is the clearance outside the stub's.
        const z = zFace + iface.length / 2 + 1e-3;
        const stub = contourMinRadii(s.add(hub.slice(z)));
        const bore = contourMinRadii(s.add(arm.slice(z)));
        // The stub: its cable bore, its root. The boss: its threaded bore first.
        expect(stub).toHaveLength(2);
        expect(Math.abs(bore[0]! - stub[1]! - iface.tolerance)).toBeLessThan(0.01);
        expect(stub[1]).toBeCloseTo(8, 1);
      });
    });
  });
});

describe('the arm', () => {
  it.each(ARM_SHAPES)(
    'has one cable bore from the flange through the tube into the thread (%s)',
    (shape) => {
      const a = assemble(wallLamp(shaped(shape, 30)), { quality: 'draft' });
      const params = armParams(a);
      const d = deriveWallArm(params);
      const r = d.rBore - 0.4;
      withBuilt(k, tracker, [part(a, 'wallArm')], 'draft', ([arm]) => {
        scoped(k, (s) => {
          const m = arm!.manifold;
          for (const z of [d.flangeThickness / 2, d.reach / 2]) {
            const section = s.add(m.slice(z));
            expect(inHole(section, 0, centreY(params, z) + d.yShift, r), `z ${z}`).toBe(true);
          }
          // Through the boss's axis: the tube's bore meets the vertical bore, which
          // runs down into the thread; above it the boss is closed.
          const boss = s.add(m.slice(d.reach));
          const L = params.hubJoint.length;
          expect(inHole(boss, 0, d.yEnd + d.yShift, r)).toBe(true);
          expect(inHole(boss, 0, d.yBoss0 + L + 1 + d.yShift, r)).toBe(true);
          expect(inHole(boss, 0, d.yBoss0 + L / 2 + d.yShift, 5)).toBe(true);
          expect(inHole(boss, 0, d.yBoss1 - 1.5 + d.yShift, 1)).toBe(false);
          // The bore is not wider than the cable needs.
          expect(
            inHole(
              s.add(m.slice(d.reach / 2)),
              0,
              centreY(params, d.reach / 2) + d.yShift,
              d.rBore + 1,
            ),
          ).toBe(false);
        });
      });
    },
  );

  it.each([
    ['straight', 0],
    ['angled', 20],
    ['angled', 45],
    ['curved', 20],
    ['curved', 45],
  ] as const)(
    'prints standing on its flange within 45° but the thread’s facets (%s, %i°)',
    (shape, rise) => {
      const a = assemble(wallLamp(shaped(shape, rise)), { quality: 'normal' });
      const params = armParams(a);
      const d = deriveWallArm(params);
      const rBore = params.hubJoint.nominalDiameter / 2 + params.hubJoint.tolerance;
      const depth = params.hubJoint.thread!.depth;
      // The twisted thread facets (see maxOverhangDeg) around the bore's axis (x 0, z reach).
      const thread = (tri: readonly (readonly number[])[]) =>
        tri.every((v) => {
          const r = Math.hypot(v[0]!, v[2]! - d.reach);
          return r > rBore - 0.05 && r < rBore + depth + 0.05;
        });
      withBuilt(k, tracker, [part(a, 'wallArm')], 'normal', ([arm]) => {
        expect(arm!.stats.maxOverhangDeg).toBe(Math.max(45, rise));
        expect(maxOverhangDeg(arm!.manifold, { ignore: thread })).toBeLessThanOrEqual(45 + 0.5);
      });
    },
  );

  it('has its flange’s holes over the plate’s insert pockets', () => {
    const a = assemble(wallLamp(shaped('angled', 20)), { quality: 'draft' });
    const iface = a.interfaces.armToPlate!;
    const t = plateParams(a).thickness;
    const d = deriveWallArm(armParams(a));
    const parts = a.parts.filter((p) => p.id === 'wallPlate' || p.id === 'wallArm');
    withBuilt(k, tracker, parts, 'draft', (built) => {
      const plate = byId(built, 'wallPlate');
      const arm = byId(built, 'wallArm');
      scoped(k, (s) => {
        // Face to face on the plate's front, no overlap.
        const placedPlate = s.add(assembled(plate));
        const placedArm = s.add(assembled(arm));
        expect(s.add(k.Manifold.intersection(placedPlate, placedArm)).volume()).toBeLessThan(1e-3);
        const pockets = s.add(plate.manifold.slice(t - 1));
        const holes = s.add(arm.manifold.slice(1));
        const counterbores = s.add(arm.manifold.slice(d.flangeThickness - 1));
        for (const [x, y] of screwPositions(iface)) {
          // The same point in the room.
          const p = applyToPoint(plate.part.assembledTransform, [x, y, t]);
          const q = applyToPoint(arm.part.assembledTransform, [x, y + d.yShift, 0]);
          p.forEach((v, i) => expect(v).toBeCloseTo(q[i]!, 9));
          // A Ø4 pocket in the plate, a Ø3.4 hole and a Ø6 counterbore in the flange.
          expect(inHole(pockets, x, y, 1.9)).toBe(true);
          expect(inHole(pockets, x, y, 2.3)).toBe(false);
          expect(inHole(holes, x, y + d.yShift, 1.6)).toBe(true);
          expect(inHole(holes, x, y + d.yShift, 2)).toBe(false);
          expect(inHole(counterbores, x, y + d.yShift, 2.9)).toBe(true);
        }
      });
    });
  });
});

describe('the wall plate', () => {
  it('prints back face down without overhangs beyond 45°', () => {
    const a = assemble(wallLamp(), { quality: 'normal' });
    withBuilt(k, tracker, [part(a, 'wallPlate')], 'normal', ([plate]) => {
      expect(plate!.stats.maxOverhangDeg).toBeLessThanOrEqual(45);
      expect(maxOverhangDeg(plate!.manifold)).toBeLessThanOrEqual(45 + 0.5);
      expect(plate!.stats.bbox.max[2]).toBeCloseTo(plateParams(a).thickness, 6);
    });
  });

  it('has two keyholes: head hole, slot, and a channel for the head on the back', () => {
    const a = assemble(wallLamp(), { quality: 'draft' });
    const params = plateParams(a);
    const d = deriveWallPlate(params);
    const kh = params.keyholes;
    withBuilt(k, tracker, [part(a, 'wallPlate')], 'draft', ([plate]) => {
      scoped(k, (s) => {
        const front = s.add(plate!.manifold.slice(params.thickness - 0.3));
        const back = s.add(plate!.manifold.slice(0.5));
        for (const [end, head] of [
          [d.keyholeTop, d.keyholeTopHead],
          [d.keyholeBottom, d.keyholeBottomHead],
        ] as const) {
          const mid = (end + head) / 2;
          expect(end - head).toBe(kh.length);
          expect(inHole(front, 0, head, kh.headDiameter / 2 - 0.2)).toBe(true);
          expect(inHole(front, 0, mid, kh.slotWidth / 2 - 0.2)).toBe(true);
          expect(inHole(front, 0, mid, kh.slotWidth / 2 + 0.5)).toBe(false);
          expect(inHole(front, 0, end, kh.slotWidth / 2 - 0.2)).toBe(true);
          expect(inHole(back, 0, mid, kh.headDiameter / 2 - 0.2)).toBe(true);
        }
        expect(d.keyholeTop - d.keyholeBottom).toBe(60);
      });
    });
  });

  it('has a cable slot from its centre out of the bottom edge, clear of the keyholes', () => {
    const a = assemble(wallLamp(), { quality: 'draft' });
    const params = plateParams(a);
    const d = deriveWallPlate(params);
    const r = params.cableNotch.width / 2 - 0.2;
    withBuilt(k, tracker, [part(a, 'wallPlate')], 'draft', ([plate]) => {
      scoped(k, (s) => {
        const mid = s.add(plate!.manifold.slice(params.thickness / 2));
        const x = d.cableSlotX;
        expect(inHole(mid, 0, 0, r)).toBe(true);
        expect(inHole(mid, x, -x, r)).toBe(true);
        expect(inHole(mid, x, d.keyholeBottom, r)).toBe(true);
        expect(inHole(mid, x, -params.height / 2 + 1, r)).toBe(true);
        // Material between the slot and the lower keyhole's channel.
        const between = x - params.cableNotch.width / 2 - 0.8;
        expect(inHole(mid, between, d.keyholeBottom, 0.3)).toBe(false);
      });
    });
  });

  it('has tapping holes instead of insert pockets without heat-set inserts', () => {
    const a = assemble(
      wallLamp((_m, p) => (p.joints.heatSet = false)),
      { quality: 'draft' },
    );
    const params = plateParams(a);
    expect(params.armScrews.screw!.insertPocket).toBeUndefined();
    expect(part(a, 'wallPlate').printNotes.join(' ')).toContain('Tap the four holes');
    withBuilt(k, tracker, [part(a, 'wallPlate')], 'draft', ([plate]) => {
      expect(plate!.stats.status).toBe('NoError');
      scoped(k, (s) => {
        const front = s.add(plate!.manifold.slice(params.thickness - 1));
        for (const [x, y] of screwPositions(params.armScrews)) {
          expect(inHole(front, x, y, 1.1)).toBe(true);
          expect(inHole(front, x, y, 1.6)).toBe(false);
        }
      });
    });
  });
});

describe('the wall lamp projects', () => {
  const read = (url: URL) => parseProject(readFileSync(url, 'utf8'));

  it('the wall-arm fixture assembles without errors', () => {
    const project = read(new URL('../../fixtures/v3-wall-arm.lamp.json', import.meta.url));
    const a = assemble(project, { quality: 'draft' });
    expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    expect(a.parts.map((p) => p.id)).toEqual(['hub', 'shade', 'wallPlate', 'wallArm']);
    expect(armParams(a)).toMatchObject({ shape: 'curved', riseAngle: 30, length: 220 });
    expect(a.context).toEqual({ kind: 'wall', wallY: -227 });
  });

  it('the Wall lamp example hangs from an angled arm, its parts fitting the bed', () => {
    const project = read(new URL('../../../src/examples/wall-lamp.lamp.json', import.meta.url));
    expect(project.name).toBe('Wall lamp');
    expect(project.hub.fused).toBe(false);
    expect(project.joints.shadeToHub).toBe('bayonet');
    const a = assemble(project, { quality: 'draft' });
    expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    expect(a.warnings.filter((w) => w.code === 'bed-fit')).toEqual([]);
    expect(a.parts.map((p) => [p.id, p.kind])).toEqual([
      ['hub', 'hub'],
      ['shade', 'shade'],
      ['wallPlate', 'wallPlate'],
      ['wallArm', 'wallArm'],
    ]);
    expect(armParams(a)).toMatchObject({ shape: 'angled', riseAngle: 20 });
    expect(a.context.kind).toBe('wall');
  });
});
