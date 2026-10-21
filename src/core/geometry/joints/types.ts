/**
 * The contract of a collar joint builder (thread, bayonet, snap): the male
 * side is geometry unioned onto the male part's collar tube, the female side
 * is cutters subtracted from the female part's ring. Both sides read the same
 * `JointInterface` and work in the same joint frame (z from the collar plane
 * into the female part), offset to their own part's frame by `ctx.z`.
 */
import type { JointInterface } from '../../model/assembly.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';

export interface JointCtx {
  /** Radius of the male collar's body (`iface.nominalDiameter / 2`). */
  rCollar: number;
  /** The joint's z range in this part's frame: [collar plane, collar plane + length]. */
  z: readonly [z0: number, z1: number];
  /** Circular segments of the part's revolved surfaces. */
  segs: number;
  quality: Quality;
}

export interface JointBuilder {
  /**
   * How far the collar tube's outer surface (male) and the ring's bore (female)
   * sit inside the joint surface. 0 when the tube and the bore are the mating
   * surfaces (bayonet, snap); > 0 when the joint features form the mating
   * surfaces themselves (thread), so no two surfaces nearly coincide.
   */
  readonly bodyInset: number;
  /** Geometry to union onto the collar tube. The caller owns the result. */
  male(k: Kernel, iface: JointInterface, ctx: JointCtx): Manifold;
  /** Cutters to subtract from the ring. The caller owns the results. */
  femaleCutters(k: Kernel, iface: JointInterface, ctx: JointCtx): Manifold[];
}
