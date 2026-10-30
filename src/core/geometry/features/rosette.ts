/**
 * The wall arm's rosette hinge: a serrated tang between two serrated clevis
 * ears, clamped by an M5 bolt (its head in the −x ear's counterbore) into a
 * nut in a knob on the +x ear (see `RosetteHinge` in model/parts.ts).
 *
 * Hinge-local frame, shared by both functions: the axis along x, the
 * mid-plane x = 0, the tang's stalk toward −y. A tang and a clevis built in
 * this same frame mesh; turned against each other about x by any multiple of
 * `360 / teeth` they still do. Each part builder maps the frame into its own:
 * the knee and the hanger with `rotationX(90)` (stalk down), a link's clevis
 * with `rotationY(180)`, a fold elbow's tang root with
 * `rotationX(−90) · rotationY(180)` (stalk along the link), each at its axis.
 *
 * STEP 0 STUB: typed signatures returning placeholder solids (plain discs and
 * the bolt hole). Step 2 builds the real tang and clevis: teeth on the annulus
 * `innerRadius` … `radius` (`teeth` 90° V-wedges `toothDepth` deep, one batch
 * union, the ears' turned half a pitch), the head counterbore, the cable
 * channel (an arc around the bolt from the stalk to `channelExit`, its
 * near-horizontal stretch a bridge of at most 7 mm or teardropped) and the
 * open notch through the toothed rim where it leaves.
 */
import type { RosetteHinge } from '../../model/parts.ts';
import { scoped, type Kernel, type Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';

export interface RosetteCtx {
  /** Segments around a full circle (`QUALITY[quality].segments`). */
  segs: number;
  quality: Quality;
}

export interface TangOptions {
  /**
   * The stalk under the disc, the tang's full thickness along x: from the
   * axis down to y = −`length`, `depth` wide along z. Absent: the disc alone.
   */
  stalk?: { length: number; depth: number };
  /**
   * Where the cable channel leaves the disc's rim, a unit vector in the local
   * y–z plane (the side the clevis's tube is on); it starts at the stalk
   * (−y). Absent: no channel.
   */
  channelExit?: readonly [y: number, z: number];
}

/** A disc of `radius`, `thickness` along x, centred on x = `x0`. */
function disc(k: Kernel, radius: number, thickness: number, x0: number, segs: number): Manifold {
  return scoped(k, (s) => {
    const cyl = s.add(k.Manifold.cylinder(thickness, radius, radius, segs, true));
    return s.keep(s.add(s.add(cyl.rotate([0, 90, 0])).translate([x0, 0, 0])));
  });
}

/**
 * The tang (the hinge's male side) in the hinge-local frame: its disc, its
 * stalk, the bolt hole, the teeth and the cable channel. The caller owns the
 * result.
 *
 * STEP 0 STUB: the plain disc and stalk minus the bolt hole.
 */
export function rosetteTang(
  k: Kernel,
  spec: RosetteHinge,
  ctx: RosetteCtx & TangOptions,
): Manifold {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const parts = [s.add(disc(k, spec.radius, spec.tangThickness, 0, ctx.segs))];
    if (ctx.stalk && ctx.stalk.length > 0) {
      const { length, depth } = ctx.stalk;
      parts.push(
        s.add(
          s
            .add(Manifold.cube([spec.tangThickness, length, depth], true))
            .translate([0, -length / 2, 0]),
        ),
      );
    }
    const body = s.add(Manifold.union(parts));
    const bolt = s.add(disc(k, spec.boltHole / 2, spec.tangThickness + 2, 0, 32));
    return s.keep(s.add(body.subtract(bolt)));
  });
}

/**
 * The clevis (the hinge's female side) in the hinge-local frame: `ears` (two
 * discs, `earGap` apart, to be hulled or unioned into the part's body) and
 * `cutters` (the bolt hole through both, the head counterbore in the −x ear,
 * the crotch the tang turns in, to subtract afterwards). The caller owns the
 * results.
 *
 * STEP 0 STUB: two plain discs and the bolt hole.
 */
export function rosetteClevis(
  k: Kernel,
  spec: RosetteHinge,
  ctx: RosetteCtx,
): { ears: Manifold; cutters: Manifold[] } {
  return scoped(k, (s) => {
    const x = spec.earGap / 2 + spec.earThickness / 2;
    const ears = s.add(
      k.Manifold.union([
        s.add(disc(k, spec.radius, spec.earThickness, -x, ctx.segs)),
        s.add(disc(k, spec.radius, spec.earThickness, x, ctx.segs)),
      ]),
    );
    const bolt = s.add(disc(k, spec.boltHole / 2, spec.width + 2, 0, 32));
    return { ears: s.keep(ears), cutters: [s.keep(bolt)] };
  });
}
