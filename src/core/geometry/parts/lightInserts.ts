/**
 * Light inserts: what the hub (or the fused classic shade) cuts so the light
 * source fits. Pucks first: the pocket the puck drops into from the mount face,
 * the light opening through the ledge it rests on, and the cable slot through
 * the housing wall. Bulb sockets and strip channels join in M2.3.
 */
import type { LightInsert, PuckInsert } from '../../model/parts.ts';
import { scoped, type Kernel, type Manifold } from '../kernel.ts';

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
