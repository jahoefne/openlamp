/**
 * Bayonet (the default shade ↔ hub joint): lugs on the male collar enter axial
 * slots in the female ring's bore and twist `travel` degrees along a groove
 * into the locked position, where the shade hangs on them.
 *
 * Lugs print collar-up without support: flat top, 45° underside. The lug's
 * underside is also its bearing face, so the groove floor is the same 45°
 * line offset by the tolerance (full contact instead of a line on a flat
 * floor), and the groove ceiling rises 45° outward so the hub, printed ring
 * down, has no flat overhang there either.
 *
 * Locking turns the shade by +travel about z (counter-clockwise seen from
 * above, clockwise seen from below, like screwing in a right-hand thread), so
 * each entry slot sits `travel` before its locked lug.
 */
import type { BayonetSpec, JointInterface } from '../../model/assembly.ts';
import { scoped, type Manifold, type Vec3 } from '../kernel.ts';
import type { JointBuilder, JointCtx } from './types.ts';

const DEG = Math.PI / 180;
/** Angle of the first locked lug. */
const FIRST_LUG_DEG = 30;
/** How far a lug reaches into the collar tube it stands on. */
const LUG_ROOT = 0.5;

function bayonetOf(iface: JointInterface): BayonetSpec {
  if (!iface.bayonet) throw new Error(`Joint ${iface.id} has no bayonet parameters`);
  return iface.bayonet;
}

/** Where the lugs sit, shared by both sides: locked angles and the lug's bottom in the joint frame. */
export function bayonetLayout(iface: JointInterface): { angles: number[]; lugZ: number } {
  const b = bayonetOf(iface);
  const angles = Array.from({ length: b.lugs }, (_, i) => FIRST_LUG_DEG + (i * 360) / b.lugs);
  return { angles, lugZ: (iface.length - b.lugHeight) / 2 };
}

export const bayonetJoint: JointBuilder = {
  bodyInset: 0,

  male(k, iface, ctx: JointCtx) {
    return scoped(k, (s) => {
      const { Manifold } = k;
      const b = bayonetOf(iface);
      const { angles, lugZ } = bayonetLayout(iface);
      const r = ctx.rCollar;
      const xIn = r - LUG_ROOT;
      const xOut = r + b.lugDepth;
      const zTop = lugZ + b.lugHeight;
      // 45° underside through (r, lugZ); the outer face starts where it reaches xOut.
      const zOutBottom = Math.min(zTop, lugZ + b.lugDepth);
      const pts: Vec3[] = [];
      for (const y of [-b.lugWidth / 2, b.lugWidth / 2]) {
        pts.push([xIn, y, lugZ - LUG_ROOT], [xOut, y, zOutBottom], [xOut, y, zTop], [xIn, y, zTop]);
      }
      const lug = s.add(Manifold.hull(pts));
      const lugs = angles.map((a) => s.add(lug.rotate([0, 0, a])));
      const all = s.add(Manifold.union(lugs));
      return s.keep(s.add(all.translate([0, 0, ctx.z[0]])));
    });
  },

  femaleCutters(k, iface, ctx: JointCtx) {
    return scoped(k, (s) => {
      const { Manifold } = k;
      const b = bayonetOf(iface);
      const { angles, lugZ } = bayonetLayout(iface);
      const tol = iface.tolerance;
      const r = ctx.rCollar;
      const rBore = r + tol;
      const rIn = rBore - 1; // start inside the bore so no cutter face meets it
      const zTop = lugZ + b.lugHeight + tol;
      // The lug's outer corners stand out a little further than its flat outer face.
      const rGroove = Math.hypot(r + b.lugDepth, b.lugWidth / 2) + tol;
      // Floor: the lug's 45° underside z = lugZ + (x − r), offset down by tol (perpendicular).
      const floor = (x: number) => lugZ - tol * Math.SQRT2 + (x - r);
      // Ceiling: rises 45° outward from the lug top + tol at the bore.
      const ceiling = (x: number) => zTop + Math.max(0, x - rBore);
      const groove = [
        [rIn, floor(rIn)],
        [rGroove, floor(rGroove)],
        [rGroove, ceiling(rGroove)],
        [rBore, ceiling(rBore)],
        [rIn, ceiling(rIn)],
      ] as [number, number][];
      // Half the lug's angular width at the bore, plus the tolerance.
      const half = Math.asin(Math.min(1, (b.lugWidth / 2 + tol) / rBore)) / DEG;
      const sweep = b.travel + 2 * half;
      const grooveSegs = Math.max(4, Math.ceil((ctx.segs * sweep) / 360));
      const arc = s.add(Manifold.revolve([groove], grooveSegs, sweep));
      // Axial entry slot from below the mouth up to the groove ceiling.
      const slotDepth = r + b.lugDepth + tol - rIn;
      const slotHeight = zTop + 1;
      const slot = s.add(
        s
          .add(Manifold.cube([slotDepth, b.lugWidth + 2 * tol, slotHeight], false))
          .translate([rIn, -(b.lugWidth / 2 + tol), -1]),
      );
      const cutters: Manifold[] = [];
      for (const a of angles) {
        cutters.push(s.add(arc.rotate([0, 0, a - b.travel - half])));
        cutters.push(s.add(slot.rotate([0, 0, a - b.travel])));
      }
      return cutters.map((m) => s.keep(s.add(m.translate([0, 0, ctx.z[0]]))));
    });
  },
};
