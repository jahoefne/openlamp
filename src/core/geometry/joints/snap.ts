/**
 * Snap / press fit: the collar slides into the ring's bore with a small
 * clearance (`iface.tolerance`, 0.2 mm by default) and is held by crush ribs
 * on the collar that stand out further than the clearance and deform when
 * pressed home. The ribs are thin boxes turned 45° about the axis (a V-shaped
 * rib, so only its tip crushes), running along the collar. The bore itself is
 * part of the ring's profile, so there are no female cutters.
 */
import type { JointInterface, SnapSpec } from '../../model/assembly.ts';
import { scoped } from '../kernel.ts';
import type { JointBuilder, JointCtx } from './types.ts';

/** First rib's angle. */
const FIRST_RIB_DEG = 0;
/** Ribs end this far from both ends of the collar. */
const RIB_END_GAP = 1;
/** Rib centre line just inside the collar surface, so no rib edge lies on it. */
const RIB_SINK = 0.05;

function snapOf(iface: JointInterface): SnapSpec {
  if (!iface.snap) throw new Error(`Joint ${iface.id} has no snap parameters`);
  return iface.snap;
}

export const snapJoint: JointBuilder = {
  bodyInset: 0,

  male(k, iface, ctx: JointCtx) {
    return scoped(k, (s) => {
      const { Manifold } = k;
      const sn = snapOf(iface);
      const length = iface.length - 2 * RIB_END_GAP;
      // A square of side `side` turned 45° reaches side/√2 from its centre.
      const side = (sn.ribHeight + RIB_SINK) * Math.SQRT2;
      const rib = s.add(
        s
          .add(s.add(Manifold.cube([side, side, length], true)).rotate([0, 0, 45]))
          .translate([ctx.rCollar - RIB_SINK, 0, ctx.z[0] + iface.length / 2]),
      );
      const ribs = Array.from({ length: sn.ribs }, (_, i) =>
        s.add(rib.rotate([0, 0, FIRST_RIB_DEG + (i * 360) / sn.ribs])),
      );
      return s.keep(s.add(Manifold.union(ribs)));
    });
  },

  femaleCutters: () => [],
};
