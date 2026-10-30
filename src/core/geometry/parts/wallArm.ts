/**
 * A link of the wall arm (part kind `wallArm`), printed standing on a clevis
 * with its chord vertical (see `WallArmParams` for the link frame):
 *
 *           ╭─╮ ╭─╮          end: a clevis (for the hanger or a fold elbow's
 *           │ │⊙│ │          outer link) or a socket boss rising above the
 *            ╲   ╱           tube (for a swing elbow's knee)
 *             │ │            the tube (Ø `tubeDiameter`, straight or curved,
 *             │┆│            round or octagonal), the cable bore through it
 *            ╱ ^ ╲           the gabled crotch over the tang's swept circle
 *           │ │⊙│ │          root: a clevis (the knee's tang between its ears),
 *        ═══╧═╧═╧═╧═══       on the bed; or a tang (a fold elbow's outer
 *                            link, which then stands on its end clevis)
 *
 * The pure functions here (`deriveWallArm`, `wallArmFootprint`,
 * `linkToPrint`, `printToLink`) are frozen: the wall arm's placement and
 * normalisation read them.
 *
 * STEP 0 PLACEHOLDER: `buildWallArm` returns a solid filling the footprint;
 * step 3 builds the link (the old one-piece arm, with `alongCentre`, the
 * torus revolve, `bendSlices` and `fairingBevel`, is in git: 0ac570d).
 */
import type { Footprint, GeometryStats, Mat4 } from '../../model/assembly.ts';
import type { WallArmParams } from '../../model/parts.ts';
import { pivotDims } from '../features/pivot.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';
import { placeholderPart } from './placeholder.ts';
import { BOSS_FLOOR } from './wallPlate.ts';

const DEG = Math.PI / 180;

/** Derived dimensions of a link (link frame unless noted; lengths mm, angles degrees). */
export type WallArmDerived = {
  /** The bend built: `bendAngle` for a curved link, else 0. */
  bend: number;
  rTube: number;
  rBore: number;
  /** The chord, root axis → end axis: the end axis is (0, 0, `length`). */
  length: number;
  /** A curved link's arc radius (0 when straight). */
  bendRadius: number;
  /** How far the arc dips below the chord (toward −y) halfway along it (0 when straight). */
  sagitta: number;
  /** The centre line's angle above the chord at the root (−bend / 2) and at the end (+bend / 2). */
  rootTangent: number;
  endTangent: number;
  /** 1 when the end is a socket boss (a swing elbow's inner link), else 0. */
  socket: number;
  /** A socket end: its seat plane (y), the bore's floor (y; the sump centred on the chord), the boss's radius. 0 without. */
  seatY: number;
  floorY: number;
  rBoss: number;
  /** The link's extent across the chord (y) and along the axes (x, half of it). */
  yMin: number;
  yMax: number;
  halfWidth: number;
  /** 0: printed on its root clevis; 1: on its end clevis (a tang root), turned half a turn about x. */
  flipped: number;
  /** The lower axis's height above the bed (disc on edge). */
  axisHeight: number;
  /**
   * The root's and the end's axis in the print frame (both along x, at print
   * y = `yShift`): z above the bed. Root → end is (0, 0, ±`length`) in print,
   * (0, 0, `length`) in the link frame, a curved link's chord included.
   */
  rootAxisZ: number;
  endAxisZ: number;
  /** The print frame is the link frame (turned, if flipped, and) moved by `yShift` along y and up. */
  yShift: number;
  /** The print height. */
  height: number;
};

export interface WallArmStats extends GeometryStats {
  derived: WallArmDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveWallArm(p: WallArmParams): WallArmDerived {
  const bend = p.shape === 'curved' ? p.bendAngle : 0;
  const half = (bend / 2) * DEG;
  const bendRadius = bend > 0 ? p.length / (2 * Math.sin(half)) : 0;
  const sagitta = bend > 0 ? bendRadius * (1 - Math.cos(half)) : 0;
  const rTube = p.tubeDiameter / 2;
  const R = p.rosette.radius;
  const socket = p.end.kind === 'socket' ? pivotDims(p.end.pivot) : undefined;
  const seatY = socket ? socket.depth - socket.sump / 2 : 0;
  const floorY = socket ? seatY - socket.depth : 0;
  const rBoss = socket?.rBoss ?? 0;
  let yMin = Math.min(-R, -sagitta - rTube);
  let yMax = Math.max(R, rTube);
  if (socket) {
    yMin = Math.min(yMin, floorY - BOSS_FLOOR);
    yMax = Math.max(yMax, seatY);
  }
  const flipped = p.root === 'tang' ? 1 : 0;
  const axisHeight = p.rosette.axisHeight;
  // The top: the end's disc or boss (root down), the root tang's disc (end down).
  const top = flipped ? R : socket ? rBoss : R;
  return {
    bend,
    rTube,
    rBore: p.boreDiameter / 2,
    length: p.length,
    bendRadius,
    sagitta,
    rootTangent: -bend / 2,
    endTangent: bend / 2,
    socket: socket ? 1 : 0,
    seatY,
    floorY,
    rBoss,
    yMin,
    yMax,
    halfWidth: Math.max(p.rosette.width / 2, rTube, rBoss),
    flipped,
    axisHeight,
    rootAxisZ: flipped ? axisHeight + p.length : axisHeight,
    endAxisZ: flipped ? axisHeight : axisHeight + p.length,
    yShift: flipped ? (yMin + yMax) / 2 : -(yMin + yMax) / 2,
    height: axisHeight + p.length + top,
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function wallArmFootprint(p: WallArmParams): Footprint {
  const d = deriveWallArm(p);
  return { x: 2 * d.halfWidth, y: d.yMax - d.yMin, z: d.height };
}

/**
 * Link frame → print frame (column-major): moved up so the lower axis is
 * `axisHeight` above the bed and along y by `yShift`; a flipped link (end
 * clevis down) is turned half a turn about x first.
 */
export function linkToPrint(
  d: Pick<WallArmDerived, 'flipped' | 'axisHeight' | 'yShift' | 'length'>,
): Mat4 {
  return d.flipped
    ? [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, d.yShift, d.axisHeight + d.length, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, d.yShift, d.axisHeight, 1];
}

/** Print frame → link frame (the inverse of `linkToPrint`). */
export function printToLink(
  d: Pick<WallArmDerived, 'flipped' | 'axisHeight' | 'yShift' | 'length'>,
): Mat4 {
  // Turned half a turn about x, the map is its own inverse.
  return d.flipped
    ? linkToPrint(d)
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -d.yShift, -d.axisHeight, 1];
}

/**
 * Build a link.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 *
 * STEP 0 PLACEHOLDER: a solid filling the footprint (step 3 builds the link).
 */
export function buildWallArm(
  k: Kernel,
  params: WallArmParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: WallArmStats } {
  void quality;
  const d = deriveWallArm(params);
  const { manifold, stats } = placeholderPart(k, wallArmFootprint(params));
  return { manifold, stats: { ...stats, derived: d } };
}
