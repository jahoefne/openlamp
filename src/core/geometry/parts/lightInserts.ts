/**
 * Light inserts: what the hub (or the fused classic shade) cuts so the light
 * source fits. Pucks first, two ways:
 *
 * - under an open mount face (the strap): the pocket the puck drops into from
 *   the mount face, the light opening through the ledge it rests on, and the
 *   cable slot through the housing wall;
 * - under a closed mount face (a roof over the pocket): the puck is pressed
 *   into the pocket from the light face (the bore is open all the way down)
 *   until it touches the 45° roof, and three crush ribs hold it; the cable
 *   slot gets a 45° gable top so it prints without support.
 *
 * Bulb sockets and strip channels join in M2.3.
 */
import type { LightInsert, PuckInsert } from '../../model/parts.ts';
import { scoped, type Kernel, type Manifold, type Vec3 } from '../kernel.ts';

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

/** The cutters of any light insert (only pucks so far). The caller owns the results. */
export function lightInsertCutters(
  k: Kernel,
  insert: LightInsert,
  d: PuckCutterDims,
  segs: number,
): Manifold[] {
  switch (insert.kind) {
    case 'puck':
      return puckInsertCutters(k, d, insert.cableWidth, segs);
  }
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
