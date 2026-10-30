/**
 * The wall plate of the wall lamp (part kind `wallPlate`): a canopy hung on
 * two screws, printed back face down (the wall on the bed, the room's "up"
 * along +y, the room along +z; see `WallPlateParams` for the frame):
 *
 *          ╭───────────╮          the front: closed, domed, its edge chamfered or rounded
 *        ╭─┤   ┌───┐   ├─╮        the socket boss on the front: the pivot's female
 *        │ │   │ ┊ │   │ │        side (teardrop bore, 45° seat cup at its top,
 *        │ ⊙   │ ┊ │   ⊙ │        `socket.seatY`), the knee's spigot turns in it
 *        │     │ ┊ │     │        two blind keyholes on the back, level, at the
 *        │     └─┴─┘     │        middle height, `keyholes.spacing` apart
 *        ╰───────┃───────╯        the cable: the socket's sump → a passage back →
 *                                 a groove in the back to the `cable.exit` edge
 *
 * The pure functions here (`deriveWallPlate`, `wallPlateFootprint`,
 * `socketBossHeight`, the outline helpers) are frozen: the wall arm's
 * placement and normalisation read them.
 *
 * STEP 0 PLACEHOLDER: `buildWallPlate` returns a solid filling the footprint;
 * step 1 builds the canopy (the old flat plate is in git: 0ac570d).
 */
import type { Footprint, GeometryStats, JointInterface } from '../../model/assembly.ts';
import type { PlateOutline, WallPlateParams } from '../../model/parts.ts';
import { pivotDims } from '../features/pivot.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';
import { placeholderPart } from './placeholder.ts';

/** Material under the socket's sump, at the boss's bottom, mm. */
export const BOSS_FLOOR = 1.6;
/** Material between the back groove and the socket bore above it, mm. */
export const GROOVE_SKIN = 1.2;
/** Material between a keyhole and the plate's edge, mm. */
export const KEYHOLE_EDGE_WALL = 3;
/** The keyhole's head channel: at most this deep, mm … */
const CHANNEL_MAX_DEPTH = 3.5;
/** … leaving this skin in front of its roof and gable, mm. */
const CHANNEL_SKIN = 1.2;

/** The socket boss's height: the bore's depth plus its floor. Pure. */
export function socketBossHeight(pivot: JointInterface): number {
  return pivotDims(pivot).depth + BOSS_FLOOR;
}

/**
 * The socket axis's distance from the back face (print z): the back groove,
 * its skin, then the bore's radius. The same for every cable exit, so the
 * exit does not move the lamp. Pure.
 */
export function socketAxisZ(pivot: JointInterface, grooveDepth: number): number {
  return grooveDepth + GROOVE_SKIN + pivotDims(pivot).rBore;
}

/** The outline's half extents and corner radius (a round plate: `width` is its Ø). Pure. */
export function plateOutlineDims(
  outline: PlateOutline,
  width: number,
  height: number,
  cornerRadius: number,
): { halfWidth: number; halfHeight: number; cornerRadius: number } {
  const halfWidth = width / 2;
  const halfHeight = outline === 'round' ? width / 2 : height / 2;
  const r =
    outline === 'round'
      ? halfWidth
      : outline === 'stadium'
        ? Math.min(halfWidth, halfHeight)
        : Math.max(0.5, Math.min(cornerRadius, halfWidth - 0.5, halfHeight - 0.5));
  return { halfWidth, halfHeight, cornerRadius: r };
}

/**
 * Whether the point (x, y) of the print frame lies inside the outline inset
 * by `inset` (a rounded rectangle of half extents and corner radius; a round
 * plate and a stadium are rounded rectangles too). Pure.
 */
export function insideOutline(
  dims: { halfWidth: number; halfHeight: number; cornerRadius: number },
  x: number,
  y: number,
  inset: number,
): boolean {
  const hw = dims.halfWidth - inset;
  const hh = dims.halfHeight - inset;
  const r = Math.max(0, dims.cornerRadius - inset);
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > hw + 1e-9 || ay > hh + 1e-9) return false;
  const cx = hw - r;
  const cy = hh - r;
  if (ax <= cx || ay <= cy) return true;
  return Math.hypot(ax - cx, ay - cy) <= r + 1e-9;
}

/**
 * The widest keyhole spacing (whole mm) whose keyholes (head channels from
 * the screw's place at y 0 down to the head hole at −`length`, Ø
 * `headDiameter`) stay `KEYHOLE_EDGE_WALL` inside the outline; 0 if none fits. Pure.
 */
export function maxKeyholeSpacing(
  dims: { halfWidth: number; halfHeight: number; cornerRadius: number },
  keyholes: Pick<WallPlateParams['keyholes'], 'headDiameter' | 'length'>,
): number {
  const inset = keyholes.headDiameter / 2 + KEYHOLE_EDGE_WALL;
  const fits = (spacing: number) =>
    insideOutline(dims, spacing / 2, 0, inset) &&
    insideOutline(dims, spacing / 2, -keyholes.length, inset);
  let spacing = Math.floor(2 * dims.halfWidth);
  while (spacing > 0 && !fits(spacing)) spacing -= 1;
  return Math.max(0, spacing);
}

/** Derived dimensions of the plate, in its print frame (back face at z 0, centre at x = y = 0). */
export type WallPlateDerived = {
  halfWidth: number;
  halfHeight: number;
  cornerRadius: number;
  /** The front in the middle: `thickness + domeHeight`. */
  frontZ: number;
  /** The pivot: the bore's radius, the seat cup's rim, the boss's radius (around the teardrop bore). */
  rBore: number;
  rSeat: number;
  rBoss: number;
  /** The socket axis: x 0, z `socketZ`, along y. */
  socketZ: number;
  /** How far the bore's lowest line sinks below the rim's front face (`thickness`). */
  sink: number;
  /** The seat plane (the boss's top face), the bore's floor, the boss's bottom (print y). */
  seatY: number;
  floorY: number;
  bossBottomY: number;
  bossHeight: number;
  /** The passage's axis (print y): in the sump, from the bore back to the groove. */
  passageY: number;
  /** The keyholes: their x, the screw's place (the slot's upper end) and the head hole's centre (print y). */
  keyholeX: number;
  keyholeEndY: number;
  keyholeHeadY: number;
  /** The head channel's straight depth from the back face; its roof and gable above it. */
  channelDepth: number;
  /** The print height (bounding box top). */
  height: number;
};

export interface WallPlateStats extends GeometryStats {
  derived: WallPlateDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveWallPlate(p: WallPlateParams): WallPlateDerived {
  const outline = plateOutlineDims(p.outline, p.width, p.height, p.cornerRadius);
  const pv = pivotDims(p.socket.pivot);
  const socketZ = socketAxisZ(p.socket.pivot, p.cable.grooveDepth);
  const seatY = p.socket.seatY;
  const floorY = seatY - pv.depth;
  const bossBottomY = floorY - BOSS_FLOOR;
  const kh = p.keyholes;
  const roof = (kh.headDiameter - kh.slotWidth) / 2;
  const gable = kh.slotWidth / 2;
  const frontZ = p.thickness + p.domeHeight;
  return {
    ...outline,
    frontZ,
    rBore: pv.rBore,
    rSeat: pv.rSeat,
    rBoss: pv.rBoss,
    socketZ,
    sink: p.thickness - (socketZ - pv.rBore),
    seatY,
    floorY,
    bossBottomY,
    bossHeight: seatY - bossBottomY,
    passageY: floorY + pv.sump / 2,
    keyholeX: kh.spacing / 2,
    keyholeEndY: 0,
    keyholeHeadY: -kh.length,
    channelDepth: Math.max(
      0,
      Math.min(CHANNEL_MAX_DEPTH, p.thickness - roof - gable - CHANNEL_SKIN),
    ),
    height: Math.max(frontZ, socketZ + pv.rBoss),
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function wallPlateFootprint(p: WallPlateParams): Footprint {
  const d = deriveWallPlate(p);
  return { x: 2 * d.halfWidth, y: 2 * d.halfHeight, z: d.height };
}

/**
 * Build the wall plate.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 *
 * STEP 0 PLACEHOLDER: a solid filling the footprint (step 1 builds the canopy).
 */
export function buildWallPlate(
  k: Kernel,
  params: WallPlateParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: WallPlateStats } {
  const d = deriveWallPlate(params);
  const { manifold, stats } = placeholderPart(k, wallPlateFootprint(params), {
    round: params.outline === 'round',
    segs: QUALITY[quality].segments,
  });
  return { manifold, stats: { ...stats, derived: d } };
}
