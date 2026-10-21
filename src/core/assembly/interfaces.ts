/**
 * Joint interfaces, resolved once per assembly without WASM: the light
 * envelope gives the hub core, the core gives the shade collar, the collar
 * gives the joint the hub (female) and the shade (male) both build from.
 *
 *   light ──► envelope.rCore ──► collar Ø = 2·(rCore + 1.5) ──► JointInterface
 *                                     │                          ├─► hub ring
 *                                     └─► seat radius ───────────┴─► shade collar + seat
 */
import { M3 } from '../geometry/joints/screw.ts';
import type { JointInterface, Warning } from '../model/assembly.ts';
import type { CollarDims, LightEnvelope } from '../model/parts.ts';
import type { Hub, Joints, ShadeSpec } from '../model/project.ts';

/** Length of a collar joint along the axis, mm. */
export const COLLAR_JOINT_LENGTH = 8;
/** Radial room between the hub core and the collar's body, mm. */
export const COLLAR_CORE_CLEARANCE = 1.5;
/** The press fit's clearance is this much smaller than `joints.tolerance` (0.3 → 0.2 mm) … */
export const SNAP_CLEARANCE_REDUCTION = 0.1;
/** … and its crush ribs stand this much further out than the clearance (0.3 mm). */
export const SNAP_CRUSH = 0.1;

export const BAYONET_DEFAULTS = Object.freeze({
  lugs: 3,
  lugWidth: 6,
  lugHeight: 2,
  lugDepth: 1.6,
  travel: 35,
});

export const SNAP_RIBS = 3;

/** The id of the outer shade's joint in `Assembly.interfaces`. */
export const SHADE_JOINT_ID = 'shadeToHub';

const mm = (n: number) => (Math.round(n * 100) / 100).toString();

/** How far a collar joint's features stand out of the collar body; the hub ring must hold them. */
export function jointRadialDepth(iface: JointInterface): number {
  switch (iface.type) {
    case 'bayonet':
      return iface.bayonet?.lugDepth ?? 0;
    case 'thread':
      return iface.thread?.depth ?? 0;
    case 'snap':
    case 'screw':
      return 0;
  }
}

/** The collar diameter the hub core asks for: `2·(rCore + 1.5)`. */
export function autoCollarDiameter(envelope: LightEnvelope): number {
  return 2 * (envelope.rCore + COLLAR_CORE_CLEARANCE);
}

/** The collar, the hub ring and the shade seat of a joint. */
export function collarDims(iface: JointInterface, collarWall: number): CollarDims {
  const radius = iface.nominalDiameter / 2;
  const ringInnerRadius = radius + iface.tolerance;
  return {
    radius,
    wall: collarWall,
    ringInnerRadius,
    seatRadius: ringInnerRadius + jointRadialDepth(iface) + collarWall,
  };
}

/**
 * The smallest top diameter of a shade hanging from this collar: the seat
 * (the hub ring's outer diameter, `D + 2·(collarWall + depth + tolerance)`)
 * plus 2 mm, so the shade's shoulder cone has room to rise to it.
 */
export function minShadeTopDiameter(collar: CollarDims): number {
  return 2 * collar.seatRadius + 2;
}

export interface ShadeJointResolution {
  iface: JointInterface;
  collar: CollarDims;
  warnings: Warning[];
}

/**
 * The shade ↔ hub joint of type `joints.shadeToHub`: male = the shade, female
 * = the hub, collar Ø from the light envelope (or the shade's larger
 * `collarDiameter`). Geometry defaults per type: bayonet 3 lugs 6 × 2 × 1.6 mm
 * with 35° travel; snap clearance `tolerance − 0.1` with 3 ribs 0.1 mm proud of
 * it; thread pitch and depth from `joints`, 45° flanks, right hand. All 8 mm
 * long. Checks that do not adjust anything come back as warnings.
 */
export function resolveShadeJoint(
  joints: Joints,
  hub: Pick<Hub, 'collarWall'>,
  envelope: LightEnvelope,
  shade: Pick<ShadeSpec, 'collarDiameter'>,
  ids: { male: string; female: string },
  nozzle = 0.4,
): ShadeJointResolution {
  const warnings: Warning[] = [];
  const auto = autoCollarDiameter(envelope);
  let nominalDiameter = auto;
  if (shade.collarDiameter !== undefined) {
    if (shade.collarDiameter >= auto) {
      nominalDiameter = shade.collarDiameter;
    } else {
      warnings.push({
        severity: 'warning',
        code: 'adjusted',
        paramPath: 'shades.0.collarDiameter',
        partId: ids.male,
        message: `collarDiameter ${mm(shade.collarDiameter)} mm is smaller than the ${mm(auto)} mm the light needs; using ${mm(auto)} mm`,
      });
    }
  }
  const base = {
    id: SHADE_JOINT_ID,
    nominalDiameter,
    length: COLLAR_JOINT_LENGTH,
    male: ids.male,
    female: ids.female,
  };
  let iface: JointInterface;
  switch (joints.shadeToHub) {
    case 'bayonet':
      iface = {
        ...base,
        type: 'bayonet',
        tolerance: joints.tolerance,
        bayonet: { ...BAYONET_DEFAULTS },
      };
      break;
    case 'snap': {
      const tolerance = Math.max(0.05, joints.tolerance - SNAP_CLEARANCE_REDUCTION);
      iface = {
        ...base,
        type: 'snap',
        tolerance,
        snap: { ribs: SNAP_RIBS, ribHeight: tolerance + SNAP_CRUSH },
      };
      break;
    }
    case 'thread':
      iface = {
        ...base,
        type: 'thread',
        tolerance: joints.tolerance,
        thread: { pitch: joints.threadPitch, depth: joints.threadDepth, flank: 45, hand: 'right' },
      };
      break;
  }
  const collar = collarDims(iface, hub.collarWall);

  const warn = (message: string, paramPath: string) =>
    warnings.push({ severity: 'warning', code: 'joint', partId: ids.female, paramPath, message });
  if (iface.thread) {
    const { pitch } = iface.thread;
    if (nominalDiameter < 10)
      warn('Printed threads under Ø10 mm are unreliable.', 'joints.shadeToHub');
    if (pitch < 4 * nozzle) {
      warn(
        `Thread pitch ${mm(pitch)} mm is under 4 × the ${mm(nozzle)} mm nozzle; the teeth will not print cleanly.`,
        'joints.threadPitch',
      );
    }
    if (iface.length < 2 * pitch) {
      warn(
        `An ${mm(iface.length)} mm long thread has fewer than two turns at a ${mm(pitch)} mm pitch.`,
        'joints.threadPitch',
      );
    }
  }
  if (iface.bayonet && hub.collarWall < 1.6) {
    warn(
      `A ${mm(hub.collarWall)} mm collar wall is thin for the bayonet's grooves; 1.6 mm or more is safer.`,
      'hub.collarWall',
    );
  }
  return { iface, collar, warnings };
}

/**
 * An M3 screw joint on a bolt circle: through holes and counterbores on the
 * male part, heat-set insert pockets (`joints.heatSet`) or tapping holes on
 * the female part. For the mounts of M2.2.
 */
export function screwJoint(
  id: string,
  ids: { male: string; female: string },
  boltCircle: number,
  joints: Pick<Joints, 'heatSet'>,
  count = 4,
): JointInterface {
  return {
    id,
    type: 'screw',
    nominalDiameter: boltCircle,
    length: 0,
    tolerance: 0,
    screw: {
      count,
      hole: M3.hole,
      counterbore: [M3.counterbore[0], M3.counterbore[1]],
      ...(joints.heatSet ? { insertPocket: [M3.insertPocket[0], M3.insertPocket[1]] } : {}),
    },
    male: ids.male,
    female: ids.female,
  };
}

/** The hub's male threaded stub of the wall arm: root Ø × thread length, mm. */
export const HUB_THREAD_STUB = Object.freeze({ diameter: 16, length: 12 });
/** The hub's female threaded bore of the standing lamp: (the stem's) root Ø × depth, mm. */
export const HUB_THREAD_BORE = Object.freeze({ diameter: 20, length: 14 });
/** The canopy's collet neck and the cord grip: root Ø × thread length, mm. */
export const COLLET_THREAD = Object.freeze({ diameter: 16, length: 10 });

/** The largest thread depth per pitch that leaves a crest and a root (see joints/thread.ts). */
const MAX_THREAD_DEPTH_PER_PITCH = 0.4;

/**
 * A printed thread between two mount parts (or the hub and a mount part):
 * pitch, depth and tolerance from `joints` (the depth capped at 0.4 × the
 * pitch), 45° flanks, right hand. `nominalDiameter` is the male's root Ø.
 * Checks that do not adjust anything come back as warnings on `ids.female`.
 */
export function mountThreadJoint(
  id: string,
  ids: { male: string; female: string },
  size: { diameter: number; length: number },
  joints: Pick<Joints, 'tolerance' | 'threadPitch' | 'threadDepth'>,
  nozzle = 0.4,
): { iface: JointInterface; warnings: Warning[] } {
  const pitch = joints.threadPitch;
  const depth = Math.min(
    joints.threadDepth,
    Math.round(MAX_THREAD_DEPTH_PER_PITCH * pitch * 100) / 100,
  );
  const iface: JointInterface = {
    id,
    type: 'thread',
    nominalDiameter: size.diameter,
    length: size.length,
    tolerance: joints.tolerance,
    thread: { pitch, depth, flank: 45, hand: 'right' },
    male: ids.male,
    female: ids.female,
  };
  const warnings: Warning[] = [];
  const warn = (message: string) =>
    warnings.push({
      severity: 'warning',
      code: 'joint',
      partId: ids.female,
      paramPath: 'joints.threadPitch',
      message,
    });
  if (pitch < 4 * nozzle) {
    warn(
      `Thread pitch ${mm(pitch)} mm is under 4 × the ${mm(nozzle)} mm nozzle; the teeth will not print cleanly.`,
    );
  }
  if (size.length < 2 * pitch) {
    warn(
      `A ${mm(size.length)} mm long thread has fewer than two turns at a ${mm(pitch)} mm pitch.`,
    );
  }
  return { iface, warnings };
}
