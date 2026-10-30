/**
 * The wall lamp: the assembly (parts and copies per configuration, joints,
 * placement at rest and posed, normalisation, checks, snapshot), the pure
 * footprints, and the projects. The parts' own geometry is tested with
 * their builders (wallPlate, knee, hanger, knob, rosette tests; the link's
 * geometry half of this file arrives with its builder in step 3).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { ZERO_POSE, type MountPose } from '@core/assembly/mounts/types.ts';
import {
  HANGER,
  KEYHOLE,
  KNEE,
  KNOB,
  PIVOT,
  ROSETTE,
  axisAboveSupport,
  plateStackHeight,
  wallArmMount,
} from '@core/assembly/mounts/wallArm.ts';
import { applyToPoint } from '@core/assembly/transforms.ts';
import type { Kernel } from '@core/geometry/kernel.ts';
import { deriveHanger } from '@core/geometry/parts/hanger.ts';
import { deriveHub } from '@core/geometry/parts/hub.ts';
import { deriveKnee } from '@core/geometry/parts/knee.ts';
import { deriveWallArm, linkToPrint, printToLink } from '@core/geometry/parts/wallArm.ts';
import { deriveWallPlate } from '@core/geometry/parts/wallPlate.ts';
import type { Assembly, Mat4, PartSpec } from '@core/model/assembly.ts';
import type {
  HangerParams,
  HubParams,
  KneeParams,
  KnobParams,
  WallArmParams,
  WallPlateParams,
} from '@core/model/parts.ts';
import {
  createDefaultProject,
  defaultMount,
  parseProject,
  type MountOf,
  type Project,
} from '@core/model/project.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import { withBuilt } from '../../helpers/parts.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

type WallMount = MountOf<'wallArm'>;
type Arm = WallMount['arm'];
type Vec = readonly number[];

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

/** The default lamp with these arm fields. */
const withArm = (arm: Partial<Arm>) => wallLamp((m) => Object.assign(m.arm, arm));
const swingElbow = (arm: Partial<Arm> = {}) =>
  withArm({ links: 2, elbow: 'swing', length: 360, ...arm });
const foldElbow = (arm: Partial<Arm> = {}) =>
  withArm({ links: 2, elbow: 'fold', length: 360, ...arm });

const pose = (p: Partial<MountPose>): MountPose => ({ ...ZERO_POSE, ...p });

/** The assembly without the numbers that only restate the params (as in assemble.test.ts). */
function summary(a: Assembly) {
  return {
    parts: a.parts.map(({ buildKey, ...part }) => ({ ...part, buildKeyLength: buildKey.length })),
    hubTransform: a.hubTransform,
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
const plateParams = (a: Assembly) => part(a, 'wallPlate').params as WallPlateParams;
const kneeParams = (a: Assembly) => part(a, 'knee').params as KneeParams;
const armParams = (a: Assembly, id = 'wallArm') => part(a, id).params as WallArmParams;
const hangerParams = (a: Assembly) => part(a, 'hanger').params as HangerParams;

const at = (m: Mat4, p: Vec) => applyToPoint(m, p as [number, number, number]);
const near = (p: Vec, q: Vec, digits = 9) =>
  p.forEach((v, i) => expect(v, `component ${i}`).toBeCloseTo(q[i]!, digits));
/** The world point a transform puts the print frame's origin. */
const originOf = (m: Mat4) => [m[12]!, m[13]!, m[14]!];

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('assemble (wall arm): the parts', () => {
  it('one link: the plate, the knee, the arm, the hanger and two knobs', () => {
    const a = assemble(wallLamp());
    expect(a.parts.map((x) => [x.id, x.kind, x.displayName, x.instances])).toEqual([
      ['hub', 'hub', 'Hub', 1],
      ['shade', 'shade', 'Shade', 1],
      ['wallPlate', 'wallPlate', 'Wall plate', 1],
      ['knee', 'knee', 'Knee', 1],
      ['wallArm', 'wallArm', 'Wall arm', 1],
      ['hanger', 'hanger', 'Hanger', 1],
      ['knob', 'knob', 'Knob ×2', 2],
    ]);
    expect(Object.keys(a.interfaces)).toEqual([
      'shadeToHub',
      'hubToArm',
      'platePivot',
      'shoulderHinge',
      'hangerHinge',
    ]);
    expect(armParams(a)).toMatchObject({
      shape: 'straight',
      bendAngle: 0,
      length: 220,
      root: 'clevis',
      end: { kind: 'clevis' },
    });
    expect(part(a, 'knob').instanceTransforms).toHaveLength(2);
    // Only the layout's info: the parts do not fit one plate of the A1 together.
    expect(a.warnings.map((w) => [w.severity, w.code])).toEqual([['info', 'plate-overflow']]);
  });

  it('two links on a swing elbow: two knees as one part, an inner and an outer arm, three knobs', () => {
    const a = assemble(swingElbow({ tilt: 0 }));
    expect(a.parts.map((x) => [x.id, x.kind, x.displayName, x.instances])).toEqual([
      ['hub', 'hub', 'Hub', 1],
      ['shade', 'shade', 'Shade', 1],
      ['wallPlate', 'wallPlate', 'Wall plate', 1],
      ['knee', 'knee', 'Knee ×2', 2],
      ['wallArm', 'wallArm', 'Inner arm', 1],
      ['wallArm2', 'wallArm', 'Outer arm', 1],
      ['hanger', 'hanger', 'Hanger', 1],
      ['knob', 'knob', 'Knob ×3', 3],
    ]);
    expect(Object.keys(a.interfaces)).toEqual([
      'shadeToHub',
      'hubToArm',
      'platePivot',
      'shoulderHinge',
      'elbowPivot',
      'elbowHinge',
      'hangerHinge',
    ]);
    expect(a.interfaces.elbowPivot).toMatchObject({
      type: 'pivot',
      male: 'knee',
      female: 'wallArm',
    });
    expect(a.interfaces.elbowHinge).toMatchObject({
      type: 'rosette',
      male: 'knee',
      female: 'wallArm2',
    });
    expect(a.interfaces.hangerHinge).toMatchObject({ male: 'hanger', female: 'wallArm2' });
    expect(armParams(a)).toMatchObject({
      length: 180,
      root: 'clevis',
      end: { kind: 'socket', pivot: a.interfaces.elbowPivot, lock: 'friction' },
    });
    expect(armParams(a, 'wallArm2')).toMatchObject({
      length: 180,
      root: 'clevis',
      end: { kind: 'clevis' },
    });
    expect(part(a, 'knee').instanceTransforms).toHaveLength(2);
    expect(part(a, 'knob').instanceTransforms).toHaveLength(3);
  });

  it('two links on a fold elbow: one knee, the outer arm’s root a tang in the inner arm’s end clevis', () => {
    const a = assemble(foldElbow({ elbowAt: 0.4 }));
    expect(a.parts.map((x) => [x.id, x.displayName, x.instances])).toEqual([
      ['hub', 'Hub', 1],
      ['shade', 'Shade', 1],
      ['wallPlate', 'Wall plate', 1],
      ['knee', 'Knee', 1],
      ['wallArm', 'Inner arm', 1],
      ['wallArm2', 'Outer arm', 1],
      ['hanger', 'Hanger', 1],
      ['knob', 'Knob ×3', 3],
    ]);
    expect(Object.keys(a.interfaces)).toEqual([
      'shadeToHub',
      'hubToArm',
      'platePivot',
      'shoulderHinge',
      'elbowHinge',
      'hangerHinge',
    ]);
    expect(a.interfaces.elbowHinge).toMatchObject({ male: 'wallArm2', female: 'wallArm' });
    expect(armParams(a)).toMatchObject({ length: 144, root: 'clevis', end: { kind: 'clevis' } });
    expect(armParams(a, 'wallArm2')).toMatchObject({
      length: 216,
      root: 'tang',
      end: { kind: 'clevis' },
    });
  });

  it('builds every straight link alike, whatever its bend', () => {
    const a = assemble(withArm({ bendAngle: 35 }));
    expect(armParams(a).bendAngle).toBe(0);
    expect(part(a, 'wallArm').buildKey).toBe(part(assemble(wallLamp()), 'wallArm').buildKey);
    expect(armParams(assemble(withArm({ shape: 'curved', bendAngle: 35 }))).bendAngle).toBe(35);
  });

  it('prints the shade joint’s test pair in fit-test mode, without the mount’s parts', () => {
    const a = assemble(wallLamp((_m, p) => (p.fitTest = true)));
    expect(a.parts.map((x) => x.id)).toEqual(['fitMale', 'fitFemale']);
    expect(Object.keys(a.interfaces)).toEqual(['shadeToHub']);
    expect(a.hubTransform).toEqual(IDENTITY);
    expect(a.derived.bottomZ).toBe(-3);
  });
});

describe('assemble (wall arm): the joints', () => {
  it('the hub’s stub screws into the hanger', () => {
    const a = assemble(wallLamp());
    const hubToArm = a.interfaces.hubToArm!;
    expect(hubToArm).toMatchObject({
      type: 'thread',
      nominalDiameter: 16,
      length: 12,
      tolerance: 0.3,
      thread: { pitch: 2.5, depth: 0.8, flank: 45, hand: 'right' },
      male: 'hub',
      female: 'hanger',
    });
    expect(hubParams(a).mountFace).toEqual({
      kind: 'threadMale',
      joint: hubToArm,
      cableDiameter: 6,
    });
    expect(hangerParams(a).hubJoint).toEqual(hubToArm);
  });

  it('the knee turns on a pivot in the plate’s socket: Ø max(15, cable + 8), 35 long', () => {
    const a = assemble(wallLamp());
    const pivot = a.interfaces.platePivot!;
    expect(pivot).toEqual({
      id: 'platePivot',
      type: 'pivot',
      nominalDiameter: 15,
      length: PIVOT.length,
      tolerance: 0.3,
      // The bore: the spigot, 1 mm of play, the sump (the cable + 1).
      pivot: { depth: 35 + 1 + 7, seat: 3, sump: 7 },
      male: 'knee',
      female: 'wallPlate',
    });
    expect(plateParams(a).socket.pivot).toEqual(pivot);
    expect(kneeParams(a).pivot).toEqual(pivot);
    const thick = assemble(withArm({ cableDiameter: 10 })).interfaces.platePivot!;
    expect(thick.nominalDiameter).toBe(18);
    expect(thick.pivot).toEqual({ depth: 35 + 1 + 11, seat: 3, sump: 11 });
  });

  it('every hinge is the same rosette: discs R 18, 36 teeth, tang 14 between ears 8', () => {
    const a = assemble(swingElbow());
    const spec = {
      radius: 18,
      teeth: 36,
      toothDepth: 1.2,
      innerRadius: 11,
      tangThickness: 14,
      earThickness: 8,
      boltHole: 5.5,
    };
    for (const id of ['shoulderHinge', 'elbowHinge', 'hangerHinge']) {
      expect(a.interfaces[id], id).toMatchObject({
        type: 'rosette',
        nominalDiameter: 36,
        length: 30.6,
        tolerance: 0.3,
        rosette: spec,
      });
    }
    const hinge = { ...spec, tolerance: 0.3, earGap: 14.6, width: 30.6 };
    for (const p of [kneeParams(a), armParams(a), armParams(a, 'wallArm2'), hangerParams(a)]) {
      expect(p.rosette).toMatchObject({
        ...hinge,
        headCounterbore: [9, 4],
        channel: { width: 7, radius: 7.5 },
        sweptRadius: 19,
      });
      expect(p.rosette.axisHeight).toBeCloseTo(18 / Math.SQRT2, 12);
    }
  });

  it('fixes the constants of the plan', () => {
    expect(ROSETTE).toMatchObject({ radius: 18, teeth: 36, tangThickness: 14, earThickness: 8 });
    expect(KNEE).toMatchObject({ hingeHeight: 24, bodyDiameter: 27, bodyHeight: 5 });
    expect(HANGER.axisAboveBody).toBe(19);
    expect(KNOB).toMatchObject({ diameter: 32, height: 10, lobes: 6, nutAcrossFlats: 8.3 });
    expect(KEYHOLE).toEqual({ headDiameter: 9, slotWidth: 4.5, length: 12 });
    // The disc-on-edge rule: 12.73 above a wide support, more above a narrow tube.
    expect(axisAboveSupport(30)).toBeCloseTo(12.728, 3);
    expect(axisAboveSupport(12)).toBeCloseTo(13.416, 3);
    expect(axisAboveSupport(9)).toBeCloseTo(15.588, 3);
    const knob = part(assemble(wallLamp()), 'knob').params as KnobParams;
    expect(knob).toMatchObject({ boreDiameter: 5.5, nut: { acrossFlats: 8.3, depth: 5 } });
  });
});

describe('assemble (wall arm): placement at rest', () => {
  it('hangs the hub exactly at the origin, whatever the tilt and the elbow', () => {
    for (const p of [
      wallLamp(),
      withArm({ tilt: -30 }),
      withArm({ tilt: 60, shape: 'curved', bendAngle: 30 }),
      swingElbow({ elbowTilt: -40 }),
      foldElbow({ elbowTilt: 30 }),
    ]) {
      const a = assemble(p);
      expect(part(a, 'hub').assembledTransform).toEqual(IDENTITY);
      expect(a.hubTransform).toEqual(IDENTITY);
      expect(a.derived.hubYaw).toBe(0);
    }
  });

  it('puts the plate on the wall, the knee in its socket, the arm on the knee and the hanger on the arm', () => {
    const a = assemble(wallLamp());
    const zFace = deriveHub(hubParams(a)).zFace;
    const pd = deriveWallPlate(plateParams(a));
    const kd = deriveKnee(kneeParams(a));
    const ad = deriveWallArm(armParams(a));
    const hd = deriveHanger(hangerParams(a));
    const L = 220;
    const t = (20 * Math.PI) / 180;
    // The hanger's thread mouth on the hub's mount face, its hinge axis `drop` above.
    const end = [0, 0, zFace + hd.drop];
    near(at(part(a, 'hanger').assembledTransform, [0, 0, 0]), [0, 0, zFace]);
    near(at(part(a, 'hanger').assembledTransform, [0, 0, hd.drop]), end);
    // The link: its end axis there, its root axis L back along the 20° tilt.
    const shoulder = [0, -L * Math.cos(t), end[2]! - L * Math.sin(t)];
    const arm = part(a, 'wallArm').assembledTransform;
    near(at(arm, at(linkToPrint(ad), [0, 0, 0])), shoulder);
    near(at(arm, at(linkToPrint(ad), [0, 0, L])), end);
    // The knee: its hinge on the shoulder axis, its seat 24 below on the socket's.
    const knee = part(a, 'knee').assembledTransform;
    const seat = [0, shoulder[1]!, shoulder[2]! - KNEE.hingeHeight];
    near(at(knee, [0, 0, kd.spigotLength]), seat);
    near(at(knee, [0, 0, kd.spigotLength + kd.seatToHinge]), shoulder);
    // The plate: its seat point on the knee's, its back face on the wall.
    const plate = part(a, 'wallPlate').assembledTransform;
    near(at(plate, [0, pd.seatY, pd.socketZ]), seat);
    const wallY = seat[1]! - pd.socketZ;
    const plateZ = seat[2]! - pd.seatY;
    near(at(plate, [0, 0, 0]), [0, wallY, plateZ]);
    // Up the plate (print +y) is up in the room, out of it (print +z) is the room.
    near(at(plate, [0, 10, 0]), [0, wallY, plateZ + 10]);
    near(at(plate, [0, 0, 10]), [0, wallY + 10, plateZ]);
    expect(a.context).toEqual({ kind: 'wall', wallY: expect.closeTo(wallY, 9) as number });
    expect(a.derived.wallY).toBeCloseTo(-(pd.socketZ + L * Math.cos(t)), 9);
    expect(a.derived.plateZ).toBeCloseTo(plateZ, 9);
    expect(a.derived.socketY).toBeCloseTo(seat[1]!, 9);
    expect(a.derived.seatZ).toBeCloseTo(seat[2]!, 9);
    near([a.derived.shoulderX!, a.derived.shoulderY!, a.derived.shoulderZ!], shoulder);
    near([a.derived.endX!, a.derived.endY!, a.derived.endZ!], end);
    expect(a.derived).toMatchObject({ armLength: 220, armTilt: 20, armLinks: 1, cableDiameter: 6 });
    // The lamp's lowest point: the shade's open end (the plate is higher).
    const shadeZ = part(a, 'shade').assembledTransform[14]!;
    expect(a.derived.bottomZ).toBe(shadeZ);
    expect(plateZ - pd.halfHeight).toBeGreaterThan(shadeZ);
    // The swing limit: the Ø161.6 shade reaches the wall at about 70°.
    expect(a.derived.maxSwing).toBeGreaterThan(60);
    expect(a.derived.maxSwing).toBeLessThanOrEqual(90);
  });

  it('puts each knob on its hinge’s +x ear', () => {
    const a = assemble(swingElbow({ tilt: 0, elbowTilt: 0 }));
    const width = kneeParams(a).rosette.width;
    const knobs = part(a, 'knob').instanceTransforms;
    const hinges = [
      [a.derived.shoulderX!, a.derived.shoulderY!, a.derived.shoulderZ!],
      // Knee 2's hinge, 24 above the elbow's seat.
      [a.derived.elbowX!, a.derived.elbowY!, a.derived.elbowZ! + KNEE.hingeHeight],
      [a.derived.endX!, a.derived.endY!, a.derived.endZ!],
    ];
    knobs.forEach((m, i) => {
      const h = hinges[i]!;
      // Its face on the ear (print z 0), its axis along the hinge's (room x at rest).
      near(at(m, [0, 0, 0]), [h[0]! + width / 2, h[1]!, h[2]!]);
      near(at(m, [0, 0, 10]), [h[0]! + width / 2 + 10, h[1]!, h[2]!]);
    });
    expect(part(a, 'knob').assembledTransform).toEqual(knobs[0]);
  });

  it('a swing elbow: the inner link’s socket seat on its end axis, the second knee in it', () => {
    const a = assemble(swingElbow({ tilt: 0, elbowTilt: 20 }));
    const d1 = deriveWallArm(armParams(a));
    const kd = deriveKnee(kneeParams(a));
    expect(d1.seatY).toBe(43 - 7 / 2);
    const seat = [0, a.derived.shoulderY! + 180, a.derived.shoulderZ! + d1.seatY];
    near([a.derived.elbowX!, a.derived.elbowY!, a.derived.elbowZ!], seat);
    const [first, second] = part(a, 'knee').instanceTransforms;
    expect(first).toEqual(part(a, 'knee').assembledTransform);
    near(at(second!, [0, 0, kd.spigotLength]), seat);
    // The outer link rises 20° from knee 2's hinge to the end.
    const t = (20 * Math.PI) / 180;
    near(
      [a.derived.endX!, a.derived.endY!, a.derived.endZ!],
      [0, seat[1]! + 180 * Math.cos(t), seat[2]! + KNEE.hingeHeight + 180 * Math.sin(t)],
    );
  });

  it('a fold elbow: the outer link folds by the elbow tilt at the inner link’s end', () => {
    const a = assemble(foldElbow({ tilt: 20, elbowTilt: -30 }));
    const rad = (d: number) => (d * Math.PI) / 180;
    const s = [a.derived.shoulderX!, a.derived.shoulderY!, a.derived.shoulderZ!];
    const elbow = [0, s[1]! + 180 * Math.cos(rad(20)), s[2]! + 180 * Math.sin(rad(20))];
    near([a.derived.elbowX!, a.derived.elbowY!, a.derived.elbowZ!], elbow);
    near(
      [a.derived.endX!, a.derived.endY!, a.derived.endZ!],
      [0, elbow[1]! + 180 * Math.cos(rad(-10)), elbow[2]! + 180 * Math.sin(rad(-10))],
    );
    // The outer link stands on its end clevis: its root (a tang) at the top of the print.
    const d2 = deriveWallArm(armParams(a, 'wallArm2'));
    expect(d2.flipped).toBe(1);
    near(at(part(a, 'wallArm2').assembledTransform, at(linkToPrint(d2), [0, 0, 0])), elbow);
  });

  it('a curved link: its root and end axes on the chord, the tilt the chord’s', () => {
    const a = assemble(withArm({ shape: 'curved', bendAngle: 30, tilt: 10 }));
    const d = deriveWallArm(armParams(a));
    expect(d.bend).toBe(30);
    expect(d.sagitta).toBeCloseTo(d.bendRadius * (1 - Math.cos((15 * Math.PI) / 180)), 9);
    const t = (10 * Math.PI) / 180;
    expect(a.derived.endY! - a.derived.shoulderY!).toBeCloseTo(220 * Math.cos(t), 9);
    expect(a.derived.endZ! - a.derived.shoulderZ!).toBeCloseTo(220 * Math.sin(t), 9);
  });
});

describe('assemble (wall arm): the pose', () => {
  it('swings the lamp about the plate’s socket axis, the plate staying on the wall', () => {
    const rest = assemble(wallLamp());
    const a = assemble(wallLamp(), { pose: pose({ swing: 45 }) });
    const socketY = rest.derived.socketY!;
    const hub = originOf(a.hubTransform);
    // On the circle about the socket axis, at the same height, turned by 45°.
    expect(Math.hypot(hub[0]!, hub[1]! - socketY)).toBeCloseTo(-socketY, 9);
    expect(hub[2]).toBeCloseTo(0, 9);
    expect(Math.atan2(-hub[0]!, hub[1]! - socketY)).toBeCloseTo(Math.PI / 4, 9);
    expect(a.derived.hubYaw).toBeCloseTo(45, 9);
    near(
      at(a.hubTransform, [1, 0, 0]).map((v, i) => v - hub[i]!),
      [Math.SQRT1_2, Math.SQRT1_2, 0],
    );
    expect(part(a, 'wallPlate').assembledTransform).toEqual(
      part(rest, 'wallPlate').assembledTransform,
    );
    expect(a.context).toEqual(rest.context);
    // The shade turns with the hub.
    near(
      originOf(part(a, 'shade').assembledTransform),
      at(a.hubTransform, originOf(part(rest, 'shade').assembledTransform)),
    );
  });

  it('a tilt moves the plate (the hub stays at the origin)', () => {
    const level = assemble(withArm({ tilt: 0 }));
    const up = assemble(withArm({ tilt: 40 }));
    expect(up.hubTransform).toEqual(IDENTITY);
    const t = (40 * Math.PI) / 180;
    expect(up.derived.wallY! - level.derived.wallY!).toBeCloseTo(220 * (1 - Math.cos(t)), 9);
    expect(level.derived.plateZ! - up.derived.plateZ!).toBeCloseTo(220 * Math.sin(t), 9);
  });

  it('swings the outer link of a swing elbow about the elbow’s pivot', () => {
    const rest = assemble(swingElbow({ tilt: 0 }));
    const a = assemble(swingElbow({ tilt: 0 }), { pose: pose({ elbowSwing: 90 }) });
    const elbow = [rest.derived.elbowX!, rest.derived.elbowY!];
    const hub = originOf(a.hubTransform);
    expect(Math.hypot(hub[0]! - elbow[0]!, hub[1]! - elbow[1]!)).toBeCloseTo(
      Math.hypot(elbow[0]!, elbow[1]!),
      9,
    );
    expect(hub[2]).toBeCloseTo(0, 9);
    expect(a.derived.hubYaw).toBeCloseTo(90, 9);
    // The inner link did not move.
    expect(part(a, 'wallArm').assembledTransform).toEqual(part(rest, 'wallArm').assembledTransform);
  });

  it('tilts the hub on the hanger’s hinge', () => {
    const rest = assemble(wallLamp());
    const a = assemble(wallLamp(), { pose: pose({ hubTilt: 20 }) });
    const end = [rest.derived.endX!, rest.derived.endY!, rest.derived.endZ!];
    const hub = originOf(a.hubTransform);
    const r = Math.hypot(...end);
    expect(Math.hypot(hub[0]! - end[0]!, hub[1]! - end[1]!, hub[2]! - end[2]!)).toBeCloseTo(r, 9);
    // Its axis turned 20° from vertical.
    expect(a.hubTransform[10]).toBeCloseTo(Math.cos((20 * Math.PI) / 180), 12);
    near(
      originOf(part(a, 'hanger').assembledTransform),
      at(a.hubTransform, [0, 0, deriveHub(hubParams(a)).zFace]),
    );
    expect(a.derived.bottomZ).toBeLessThan(rest.derived.bottomZ!);
  });

  it('never enters a part’s params: every buildKey and hash stays', () => {
    for (const p of [wallLamp(), swingElbow(), foldElbow()]) {
      const rest = assemble(p);
      const posed = assemble(p, { pose: { swing: -60, elbowSwing: 120, hubTilt: 30 } });
      expect(posed.parts.map((x) => [x.id, x.buildKey, x.hash])).toEqual(
        rest.parts.map((x) => [x.id, x.buildKey, x.hash]),
      );
      expect(assemble(p, { pose: ZERO_POSE })).toEqual(rest);
      expect(assemble(p, { pose: { swing: 0, elbowSwing: 0, hubTilt: 0 } })).toEqual(rest);
    }
  });

  it('moves the parts of every other mount not at all', () => {
    for (const kind of ['ceilingCord', 'standing'] as const) {
      const p = wallLamp();
      p.mount = defaultMount(kind);
      expect(assemble(p, { pose: { swing: 30, elbowSwing: 10, hubTilt: 5 } })).toEqual(assemble(p));
    }
  });
});

describe('the pure footprints', () => {
  it('a link prints about its length + 31 mm tall, standing on a clevis', () => {
    const a = assemble(wallLamp());
    const f = part(a, 'wallArm').bedFootprint!;
    expect(f.z).toBeCloseTo(220 + 18 / Math.SQRT2 + 18, 9);
    expect(f.x).toBeCloseTo(30.6, 9);
    expect(f.y).toBe(36);
    // A swing elbow's socket boss rises above the tube; a fold link stands on its end clevis.
    const swing = assemble(swingElbow());
    const inner = deriveWallArm(armParams(swing));
    expect(inner.socket).toBe(1);
    expect(part(swing, 'wallArm').bedFootprint!.z).toBeCloseTo(
      180 + 18 / Math.SQRT2 + inner.rBoss,
      9,
    );
    expect(part(swing, 'wallArm').bedFootprint!.y).toBeCloseTo(18 + inner.seatY, 9);
    const fold = assemble(foldElbow());
    expect(part(fold, 'wallArm2').bedFootprint!.z).toBeCloseTo(180 + 18 / Math.SQRT2 + 18, 9);
  });

  it('linkToPrint and printToLink are inverse, the lower axis on the disc-on-edge height', () => {
    for (const p of [
      armParams(assemble(wallLamp())),
      armParams(assemble(foldElbow()), 'wallArm2'),
    ]) {
      const d = deriveWallArm(p);
      for (const q of [
        [0, 0, 0],
        [3, -5, 100],
      ]) {
        near(at(printToLink(d), at(linkToPrint(d), q)), q);
      }
      const lower = d.flipped ? [0, 0, d.length] : [0, 0, 0];
      expect(at(linkToPrint(d), lower)[2]).toBeCloseTo(18 / Math.SQRT2, 12);
      near(at(linkToPrint(d), [0, 0, 0]), [0, d.yShift, d.rootAxisZ]);
      near(at(linkToPrint(d), [0, 0, d.length]), [0, d.yShift, d.endAxisZ]);
    }
  });

  it('the plate, the knee and the hanger', () => {
    const a = assemble(wallLamp());
    const pd = deriveWallPlate(plateParams(a));
    // The socket axis: the groove (cable + 0.5), a 1.2 skin, the bore's radius.
    // The front (10 + 3) plus the knee's discs' swept radius (19) + 1, not the groove's 6.5 + 1.2 + 7.8.
    expect(pd.socketZ).toBeCloseTo(13 + 19 + 1, 9);
    expect(pd.rBoss).toBeCloseTo(7.8 * Math.SQRT2 + 2.5, 9);
    // The boss + knee stack centred on the plate.
    expect(pd.seatY - pd.bossHeight + (pd.seatY + KNEE.hingeHeight + 18)).toBeCloseTo(0, 9);
    expect(pd.bossHeight + KNEE.hingeHeight + 18).toBeCloseTo(plateStackHeight(6), 9);
    expect(part(a, 'wallPlate').bedFootprint).toEqual({ x: 100, y: 100, z: pd.socketZ + pd.rBoss });
    expect(part(a, 'knee').bedFootprint).toEqual({ x: 27, y: 36, z: 35 + 24 + 18 });
    const hd = deriveHanger(hangerParams(a));
    expect(hd.bodyHeight).toBe(20);
    expect(hd.drop).toBe(20 + 19);
    expect(part(a, 'hanger').bedFootprint).toEqual({ x: 28, y: 36, z: hd.drop + 18 });
    expect(part(a, 'knob').bedFootprint).toEqual({ x: 32, y: 32, z: 10 });
  });
});

describe('the rules (normalize)', () => {
  const normalize = (mount: WallMount) => wallArmMount.normalize!(mount);

  it('leaves the defaults alone', () => {
    const defaults = defaultMount('wallArm');
    expect(normalize(defaults)).toEqual({ mount: defaults, warnings: [] });
  });

  it('rounds the links, and the tilts to the teeth’s 10° steps', () => {
    const m = defaultMount('wallArm');
    const out = normalize({ ...m, arm: { ...m.arm, links: 1.6, tilt: 25, elbowTilt: -14 } });
    expect(out.mount.arm).toMatchObject({ links: 2, tilt: 30, elbowTilt: -10 });
    expect(out.warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['adjusted', 'mount.arm.tilt'],
      ['adjusted', 'mount.arm.elbowTilt'],
    ]);
  });

  it('keeps the tube’s wall and the plate’s skin over the cable', () => {
    const m = defaultMount('wallArm');
    const out = normalize({
      ...m,
      plate: { ...m.plate, thickness: 9.5 },
      arm: { ...m.arm, tubeDiameter: 18, cableDiameter: 12 },
    });
    expect(out.mount.arm.tubeDiameter).toBe(19);
    expect(out.mount.plate.thickness).toBe(14.5);
    expect(out.warnings.map((w) => w.paramPath)).toEqual(
      expect.arrayContaining(['mount.arm.tubeDiameter', 'mount.plate.thickness']),
    );
  });

  it('makes the plate hold the keyholes and the boss + knee stack, the keyholes inside it', () => {
    const m = defaultMount('wallArm');
    // Round: the Ø holds the keyholes and the stack (86.6 + 2 × 4).
    const round = normalize({ ...m, plate: { ...m.plate, width: 60, keyholeSpacing: 60 } });
    expect(round.mount.plate.width).toBe(Math.ceil(plateStackHeight(6) + 8));
    expect(round.warnings.map((w) => w.paramPath)).toContain('mount.plate.width');
    // A rounded rectangle: the width for the keyholes, the height for the stack.
    const rect = normalize({
      ...m,
      plate: { ...m.plate, outline: 'roundedRect', width: 50, height: 60, keyholeSpacing: 60 },
    });
    expect(rect.mount.plate.width).toBe(60 + 9 + 6);
    expect(rect.mount.plate.height).toBe(Math.ceil(plateStackHeight(6) + 8));
    // Spacing wider than the round plate allows: reduced to the widest that fits.
    const wide = normalize({ ...m, plate: { ...m.plate, width: 100, keyholeSpacing: 90 } });
    expect(wide.mount.plate.width).toBe(105);
    expect(wide.mount.plate.keyholeSpacing).toBeLessThan(90);
    expect(wide.warnings.map((w) => w.paramPath)).toEqual([
      'mount.plate.width',
      'mount.plate.keyholeSpacing',
    ]);
    // The default round plate takes the default spacing as it is.
    expect(normalize({ ...m, plate: { ...m.plate, keyholeSpacing: 80 } }).warnings).toEqual([]);
  });
});

describe('the checks (validate)', () => {
  const infos = (a: Assembly) =>
    a.warnings
      .filter((w) => w.code !== 'plate-overflow')
      .map((w) => [w.severity, w.code, w.paramPath]);

  it('points a one-link arm too tall for the bed at two links', () => {
    const a = assemble(withArm({ length: 400 }));
    expect(infos(a)).toContainEqual(['info', 'use-two-links', 'mount.arm.links']);
    expect(a.warnings).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'bed-fit', partId: 'wallArm' }),
    );
    expect(infos(assemble(withArm({ length: 400, links: 2 })))).not.toContainEqual(
      expect.arrayContaining(['use-two-links']),
    );
  });

  it('notes a wide groove’s bridge and a cable too thick for the hinges', () => {
    const a = assemble(withArm({ cableDiameter: 11, tubeDiameter: 24 }));
    expect(infos(a)).toEqual(
      expect.arrayContaining([
        ['info', 'bridge', 'mount.arm.cableDiameter'],
        ['warning', 'cable-channel', 'mount.arm.cableDiameter'],
      ]),
    );
    const wall = assemble(
      wallLamp((m) => {
        m.arm.cableDiameter = 11;
        m.plate.cableExit = 'wall';
      }),
    );
    expect(infos(wall).map((w) => w[1])).not.toContain('bridge');
    expect(infos(assemble(wallLamp())).map((w) => w[1])).toEqual([]);
  });

  it('warns that a tilted swing elbow drifts unless it is locked', () => {
    expect(infos(assemble(swingElbow({ tilt: 20 })))).toContainEqual([
      'info',
      'elbow-drift',
      'mount.arm.lock',
    ]);
    for (const p of [
      swingElbow({ tilt: 0 }),
      swingElbow({ tilt: 20, lock: 'screw' }),
      foldElbow(),
    ]) {
      expect(infos(assemble(p)).map((w) => w[1])).not.toContain('elbow-drift');
    }
  });

  it('notes an arm too short to swing past a wide shade', () => {
    const a = assemble(
      wallLamp((m, p) => {
        m.arm.length = 80;
        m.arm.tilt = 0;
        const style = p.shades[0].style;
        if (style.family === 'revolved') style.bottomDiameter = 300;
      }),
    );
    expect(infos(a)).toContainEqual(['info', 'max-swing', 'mount.arm.length']);
    expect(a.derived.maxSwing).toBeLessThan(30);
  });
});

describe('the wall parts (step 0 stand-ins)', () => {
  // step 3: the link's geometry (shapes × profiles × roots × ends, cable probe,
  // overhangs, the mated pairs' intersections at rest and at tilt 40°) replaces
  // these placeholder checks; the plate, knee, hanger and knob have their own
  // test files (steps 1 and 2).
  it.each([
    ['one link', wallLamp()],
    ['a swing elbow', swingElbow()],
    ['a fold elbow', foldElbow()],
  ] as const)('build as valid solids within their footprints (%s)', (_name, p) => {
    const a = assemble(p, { quality: 'draft' });
    const mount = a.parts.filter((x) => !['hub', 'shade'].includes(x.id));
    withBuilt(k, tracker, mount, 'draft', (built) => {
      for (const b of built) {
        expect(b.stats.status, b.part.id).toBe('NoError');
        expect(b.stats.bbox.min[2], b.part.id).toBeCloseTo(0, 6);
        const f = b.part.bedFootprint!;
        const { min, max } = b.stats.bbox;
        expect(max[0] - min[0], b.part.id).toBeLessThanOrEqual(f.x + 1e-6);
        expect(max[1] - min[1], b.part.id).toBeLessThanOrEqual(f.y + 1e-6);
        expect(max[2], b.part.id).toBeLessThanOrEqual(f.z + 1e-6);
      }
    });
  });
});

describe('the snapshot', () => {
  it('matches the snapshot', () => {
    expect(summary(assemble(wallLamp()))).toMatchSnapshot();
  });
});

describe('the wall lamp projects', () => {
  const read = (url: URL) => parseProject(readFileSync(url, 'utf8'));
  const example = (id: string) =>
    read(new URL(`../../../src/examples/${id}.lamp.json`, import.meta.url));

  it('the v3 wall-arm fixture migrates and assembles without errors', () => {
    const project = read(new URL('../../fixtures/v3-wall-arm.lamp.json', import.meta.url));
    const a = assemble(project, { quality: 'draft' });
    expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    expect(a.parts.map((p) => p.id)).toEqual([
      'hub',
      'shade',
      'wallPlate',
      'knee',
      'wallArm',
      'hanger',
      'knob',
    ]);
    expect(armParams(a)).toMatchObject({ shape: 'curved', bendAngle: 30, length: 220 });
    expect(plateParams(a)).toMatchObject({ outline: 'roundedRect', width: 90, height: 130 });
    expect(a.context.kind).toBe('wall');
  });

  it('the Wall lamp example: a round Ø100 canopy and one straight 220 mm link at 20°', () => {
    const project = example('wall-lamp');
    expect(project.name).toBe('Aften');
    expect(project.hub.fused).toBe(false);
    expect(project.joints.shadeToHub).toBe('bayonet');
    expect(project.mount).toMatchObject({
      kind: 'wallArm',
      plate: { outline: 'round', width: 100, thickness: 10, domeHeight: 3, edge: 'round' },
      arm: { shape: 'straight', length: 220, tilt: 20, links: 1 },
    });
    const a = assemble(project, { quality: 'draft' });
    expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    expect(a.warnings.filter((w) => w.code === 'bed-fit')).toEqual([]);
    expect(a.parts.map((p) => [p.id, p.kind])).toEqual([
      ['hub', 'hub'],
      ['shade', 'shade'],
      ['wallPlate', 'wallPlate'],
      ['knee', 'knee'],
      ['wallArm', 'wallArm'],
      ['hanger', 'hanger'],
      ['knob', 'knob'],
    ]);
    expect(a.hubTransform).toEqual(IDENTITY);
  });

  it('the swing-arm example: two links on a swing elbow, every part fitting the bed', () => {
    const project = example('swing-arm');
    expect(project.mount).toMatchObject({
      kind: 'wallArm',
      arm: { links: 2, elbow: 'swing' },
    });
    const a = assemble(project, { quality: 'draft' });
    expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    expect(a.warnings.filter((w) => w.code === 'bed-fit')).toEqual([]);
    expect(a.parts.map((p) => [p.id, p.instances])).toEqual([
      ['hub', 1],
      ['shade', 1],
      ['wallPlate', 1],
      ['knee', 2],
      ['wallArm', 1],
      ['wallArm2', 1],
      ['hanger', 1],
      ['knob', 3],
    ]);
  });
});
