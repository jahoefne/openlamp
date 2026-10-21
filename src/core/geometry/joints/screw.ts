/**
 * Screw joints: M3 screws on a bolt circle (`iface.nominalDiameter`), through
 * holes with a counterbore for the head on the male part, heat-set insert
 * pockets (or plain tapping holes) on the female part. One `screwPattern`
 * yields the cutters for either side; the mounts of M2.2 (wall plate, base)
 * subtract them from their parts.
 */
import type { JointInterface, ScrewSpec } from '../../model/assembly.ts';
import { scoped, type Kernel, type Manifold } from '../kernel.ts';

/** M3: through hole, counterbore Ø × depth, heat-set insert pocket Ø × depth, tapping hole. */
export const M3 = Object.freeze({
  hole: 3.4,
  counterbore: Object.freeze([6, 3] as const),
  insertPocket: Object.freeze([4.0, 6.0] as const),
  tapHole: 2.5,
});

/** Angle of the first screw on the bolt circle. */
const FIRST_SCREW_DEG = 45;

export interface ScrewCtx {
  /** The part's material the screws pass through, from z0 to z1 in its frame. */
  z: readonly [z0: number, z1: number];
  /**
   * The face the counterbore (male) or the insert pocket (female) opens on:
   * `top` = z1, `bottom` = z0.
   */
  face: 'top' | 'bottom';
  segs: number;
}

function screwOf(iface: JointInterface): ScrewSpec {
  if (!iface.screw) throw new Error(`Joint ${iface.id} has no screw parameters`);
  return iface.screw;
}

/** The screw positions on the bolt circle. */
export function screwPositions(iface: JointInterface): [x: number, y: number][] {
  const { count } = screwOf(iface);
  const r = iface.nominalDiameter / 2;
  return Array.from({ length: count }, (_, i) => {
    const a = ((FIRST_SCREW_DEG + (i * 360) / count) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
}

/**
 * Cutters for one side of a screw joint: `male` = through hole + counterbore,
 * `female` = heat-set pocket (if the joint has one) or a tapping hole of the
 * pocket's depth. The caller owns the results.
 */
export function screwPattern(
  k: Kernel,
  iface: JointInterface,
  side: 'male' | 'female',
  ctx: ScrewCtx,
): Manifold[] {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const sc = screwOf(iface);
    const [z0, z1] = ctx.z;
    const thickness = z1 - z0;
    // A blind feature `depth` deep from the chosen face, 1 mm past it into the air.
    const blind = (diameter: number, depth: number): Manifold => {
      const h = Math.min(depth, thickness) + 1;
      const zStart = ctx.face === 'top' ? z1 - Math.min(depth, thickness) : z0 - 1;
      return s.add(
        s.add(Manifold.cylinder(h, diameter / 2, diameter / 2, ctx.segs)).translate([0, 0, zStart]),
      );
    };
    const one: Manifold[] = [];
    if (side === 'male') {
      one.push(
        s.add(
          s
            .add(Manifold.cylinder(thickness + 2, sc.hole / 2, sc.hole / 2, ctx.segs))
            .translate([0, 0, z0 - 1]),
        ),
        blind(sc.counterbore[0], sc.counterbore[1]),
      );
    } else if (sc.insertPocket) {
      one.push(blind(sc.insertPocket[0], sc.insertPocket[1]));
    } else {
      one.push(blind(M3.tapHole, M3.insertPocket[1]));
    }
    const shape = s.add(Manifold.union(one));
    return screwPositions(iface).map(([x, y]) => s.keep(s.add(shape.translate([x, y, 0]))));
  });
}
