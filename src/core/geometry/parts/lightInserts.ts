/**
 * Light inserts: what the hub (or the fused classic shade) cuts so the light
 * source fits.
 *
 * Pucks, two ways:
 * - under an open mount face (the strap): the pocket the puck drops into from
 *   the mount face, the light opening through the ledge it rests on, and the
 *   cable slot through the housing wall;
 * - under a closed mount face (a roof over the pocket): the puck is pressed
 *   into the pocket from the light face (the bore is open all the way down)
 *   until it touches the 45° roof, and three crush ribs hold it; the cable
 *   slot gets a 45° gable top so it prints without support.
 *
 * Bulbs: the lampholder plate, its skirt and the chamber above it are part of
 * the hub's revolve profile (hub.ts); here are the cutters that are not
 * revolved: the vents through the shoulder and the M10 nut's hexagonal recess.
 *
 * Strips: the ring channel is part of the profile too; here are the cable's
 * slots (through the channel's ceiling, through the boss's side).
 */
import type { BulbInsert, LightInsert, PuckInsert, StripInsert } from '../../model/parts.ts';
import { scoped, type Kernel, type Manifold, type Vec3 } from '../kernel.ts';

/**
 * The hexagonal recess for an M10 nipple's nut on the plate's mount side:
 * Ø19 across corners (an M10 nut 16 mm across flats, ISO 4032), 4 mm deep, in
 * a boss with a 2.4 mm wall; mm.
 */
export const M10_NUT_RECESS = Object.freeze({ diameter: 19, depth: 4, wall: 2.4 });
/** The bore of a hollow M10 × 1 nipple (the lampholder's cable runs through it), mm. */
export const M10_NIPPLE_BORE = 7;
/** Diameter of the vents through a bulb hub's shoulder, mm. */
export const VENT_DIAMETER = 6;
/** A strip's channel is this much wider than the strip, mm. */
export const STRIP_CHANNEL_EXTRA = 0.4;
/** The longest bridge a channel's ceiling should print as, mm. */
export const STRIP_MAX_BRIDGE = 11;
/** A strip hub's disc stops this far inside the shade collar's bore, mm. */
export const STRIP_DISC_GAP = 0.5;

/** Where the puck pocket sits; the fused shade's `derive()` has the same fields. */
export interface PuckCutterDims {
  rPocket: number;
  rBoss: number;
  rHole: number;
  pocketDepth: number;
  /** The ledge's top face, where the puck rests. */
  zFloor: number;
  /** The mount face, where the pocket opens. */
  zTop: number;
  /** The light opening's lower end. */
  zHoleBottom: number;
}

/** The puck's pocket radius, housing radius, light-opening radius and pocket depth. */
export function puckDims(
  insert: PuckInsert,
): Pick<PuckCutterDims, 'rPocket' | 'rBoss' | 'rHole' | 'pocketDepth'> {
  const rPocket = insert.diameter / 2 + insert.clearance;
  return {
    rPocket,
    rBoss: rPocket + insert.bossWall,
    rHole: insert.lightHoleDiameter / 2,
    pocketDepth: insert.height + insert.pocketExtraDepth,
  };
}

/**
 * The puck pocket (open to the mount face), the light opening through the
 * ledge and the cable slot through the housing wall on +X, from the pocket
 * floor to the top. The caller owns the results.
 */
export function puckInsertCutters(
  k: Kernel,
  d: PuckCutterDims,
  cableWidth: number,
  segs: number,
): Manifold[] {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const pocket = s.add(
      s
        .add(Manifold.cylinder(d.pocketDepth + 1, d.rPocket, d.rPocket, segs))
        .translate([0, 0, d.zFloor]),
    );
    const hole = s.add(
      s
        .add(Manifold.cylinder(d.zTop - d.zHoleBottom + 2, d.rHole, d.rHole, segs))
        .translate([0, 0, d.zHoleBottom - 1]),
    );
    const cable = s.add(
      s
        .add(Manifold.cube([d.rBoss - d.rPocket + 4, cableWidth, d.pocketDepth + 1], false))
        .translate([d.rPocket - 2, -cableWidth / 2, d.zFloor]),
    );
    return [s.keep(pocket), s.keep(hole), s.keep(cable)];
  });
}

/** The cutters of a puck's open pocket (the strap's hub). The caller owns the results. */
export function lightInsertCutters(
  k: Kernel,
  insert: Extract<LightInsert, { kind: 'puck' }>,
  d: PuckCutterDims,
  segs: number,
): Manifold[] {
  return puckInsertCutters(k, d, insert.cableWidth, segs);
}

// ---------------------------------------------------------------- bulb

/** Where a bulb hub's vents go: on a circle between the skirt and the hub ring, through the shoulder. */
export interface VentDims {
  /** Radius of the circle through the vents' axes. */
  rVent: number;
  /** The vents start above the shade collar's room … */
  z0: number;
  /** … and end above the shoulder's outer cone. */
  z1: number;
}

/**
 * The bulb's vents: `insert.vents` vertical Ø6 cylinders (vertical walls, so
 * no overhang) evenly around the axis, half a pitch off +X. The caller owns
 * the results.
 */
export function bulbVentCutters(
  k: Kernel,
  insert: Pick<BulbInsert, 'vents'>,
  d: VentDims,
  segs: number,
): Manifold[] {
  const n = Math.max(0, Math.round(insert.vents));
  if (n === 0) return [];
  return scoped(k, (s) => {
    const { Manifold } = k;
    const r = VENT_DIAMETER / 2;
    const ventSegs = Math.max(16, Math.round(segs / 8));
    const vent = s.add(
      s.add(Manifold.cylinder(d.z1 - d.z0, r, r, ventSegs)).translate([d.rVent, 0, d.z0]),
    );
    return Array.from({ length: n }, (_, i) =>
      s.keep(s.add(vent.rotate([0, 0, ((i + 0.5) * 360) / n]))),
    );
  });
}

/**
 * The M10 nut's hexagonal recess (corners on ±X), from the plate's top face
 * `zFloor` up through its boss. The caller owns the result.
 */
export function nutRecessCutter(k: Kernel, zFloor: number): Manifold {
  return scoped(k, (s) => {
    const r = M10_NUT_RECESS.diameter / 2;
    return s.keep(
      s.add(k.Manifold.cylinder(M10_NUT_RECESS.depth + 1, r, r, 6)).translate([0, 0, zFloor]),
    );
  });
}

// ---------------------------------------------------------------- strip

/** Where a strip hub's cable runs: the channel, the disc's tops, the boss in the middle. */
export interface StripCableDims {
  /** The channel's inner radius and its ceiling. */
  rChannel: number;
  zChannel: number;
  /** The disc's top over the channel and inside it. */
  discThickness: number;
  innerThickness: number;
  /** The pocket in the boss and the boss's outer radius. */
  rPocket: number;
  rBoss: number;
}

/**
 * The strip's cable slots on +X: one through the channel's ceiling up onto
 * the disc (vertical walls) and, under a closed mount face, one through the
 * boss's side into its pocket with a 45° gable top. The caller owns the results.
 */
export function stripCableCutters(
  k: Kernel,
  insert: Pick<StripInsert, 'channelWidth' | 'cableWidth'>,
  d: StripCableDims,
  boss: boolean,
): Manifold[] {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const w = insert.cableWidth + 1;
    const ceiling = s.add(
      s
        .add(Manifold.cube([insert.channelWidth, w, d.discThickness - d.zChannel + 1.5], false))
        .translate([d.rChannel, -w / 2, d.zChannel - 0.5]),
    );
    const out = [s.keep(ceiling)];
    if (boss) {
      const z0 = d.innerThickness;
      const pts: Vec3[] = [];
      for (const x of [d.rPocket - 1, d.rBoss + 1]) {
        pts.push([x, -w / 2, z0], [x, w / 2, z0], [x, -w / 2, z0 + w], [x, w / 2, z0 + w]);
        pts.push([x, 0, z0 + w + w / 2]); // 45° gable
      }
      out.push(s.keep(s.add(Manifold.hull(pts))));
    }
    return out;
  });
}

/** Height of the strip's cable slot through the boss (gable included), mm. */
export function stripBossSlotHeight(insert: Pick<StripInsert, 'cableWidth'>): number {
  return 1.5 * (insert.cableWidth + 1);
}

// ---------------------------------------------------------------- press-fit puck (closed faces)

/** How far the crush ribs of a press-fit puck reach past its rim, mm. */
export const PUCK_CRUSH = 0.3;
/** Angles of the crush ribs (the cable slot is at 0°). */
const PUCK_RIB_ANGLES = [60, 180, 300] as const;
/** The ribs reach this far into the pocket wall, mm. */
const RIB_ROOT = 0.3;

/**
 * Where a press-fit puck sits (its underside): pushed up until its rim
 * touches the 45° roof, which leaves the pocket wall at `zTop` (see
 * mountFaces.ts), i.e. `clearance` above `zTop`.
 */
export function pressFitPuckZ(
  insert: Pick<PuckInsert, 'clearance' | 'height'>,
  zTop: number,
): number {
  return zTop + insert.clearance - insert.height;
}

/**
 * The press-fit pocket: a bore of the pocket's radius open all the way down to
 * the light face (no ledge) up to just under the roof, and the cable slot on
 * +X through the housing wall with a 45° gable top. The caller owns the results.
 */
export function puckPressFitCutters(
  k: Kernel,
  d: Pick<PuckCutterDims, 'rPocket' | 'rBoss' | 'zFloor' | 'zTop'>,
  cableWidth: number,
  segs: number,
): Manifold[] {
  return scoped(k, (s) => {
    const { Manifold } = k;
    // The roof's cutter (mountFaces.ts) starts 0.5 mm below zTop, wider than the bore.
    const top = d.zTop - 0.25;
    const bore = s.add(
      s.add(Manifold.cylinder(top + 1, d.rPocket, d.rPocket, segs)).translate([0, 0, -1]),
    );
    const x0 = d.rPocket - 2;
    const x1 = d.rBoss + 2;
    const w = cableWidth / 2;
    const pts: Vec3[] = [];
    for (const x of [x0, x1]) {
      pts.push([x, -w, d.zFloor], [x, w, d.zFloor], [x, -w, d.zTop], [x, w, d.zTop]);
      pts.push([x, 0, d.zTop + w]); // 45° gable
    }
    const cable = s.add(Manifold.hull(pts));
    return [s.keep(bore), s.keep(cable)];
  });
}

/**
 * The crush ribs of a press-fit puck: V ribs (90°) along the pocket wall,
 * reaching `clearance + PUCK_CRUSH` into the pocket, with a 45° underside that
 * also guides the puck in. To be unioned after the pocket is cut. The caller
 * owns the results.
 */
export function puckCrushRibs(
  k: Kernel,
  insert: Pick<PuckInsert, 'clearance' | 'height'>,
  d: Pick<PuckCutterDims, 'rPocket' | 'zTop'>,
): Manifold[] {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const depth = insert.clearance + PUCK_CRUSH;
    const half = depth + RIB_ROOT;
    const rWall = d.rPocket + RIB_ROOT;
    const rTip = d.rPocket - depth;
    const z0 = pressFitPuckZ(insert, d.zTop) + 0.5;
    const z1 = d.zTop - 0.5;
    if (z1 - z0 < half + 0.5) return [];
    const rib = s.add(
      Manifold.hull([
        [rWall, -half, z0],
        [rWall, half, z0],
        [rWall, -half, z1],
        [rWall, half, z1],
        [rTip, 0, z0 + half],
        [rTip, 0, z1],
      ]),
    );
    return PUCK_RIB_ANGLES.map((a) => s.keep(s.add(rib.rotate([0, 0, a]))));
  });
}
