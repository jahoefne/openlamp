/**
 * The shade collar, shared by every shade family: a family builder delivers
 * its body in print orientation (open end on the bed) ending in a flat annulus
 * at `ctx.z0` that reaches from the collar's bore out to `collar.seatRadius`
 * (the seat the hub ring stands on), solid below it down to a printable
 * underside. `addCollar` stands the collar tube on that annulus and adds the
 * joint's male side (lugs, ribs or thread) from the same `JointInterface` the
 * hub cuts its ring from.
 */
import type { JointInterface } from '../../../model/assembly.ts';
import type { CollarDims } from '../../../model/parts.ts';
import { collarJoint } from '../../joints/index.ts';
import { scoped, type Kernel, type Manifold } from '../../kernel.ts';
import type { Quality } from '../../quality.ts';

/** The tube reaches this far down into the body below the annulus, for a clean union. */
const TUBE_ROOT = 0.5;

export interface CollarCtx {
  collar: CollarDims;
  /** The collar plane (top of the body's annulus) in the shade's print frame. */
  z0: number;
  /** Circular segments of the body's revolve (the tube's bore matches the body's). */
  segs: number;
  quality: Quality;
}

/**
 * `body` ∪ collar tube ∪ the joint's male side. `body` stays the caller's; the
 * caller owns the result.
 */
export function addCollar(
  k: Kernel,
  body: Manifold,
  iface: JointInterface,
  ctx: CollarCtx,
): Manifold {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const { collar, z0, segs } = ctx;
    const joint = collarJoint(iface.type);
    const L = iface.length;
    const rOut = collar.radius - joint.bodyInset;
    const rBore = collar.radius - collar.wall;
    const height = L + TUBE_ROOT;
    const outer = s.add(Manifold.cylinder(height, rOut, rOut, segs));
    const bore = s.add(
      s.add(Manifold.cylinder(height + 2, rBore, rBore, segs)).translate([0, 0, -1]),
    );
    const tube = s.add(s.add(Manifold.difference(outer, bore)).translate([0, 0, z0 - TUBE_ROOT]));
    const male = s.add(
      joint.male(k, iface, {
        rCollar: collar.radius,
        z: [z0, z0 + L],
        segs,
        quality: ctx.quality,
      }),
    );
    return s.keep(s.add(Manifold.union([body, tube, male])));
  });
}
