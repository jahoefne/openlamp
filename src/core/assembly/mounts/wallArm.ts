/**
 * The wall lamp: a canopy plate hung on two screws, a knee turning in the
 * plate's socket boss (the swing), an arm of one or two links on toothed
 * rosette hinges (the tilt; a second link on a swing or a fold elbow), and a
 * hanger at the arm's end whose female thread takes the hub's stub.
 *
 *   ┃ wall (y = wallY)
 *   ┃▐▌      ⊙═════════════⊙       shoulder hinge (on the knee's tang) … link … end hinge
 *   ┃▐▌     ┌┴┐  (tilt)    ┌┴┐     knee (its spigot in the plate's socket: swing)
 *   ┃▐▌     └┬┘            │ │     hanger: plumb under the end hinge
 *   ┃▐▌──────┘            ┌┴─┴┐    the hub, screwed up into the hanger: as every
 *   ┃▐▌                  ╱ hub ╲   hanging lamp, at the world origin at rest …
 *   ┃                   ╱ shade ╲  … and the shade below it
 *
 * Mechanisms (each built once, `features/`): the **pivot** (a spigot in a
 * socket bore, a 45° shoulder on a 45° seat cup; friction, or a grub screw),
 * the **rosette hinge** (a serrated tang between two serrated ears, an M5
 * bolt into a nut in a knob, 10° steps), the **hanger** (a pendulum on the
 * last hinge).
 *
 * Placement (`placement`): the chain plate → socket axis → `rotationZ(swing)`
 * → knee → hinge → `rotationX(tilt)` → link → [swing elbow: socket →
 * `rotationZ(elbowSwing)` → knee 2 → `rotationX(elbowTilt)` → link 2 | fold:
 * `rotationX(elbowTilt)` → link 2] → end hinge → hanger (`rotationZ(yaw)` ·
 * `rotationX(hubTilt)`) → hub. The world is the one where the hub is exactly
 * the identity at rest (`ZERO_POSE`) and the project's tilt; the pose moves
 * the lamp, the plate stays on the wall. See model/parts.ts for every part's
 * frames.
 */
import { SOCKET_WALL, pivotDims } from '../../geometry/features/pivot.ts';
import { deriveHanger, hangerBodyHeight, hangerFootprint } from '../../geometry/parts/hanger.ts';
import { deriveKnee, kneeFootprint } from '../../geometry/parts/knee.ts';
import { knobFootprint } from '../../geometry/parts/knob.ts';
import { deriveWallArm, printToLink, wallArmFootprint } from '../../geometry/parts/wallArm.ts';
import {
  KEYHOLE_EDGE_WALL,
  deriveWallPlate,
  maxKeyholeSpacing,
  plateOutlineDims,
  socketBossHeight,
  wallPlateFootprint,
} from '../../geometry/parts/wallPlate.ts';
import {
  IDENTITY,
  type JointInterface,
  type Mat4,
  type PartDraft,
  type RosetteSpec,
  type Warning,
} from '../../model/assembly.ts';
import type {
  HangerParams,
  KneeParams,
  KnobParams,
  RosetteHinge,
  WallArmParams,
  WallPlateParams,
} from '../../model/parts.ts';
import type { Joints, MountOf } from '../../model/project.ts';
import { printerLabel } from '../../schema/printers.ts';
import { HUB_THREAD_STUB, mountThreadJoint, pivotJoint, rosetteJoint } from '../interfaces.ts';
import {
  applyToPoint,
  compose,
  rotationX,
  rotationY,
  rotationZ,
  translation,
} from '../transforms.ts';
import {
  hangingTransforms,
  mountPartColour,
  mountShadeBottom,
  mountShadeParts,
  shadeInstanceTransforms,
} from './common.ts';
import {
  ZERO_POSE,
  type MountCtx,
  type MountModule,
  type MountParts,
  type MountPose,
  type MountShade,
} from './types.ts';

type WallMount = MountOf<'wallArm'>;

// ---------------------------------------------------------------- joints and constants

/** The hub ↔ hanger thread (the hub's stub is male, the hanger female). */
export const HUB_TO_ARM_JOINT_ID = 'hubToArm';
/** The knee's spigot in the plate's socket. */
export const PLATE_PIVOT_JOINT_ID = 'platePivot';
/** The knee's tang in the (inner) link's root clevis. */
export const SHOULDER_HINGE_JOINT_ID = 'shoulderHinge';
/** A swing elbow: the second knee's spigot in the inner link's socket boss. */
export const ELBOW_PIVOT_JOINT_ID = 'elbowPivot';
/** The elbow's hinge: knee 2's tang in the outer link's root clevis (swing), or the outer link's root tang in the inner link's end clevis (fold). */
export const ELBOW_HINGE_JOINT_ID = 'elbowHinge';
/** The hanger's tang in the last link's end clevis. */
export const HANGER_HINGE_JOINT_ID = 'hangerHinge';

/**
 * The pivot: a spigot of Ø `max(minDiameter, cable + cableExtra)`, `length`
 * below the seat plane, `play` above the sump at the bore's bottom (Ø cable +
 * 1 tall), a 45° seat cup `seat` deep; a socket boss's radius is the bore's ·
 * √2 + `bossWall` (around its teardrop).
 */
export const PIVOT = Object.freeze({
  minDiameter: 15,
  cableExtra: 8,
  length: 35,
  play: 1,
  seat: 3,
  bossWall: SOCKET_WALL,
});

/**
 * The rosette hinge: discs R 18, teeth on the annulus r 11–18 (36 teeth, 90°
 * V, 1.2 deep: 10° steps), tang 14, ears 8, an M5 × 40 bolt in a Ø5.5 hole,
 * its head in a Ø9 × 4 counterbore; the cable in a 7 × 7 channel around the
 * bolt (its centre line 2.75 + 1.2 + 3.5 = 7.5 from the axis). Every other
 * part keeps `sweptClearance` outside the discs (the swept circle R 19).
 */
export const ROSETTE = Object.freeze({
  radius: 18,
  teeth: 36,
  toothDepth: 1.2,
  innerRadius: 11,
  tangThickness: 14,
  earThickness: 8,
  boltHole: 5.5,
  headCounterbore: Object.freeze([9, 4] as const),
  channel: Object.freeze({ width: 7, radius: 7.5 }),
  sweptClearance: 1,
  bolt: Object.freeze({ size: 'M5', length: 40 }),
});

/** The hinge's knob: Ø32 × 10, six lobes, Ø5.5 bore, a hexagonal pocket for an M5 nut (8 AF, 4.7 tall). */
export const KNOB = Object.freeze({
  diameter: 32,
  height: 10,
  lobes: 6,
  boreDiameter: 5.5,
  nutAcrossFlats: 8.3,
  nutDepth: 5,
});

/**
 * The disc-on-edge rule: a disc of radius `radius` printed with its axis
 * horizontal enters a support of half-width `rSupport` (or the bed) within
 * 45° of the axis when the axis is this far above the support's top.
 */
export function axisAboveSupport(rSupport: number, radius: number = ROSETTE.radius): number {
  const edge = radius / Math.SQRT2;
  return rSupport >= edge ? edge : Math.sqrt(radius * radius - rSupport * rSupport);
}

/**
 * The knee: body Ø27 under a stalk 14 × 27, the hinge axis 24 above the seat
 * plane. The body's top stays clear of the clevis ears' swept circle (R 19
 * about the axis), so it is 24 − 19 = 5 above the seat plane (the plan's
 * "body × 10" would reach into the ears).
 */
export const KNEE = Object.freeze({
  bodyDiameter: 27,
  bodyHeight: 24 - (ROSETTE.radius + ROSETTE.sweptClearance),
  stalkWidth: ROSETTE.tangThickness,
  stalkDepth: 27,
  hingeHeight: 24,
});

/**
 * The hanger: body Ø28; its top stays clear of the end clevis's swept circle
 * (R 19 about the axis).
 */
export const HANGER = Object.freeze({
  bodyDiameter: 28,
  axisAboveBody: ROSETTE.radius + ROSETTE.sweptClearance,
  /** Material around the thread's countersunk mouth, at least. */
  minWall: 1.6,
});

/** The plate's keyholes: head hole Ø, slot width, travel from the head hole up to the screw's place. */
export const KEYHOLE = Object.freeze({ headDiameter: 9, slotWidth: 4.5, length: 12 });

/** The plate: corner radius (rounded rectangle), room around the boss + knee stack, the wall exit's hole Ø. */
export const PLATE = Object.freeze({ cornerRadius: 10, margin: 4, wallHole: 12 });

/** Thinnest wall the cable bore may leave in a tube, mm. */
const TUBE_MIN_WALL = 3;
/** The plate's rim at least this thick, and the cable + `PLATE_CABLE_EXTRA`, mm. */
const PLATE_MIN_THICKNESS = 9.5;
const PLATE_CABLE_EXTRA = 2.5;
/** Bridges wider than this get an info, mm. */
const MAX_BRIDGE = 11;

const mm = (n: number) => (Math.round(n * 10) / 10).toString();
const ceilTo = (n: number, step: number) => Math.ceil(n / step - 1e-9) * step;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Print frame ↔ room for the wall frames: (x, y, z) → (−x, z, y); its own inverse. */
const W: Mat4 = [-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

// ---------------------------------------------------------------- resolution

/** The rosette spec of every hinge. */
export function rosetteSpec(): RosetteSpec {
  return {
    radius: ROSETTE.radius,
    teeth: ROSETTE.teeth,
    toothDepth: ROSETTE.toothDepth,
    innerRadius: ROSETTE.innerRadius,
    tangThickness: ROSETTE.tangThickness,
    earThickness: ROSETTE.earThickness,
    boltHole: ROSETTE.boltHole,
  };
}

/** Every number a hinge's sides build from (the same for every hinge of the lamp). */
export function rosetteHinge(joints: Pick<Joints, 'tolerance'>): RosetteHinge {
  const spec = rosetteSpec();
  const earGap = spec.tangThickness + 2 * joints.tolerance;
  return {
    ...spec,
    tolerance: joints.tolerance,
    earGap,
    width: earGap + 2 * spec.earThickness,
    headCounterbore: [ROSETTE.headCounterbore[0], ROSETTE.headCounterbore[1]],
    channel: { width: ROSETTE.channel.width, radius: ROSETTE.channel.radius },
    axisHeight: spec.radius / Math.SQRT2,
    sweptRadius: spec.radius + ROSETTE.sweptClearance,
  };
}

/** The pivot's size for a cable (the spigot's Ø, length, the bore's depth, the seat, the sump). */
export function pivotSize(cableDiameter: number) {
  const sump = cableDiameter + 1;
  return {
    diameter: Math.max(PIVOT.minDiameter, cableDiameter + PIVOT.cableExtra),
    length: PIVOT.length,
    depth: PIVOT.length + PIVOT.play + sump,
    seat: PIVOT.seat,
    sump,
  };
}

/** The thread joint of the hub's mount face: its male stub (root Ø16, 12 mm) into the hanger. */
export function hubFaceJoint(ctx: Pick<MountCtx<'wallArm'>, 'joints' | 'printer'>) {
  return mountThreadJoint(
    HUB_TO_ARM_JOINT_ID,
    { male: 'hub', female: 'hanger' },
    HUB_THREAD_STUB,
    ctx.joints,
    ctx.printer.nozzle,
  );
}

/**
 * The boss + knee stack on the plate for a cable: the socket boss under the
 * seat plane, the knee above it up to its disc's top.
 */
export function plateStackHeight(cableDiameter: number): number {
  const pivot = pivotJoint(
    PLATE_PIVOT_JOINT_ID,
    { male: 'knee', female: 'wallPlate' },
    pivotSize(cableDiameter),
    { tolerance: 0 },
  );
  return socketBossHeight(pivot) + KNEE.hingeHeight + ROSETTE.radius;
}

/** The wall arm's parts, their params and joints. Pure. */
export interface WallArmResolution {
  plate: WallPlateParams;
  knee: KneeParams;
  /** The inner (or only) link, then the outer one. */
  links: WallArmParams[];
  hanger: HangerParams;
  knob: KnobParams;
  /** Two links: the elbow's kind. */
  elbow?: 'swing' | 'fold';
  /** Every joint: hubToArm, platePivot, shoulderHinge, [elbowPivot,] [elbowHinge,] hangerHinge. */
  interfaces: JointInterface[];
  /** The hub thread's checks. */
  warnings: Warning[];
}

export function resolveWallArm(
  ctx: Pick<MountCtx<'wallArm'>, 'mount' | 'joints' | 'printer' | 'quality'>,
): WallArmResolution {
  const { mount, joints, quality } = ctx;
  const { plate, arm } = mount;
  const cable = arm.cableDiameter;
  const bore = cable + 1;
  const twoLinks = arm.links >= 2;
  const elbow = twoLinks ? arm.elbow : undefined;
  const size = pivotSize(cable);
  const rosette = rosetteHinge(joints);
  const spec = rosetteSpec();
  const hub = hubFaceJoint(ctx);
  const lastLink = twoLinks ? 'wallArm2' : 'wallArm';

  const platePivot = pivotJoint(
    PLATE_PIVOT_JOINT_ID,
    { male: 'knee', female: 'wallPlate' },
    size,
    joints,
  );
  const shoulder = rosetteJoint(
    SHOULDER_HINGE_JOINT_ID,
    { male: 'knee', female: 'wallArm' },
    spec,
    joints,
  );
  const interfaces: JointInterface[] = [hub.iface, platePivot, shoulder];
  let elbowPivot: JointInterface | undefined;
  if (elbow === 'swing') {
    elbowPivot = pivotJoint(
      ELBOW_PIVOT_JOINT_ID,
      { male: 'knee', female: 'wallArm' },
      size,
      joints,
    );
    interfaces.push(
      elbowPivot,
      rosetteJoint(ELBOW_HINGE_JOINT_ID, { male: 'knee', female: 'wallArm2' }, spec, joints),
    );
  } else if (elbow === 'fold') {
    interfaces.push(
      rosetteJoint(ELBOW_HINGE_JOINT_ID, { male: 'wallArm2', female: 'wallArm' }, spec, joints),
    );
  }
  interfaces.push(
    rosetteJoint(HANGER_HINGE_JOINT_ID, { male: 'hanger', female: lastLink }, spec, joints),
  );

  // The plate: the boss + knee stack centred on it.
  const bossHeight = socketBossHeight(platePivot);
  const kneeTop = KNEE.hingeHeight + ROSETTE.radius;
  const plateParams: WallPlateParams = {
    outline: plate.outline,
    width: plate.width,
    height: plate.outline === 'round' ? plate.width : plate.height,
    cornerRadius: PLATE.cornerRadius,
    thickness: plate.thickness,
    edge: plate.edge,
    edgeSize: plate.edgeSize,
    domeHeight: plate.domeHeight,
    keyholes: { spacing: plate.keyholeSpacing, ...KEYHOLE },
    cable: {
      exit: plate.cableExit,
      grooveWidth: bore,
      grooveDepth: cable + 0.5,
      passage: bore,
      wallHole: PLATE.wallHole,
    },
    socket: { pivot: platePivot, seatY: (bossHeight - kneeTop) / 2, lock: arm.lock },
    profile: arm.profile,
    quality,
  };

  const pv = pivotDims(platePivot);
  const knee: KneeParams = {
    pivot: platePivot,
    rosette,
    bodyDiameter: Math.max(KNEE.bodyDiameter, ceilTo(2 * (pv.rSeat + 1), 0.5)),
    bodyHeight: KNEE.bodyHeight,
    stalk: { width: KNEE.stalkWidth, depth: KNEE.stalkDepth },
    hingeHeight: KNEE.hingeHeight,
    boreDiameter: bore,
    profile: arm.profile,
    quality,
  };

  const link = (
    length: number,
    root: WallArmParams['root'],
    end: WallArmParams['end'],
  ): WallArmParams => ({
    shape: arm.shape,
    // A straight link does not bend: one key for every straight link.
    bendAngle: arm.shape === 'curved' ? arm.bendAngle : 0,
    length,
    tubeDiameter: arm.tubeDiameter,
    boreDiameter: bore,
    profile: arm.profile,
    root,
    end,
    rosette,
    quality,
  });
  const links: WallArmParams[] = [];
  if (!twoLinks) {
    links.push(link(arm.length, 'clevis', { kind: 'clevis' }));
  } else {
    const inner = round1(arm.length * arm.elbowAt);
    const outer = round1(arm.length - inner);
    links.push(
      link(
        inner,
        'clevis',
        elbowPivot ? { kind: 'socket', pivot: elbowPivot, lock: arm.lock } : { kind: 'clevis' },
      ),
      link(outer, elbow === 'fold' ? 'tang' : 'clevis', { kind: 'clevis' }),
    );
  }

  const thread = hub.iface;
  const rMouth = thread.nominalDiameter / 2 + thread.tolerance + (thread.thread?.depth ?? 0) + 0.5;
  const hanger: HangerParams = {
    rosette,
    hubJoint: thread,
    boreDiameter: bore,
    bodyDiameter: Math.max(HANGER.bodyDiameter, ceilTo(2 * (rMouth + HANGER.minWall), 0.5)),
    bodyHeight: ceilTo(hangerBodyHeight(thread, bore), 0.5),
    axisAboveBody: HANGER.axisAboveBody,
    quality,
  };
  const knob: KnobParams = {
    diameter: KNOB.diameter,
    height: KNOB.height,
    lobes: KNOB.lobes,
    boreDiameter: KNOB.boreDiameter,
    nut: { acrossFlats: KNOB.nutAcrossFlats, depth: KNOB.nutDepth },
    quality,
  };
  return {
    plate: plateParams,
    knee,
    links,
    hanger,
    knob,
    ...(elbow ? { elbow } : {}),
    interfaces,
    warnings: hub.warnings,
  };
}

// ---------------------------------------------------------------- placement chain

/** What the chain needs of the resolved parts. */
interface ChainParts {
  plate: WallPlateParams;
  knee: KneeParams;
  links: readonly WallArmParams[];
  hanger: HangerParams;
  elbow?: 'swing' | 'fold' | undefined;
}

/** Print frame → "plate world" (the plate's back face on y 0, its centre at z 0) of everything. */
interface ArmFrames {
  plate: Mat4;
  /** Every knee copy (the plate's, then a swing elbow's). */
  knees: Mat4[];
  links: Mat4[];
  hanger: Mat4;
  hub: Mat4;
  /** Every knob copy: the shoulder's, the elbow's (two links), the hanger's. */
  knobs: Mat4[];
  /** Hinge frames (origin on the axis in the mid-plane, x along it). */
  shoulder: Mat4;
  /** The outer link's root hinge (two links). */
  elbow?: Mat4;
  /** A swing elbow's pivot: the second knee's frame (its seat point). */
  elbowSeat?: Mat4;
  end: Mat4;
  /** The plate's socket axis (the knee frame at rest). */
  socket: Mat4;
  /** The hanger's (and the hub's) turn about the vertical, degrees. */
  yaw: number;
}

function armFrames(
  r: ChainParts,
  arm: Pick<WallMount['arm'], 'tilt' | 'elbowTilt'>,
  zFace: number,
  pose: Readonly<MountPose>,
): ArmFrames {
  const pd = deriveWallPlate(r.plate);
  const kd = deriveKnee(r.knee);
  const hd = deriveHanger(r.hanger);
  const kneePrint = translation(0, 0, -kd.spigotLength);
  const socket = translation(0, pd.socketZ, pd.seatY);
  const k1 = compose(socket, rotationZ(pose.swing));
  const shoulder = compose(k1, translation(0, 0, kd.seatToHinge), rotationX(arm.tilt));
  const d1 = deriveWallArm(r.links[0]!);
  const knees = [compose(k1, kneePrint)];
  const links = [compose(shoulder, W, printToLink(d1))];
  // The knob sits on its clevis's frame (the link that carries the ears).
  const knobHinges = [shoulder];
  let end = compose(shoulder, translation(0, d1.length, 0));
  let elbow: Mat4 | undefined;
  let elbowSeat: Mat4 | undefined;
  const outer = r.links[1];
  if (outer) {
    const d2 = deriveWallArm(outer);
    if (r.elbow === 'swing') {
      // The inner link's socket: its seat on the axis through the chord's end.
      const k2 = compose(shoulder, translation(0, d1.length, d1.seatY), rotationZ(pose.elbowSwing));
      knees.push(compose(k2, kneePrint));
      elbowSeat = k2;
      elbow = compose(k2, translation(0, 0, kd.seatToHinge), rotationX(arm.elbowTilt));
      knobHinges.push(elbow);
    } else {
      // The inner link's end clevis carries the outer link's root tang.
      knobHinges.push(end);
      elbow = compose(end, rotationX(arm.elbowTilt));
    }
    links.push(compose(elbow, W, printToLink(d2)));
    end = compose(elbow, translation(0, d2.length, 0));
  }
  knobHinges.push(end);
  // The hanger hangs plumb under the end hinge, turned with its axis.
  const yaw = (Math.atan2(end[1]!, end[0]!) * 180) / Math.PI;
  const hangerFrame = compose(
    translation(end[12]!, end[13]!, end[14]!),
    rotationZ(yaw),
    rotationX(pose.hubTilt),
  );
  const width = r.knee.rosette.width;
  return {
    plate: [...W],
    knees,
    links,
    hanger: compose(hangerFrame, translation(0, 0, -hd.drop)),
    hub: compose(hangerFrame, translation(0, 0, -hd.drop - zFace)),
    knobs: knobHinges.map((h) => compose(h, translation(width / 2, 0, 0), rotationY(90))),
    shoulder,
    ...(elbow ? { elbow } : {}),
    ...(elbowSeat ? { elbowSeat } : {}),
    end,
    socket,
    yaw,
  };
}

/** Whether a transform is exactly the identity. */
function isIdentity(m: Mat4): boolean {
  return m.every((v, i) => v === IDENTITY[i]);
}

/** The world point a frame's origin is at. */
const origin = (m: Mat4): [number, number, number] => [m[12]!, m[13]!, m[14]!];

/**
 * How far the arm may swing (degrees, at most 90: the wall is the end stop)
 * before the widest shade touches the wall: the hub circles the socket axis
 * at its distance `reach`, the socket axis is `socketZ` out from the wall.
 */
function maxSwingOf(reach: number, socketZ: number, shadeRadius: number): number {
  if (reach <= 1e-9) return 90;
  const c = (shadeRadius - socketZ) / reach;
  if (c >= 1) return 0;
  if (c <= 0) return 90;
  return Math.round(((Math.acos(c) * 180) / Math.PI) * 10) / 10;
}

/** The arm's frames at rest and its swing limit. */
function restFrames(r: ChainParts, mount: WallMount, zFace: number, shades: readonly MountShade[]) {
  const rest = armFrames(r, mount.arm, zFace, ZERO_POSE);
  const pd = deriveWallPlate(r.plate);
  const [hx, hy] = origin(rest.hub);
  const reach = Math.hypot(hx, hy - pd.socketZ);
  const shadeRadius = Math.max(0, ...shades.map((s) => s.radius ?? 0));
  return { rest, maxSwing: maxSwingOf(reach, pd.socketZ, shadeRadius) };
}

/** The resolved parts again, from the drafts (as `parts` made them). */
function chainParts(parts: MountParts): ChainParts {
  let plate: WallPlateParams | undefined;
  let knee: KneeParams | undefined;
  let hanger: HangerParams | undefined;
  const links: WallArmParams[] = [];
  for (const d of parts.parts) {
    if (d.kind === 'wallPlate') plate = d.params;
    else if (d.kind === 'knee') knee = d.params;
    else if (d.kind === 'hanger') hanger = d.params;
    else if (d.kind === 'wallArm') links.push(d.params);
  }
  if (!plate || !knee || !hanger || links.length === 0) {
    throw new Error('The wall arm’s parts are incomplete');
  }
  const elbow = links.length < 2 ? undefined : links[0]!.end.kind === 'socket' ? 'swing' : 'fold';
  return { plate, knee, links, hanger, elbow };
}

// ---------------------------------------------------------------- print notes

const PLATE_PRINT_NOTES = [
  'Print as exported: back face on the bed. No supports needed.',
  'Hang the plate on two level screws: their heads go into the keyholes on the back, then slide it down.',
];
const KNEE_PRINT_NOTES = [
  'Print as exported: spigot end on the bed, with a brim. No supports needed.',
  'Drop its spigot into a socket: the arm swings on it.',
];
const LINK_PRINT_NOTES = [
  'Print as exported: standing on its clevis, with a brim (a tall, slim part). No supports needed.',
];
const HANGER_PRINT_NOTES = [
  'Print as exported: thread mouth on the bed. No supports needed.',
  'Screw the hub into the hanger, clockwise seen from below.',
];
const KNOB_PRINT_NOTES = [
  'Print as exported: flat. Press an M5 nut into the hexagonal pocket.',
  'One per hinge: an M5 × 40 bolt through the ears and the tang into the knob’s nut; tighten the knob to lock the teeth.',
];
const LOCK_NOTE =
  'Press an M3 heat-set insert into the pocket on the socket boss; an M3 grub screw in it locks the pivot.';

// ---------------------------------------------------------------- the module

export const wallArmMount: MountModule<'wallArm'> = {
  kind: 'wallArm',
  partKinds: ['wallPlate', 'knee', 'wallArm', 'hanger', 'knob'],

  /**
   * Links a whole number, tilts in the teeth's steps; the tube must leave the
   * cable bore a wall, the plate's rim the groove a skin; the plate must hold
   * the keyholes and the boss + knee stack, the keyholes stay inside it.
   */
  normalize(mount) {
    const warnings: Warning[] = [];
    const warn = (paramPath: string, message: string) =>
      warnings.push({ severity: 'warning', code: 'adjusted', paramPath, message });
    const arm = { ...mount.arm };
    const plate = { ...mount.plate };
    arm.links = Math.round(arm.links);
    const step = 360 / ROSETTE.teeth;
    for (const [key, label] of [
      ['tilt', 'Tilt'],
      ['elbowTilt', 'Elbow tilt'],
    ] as const) {
      const v = Math.round(arm[key] / step) * step + 0;
      if (Math.abs(v - arm[key]) > 1e-9) {
        warn(
          `mount.arm.${key}`,
          `${label} rounded to ${v}°: the hinge’s teeth lock in ${step}° steps`,
        );
        arm[key] = v;
      }
    }
    const bore = arm.cableDiameter + 1;
    const tubeMin = ceilTo(bore + 2 * TUBE_MIN_WALL, 0.5);
    if (arm.tubeDiameter < tubeMin) {
      arm.tubeDiameter = tubeMin;
      warn(
        'mount.arm.tubeDiameter',
        `Arm tube Ø raised to ${mm(tubeMin)} mm so the Ø${mm(bore)} mm cable bore keeps a ${TUBE_MIN_WALL} mm wall`,
      );
    }
    const thicknessMin = ceilTo(
      Math.max(PLATE_MIN_THICKNESS, arm.cableDiameter + PLATE_CABLE_EXTRA),
      0.5,
    );
    if (plate.thickness < thicknessMin) {
      plate.thickness = thicknessMin;
      warn(
        'mount.plate.thickness',
        `Wall plate thickness raised to ${mm(thicknessMin)} mm so the Ø${mm(arm.cableDiameter)} mm cable’s groove in its back leaves the front closed`,
      );
    }
    const round = plate.outline === 'round';
    const keyholeWidth = Math.ceil(
      plate.keyholeSpacing + KEYHOLE.headDiameter + 2 * KEYHOLE_EDGE_WALL - 1e-9,
    );
    if (plate.width < keyholeWidth) {
      plate.width = keyholeWidth;
      warn(
        'mount.plate.width',
        `Wall plate ${round ? 'Ø' : 'width'} raised to ${keyholeWidth} mm so it holds both keyholes, ${mm(plate.keyholeSpacing)} mm apart`,
      );
    }
    const stack = Math.ceil(plateStackHeight(arm.cableDiameter) + 2 * PLATE.margin - 1e-9);
    if (round && plate.width < stack) {
      plate.width = stack;
      warn(
        'mount.plate.width',
        `Wall plate Ø raised to ${stack} mm so it holds the socket boss and the knee`,
      );
    } else if (!round && plate.height < stack) {
      plate.height = stack;
      warn(
        'mount.plate.height',
        `Wall plate height raised to ${stack} mm so it holds the socket boss and the knee`,
      );
    }
    const dims = plateOutlineDims(plate.outline, plate.width, plate.height, PLATE.cornerRadius);
    const spacingMax = maxKeyholeSpacing(dims, KEYHOLE);
    if (plate.keyholeSpacing > spacingMax) {
      plate.keyholeSpacing = spacingMax;
      warn(
        'mount.plate.keyholeSpacing',
        `Keyhole spacing reduced to ${spacingMax} mm so both keyholes stay inside the plate`,
      );
    }
    const changed =
      (Object.keys(arm) as (keyof typeof arm)[]).some((k) => arm[k] !== mount.arm[k]) ||
      (Object.keys(plate) as (keyof typeof plate)[]).some((k) => plate[k] !== mount.plate[k]);
    return changed ? { mount: { ...mount, arm, plate }, warnings } : { mount, warnings };
  },

  validate(ctx) {
    const { plate, arm } = ctx.mount;
    const r = resolveWallArm(ctx);
    const warnings: Warning[] = [];
    const bedZ = ctx.printer.bed[2];
    if (r.links.length === 1) {
      const z = wallArmFootprint(r.links[0]!).z;
      if (z > bedZ) {
        warnings.push({
          severity: 'info',
          code: 'use-two-links',
          partId: 'wallArm',
          paramPath: 'mount.arm.links',
          message: `In one link, the ${mm(arm.length)} mm arm prints ${mm(z)} mm tall, more than the ${printerLabel(ctx.printer)}’s ${mm(bedZ)} mm: use two links (each prints about half as tall).`,
        });
      }
    }
    const groove = r.plate.cable.grooveWidth;
    if (plate.cableExit !== 'wall' && groove > MAX_BRIDGE) {
      warnings.push({
        severity: 'info',
        code: 'bridge',
        partId: 'wallPlate',
        paramPath: 'mount.arm.cableDiameter',
        message: `The cable’s groove in the plate’s back is ${mm(groove)} mm wide: its ceiling bridges more than ${MAX_BRIDGE} mm.`,
      });
    }
    if (arm.cableDiameter + 1 > ROSETTE.channel.width) {
      warnings.push({
        severity: 'warning',
        code: 'cable-channel',
        partId: 'wallArm',
        paramPath: 'mount.arm.cableDiameter',
        message: `A Ø${mm(arm.cableDiameter)} mm cable does not fit through the hinges’ ${ROSETTE.channel.width} mm channel; use a cable of Ø${ROSETTE.channel.width - 1} mm or less.`,
      });
    }
    if (r.elbow === 'swing' && arm.tilt !== 0 && arm.lock === 'friction') {
      warnings.push({
        severity: 'info',
        code: 'elbow-drift',
        partId: 'wallArm',
        paramPath: 'mount.arm.lock',
        message:
          'The arm is tilted, so the swing elbow’s pivot leans: the outer link drifts downhill unless the pivots are locked (Pivot lock: grub screw).',
      });
    }
    return warnings;
  },

  hubFace: (ctx) => ({
    kind: 'threadMale',
    joint: hubFaceJoint(ctx).iface,
    cableDiameter: ctx.mount.arm.cableDiameter,
  }),

  parts(ctx) {
    const r = resolveWallArm(ctx);
    const lock = ctx.mount.arm.lock === 'screw';
    const swing = r.elbow === 'swing';
    const kneeCopies = swing ? 2 : 1;
    const knobCopies = r.links.length + 1;
    const colour = (id: string, kind: PartDraft['kind']) => mountPartColour(ctx, id, kind);
    const parts: PartDraft[] = [
      {
        id: 'wallPlate',
        kind: 'wallPlate',
        displayName: 'Wall plate',
        params: r.plate,
        colour: colour('wallPlate', 'wallPlate'),
        footprint: wallPlateFootprint(r.plate),
        printNotes: [...PLATE_PRINT_NOTES, ...(lock ? [LOCK_NOTE] : [])],
      },
      {
        id: 'knee',
        kind: 'knee',
        displayName: kneeCopies > 1 ? `Knee ×${kneeCopies}` : 'Knee',
        params: r.knee,
        colour: colour('knee', 'knee'),
        footprint: kneeFootprint(r.knee),
        printNotes: [
          ...(kneeCopies > 1 ? [`Print ${kneeCopies} of these.`] : []),
          ...KNEE_PRINT_NOTES,
        ],
        ...(kneeCopies > 1 ? { instances: kneeCopies } : {}),
      },
    ];
    r.links.forEach((params, i) => {
      const id = i === 0 ? 'wallArm' : 'wallArm2';
      parts.push({
        id,
        kind: 'wallArm',
        displayName: r.links.length === 1 ? 'Wall arm' : i === 0 ? 'Inner arm' : 'Outer arm',
        params,
        colour: colour(id, 'wallArm'),
        footprint: wallArmFootprint(params),
        printNotes: [
          ...LINK_PRINT_NOTES,
          ...(params.end.kind === 'socket' && lock ? [LOCK_NOTE] : []),
        ],
      });
    });
    parts.push(
      {
        id: 'hanger',
        kind: 'hanger',
        displayName: 'Hanger',
        params: r.hanger,
        colour: colour('hanger', 'hanger'),
        footprint: hangerFootprint(r.hanger),
        printNotes: [...HANGER_PRINT_NOTES],
      },
      {
        id: 'knob',
        kind: 'knob',
        displayName: `Knob ×${knobCopies}`,
        params: r.knob,
        colour: colour('knob', 'knob'),
        footprint: knobFootprint(r.knob),
        printNotes: [`Print ${knobCopies} of these.`, ...KNOB_PRINT_NOTES],
        instances: knobCopies,
      },
    );
    const warnings = [...r.warnings];
    const { maxSwing } = restFrames(r, ctx.mount, ctx.hub.derived.zFace, ctx.shades);
    if (maxSwing < 30) {
      warnings.push({
        severity: 'info',
        code: 'max-swing',
        partId: 'wallArm',
        paramPath: 'mount.arm.length',
        message:
          maxSwing <= 0
            ? 'The shade reaches the wall: lengthen the arm (or use a narrower shade).'
            : `The arm swings only ${mm(maxSwing)}° to either side before the shade touches the wall; a longer arm swings further.`,
      });
    }
    return { parts, interfaces: r.interfaces, warnings };
  },

  placement(ctx, parts, pose) {
    const r = chainParts(parts);
    const zFace = ctx.hub.derived.zFace;
    const { rest, maxSwing } = restFrames(r, ctx.mount, zFace, ctx.shades);
    const posed = armFrames(r, ctx.mount.arm, zFace, pose);
    // The world: the hub at the origin at rest.
    const [px, py, pz] = origin(rest.hub);
    const offset = translation(-px, -py, -pz);
    const world = (m: Mat4) => compose(offset, m);
    const hubTransform = world(posed.hub);
    const atRest = isIdentity(hubTransform);
    const hanging = hangingTransforms(ctx);
    const shadeTransforms: Record<string, Mat4> = {};
    if (atRest) {
      Object.assign(shadeTransforms, hanging.shadeTransforms);
    } else {
      for (const shade of ctx.shades) {
        for (const part of mountShadeParts(shade)) {
          shadeTransforms[part.id] = compose(hubTransform, part.transform);
        }
      }
    }
    const instanceTransforms = atRest
      ? hanging.instanceTransforms
      : shadeInstanceTransforms(ctx.shades, hubTransform);
    const partTransforms: Record<string, Mat4> = {
      wallPlate: world(posed.plate),
      knee: world(posed.knees[0]!),
      wallArm: world(posed.links[0]!),
      hanger: world(posed.hanger),
      knob: world(posed.knobs[0]!),
    };
    if (posed.links[1]) partTransforms.wallArm2 = world(posed.links[1]);
    instanceTransforms.knee = posed.knees.map(world);
    instanceTransforms.knob = posed.knobs.map(world);

    const pd = deriveWallPlate(r.plate);
    const wallY = -py;
    const plateZ = -pz;
    const tilt = Math.abs(Math.sin((pose.hubTilt * Math.PI) / 180));
    let bottomZ = plateZ - pd.halfHeight;
    for (const shade of ctx.shades) {
      const bottom = applyToPoint(hubTransform, [0, 0, mountShadeBottom(shade)])[2]!;
      bottomZ = Math.min(bottomZ, bottom - (shade.radius ?? 0) * tilt);
    }
    const at = (m: Mat4) => applyToPoint(offset, origin(m));
    const [shoulderX, shoulderY, shoulderZ] = at(posed.shoulder);
    const [endX, endY, endZ] = at(posed.end);
    // The elbow: a swing elbow's pivot seat, a fold elbow's hinge axis.
    const elbowFrame = posed.elbowSeat ?? posed.elbow;
    const elbow = elbowFrame ? at(elbowFrame) : undefined;
    return {
      hubTransform,
      shadeTransforms,
      partTransforms,
      instanceTransforms,
      bottomZ,
      context: { kind: 'wall', wallY },
      derived: {
        wallY,
        plateZ,
        socketY: wallY + pd.socketZ,
        seatZ: plateZ + pd.seatY,
        shoulderX: shoulderX!,
        shoulderY: shoulderY!,
        shoulderZ: shoulderZ!,
        ...(elbow ? { elbowX: elbow[0]!, elbowY: elbow[1]!, elbowZ: elbow[2]! } : {}),
        endX: endX!,
        endY: endY!,
        endZ: endZ!,
        hubYaw: posed.yaw,
        maxSwing,
        armLength: ctx.mount.arm.length,
        armTilt: ctx.mount.arm.tilt,
        armLinks: r.links.length,
        cableDiameter: ctx.mount.arm.cableDiameter,
      },
    };
  },
};
