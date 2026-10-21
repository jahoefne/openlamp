/**
 * The cord grip of a collet pendant (part kind `cordGrip`), printed open end down:
 *
 *        ┌──┐┌──┐  cord hole
 *        │  ╲╱  │  45° cone: presses the collet's slit tip onto the cord
 *        │▚▚  ▞▞│  internal thread (the female side of the canopy's collet joint)
 *        └▚    ▞┘  countersunk mouth (on the bed)
 *
 * A cap with grip ribs. Its cone is parallel to the collet's 45° lead-in,
 * `tolerance` away from it while the cap's mouth is still `travel` short of
 * the canopy, so the last `travel` of screwing squeezes the slit tip inward
 * by about `travel − tolerance·√2`.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { CordGripParams } from '../../model/parts.ts';
import { threadJoint } from '../joints/thread.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';

/** Material above the cone, mm. */
const TOP_WALL = 3;
/** Grip ribs around the cap: count and how far they stand out, mm. */
const RIBS = 16;
const RIB_HEIGHT = 0.8;

/** Derived dimensions of the grip, in its print frame (mouth at z 0). */
export type CordGripDerived = {
  /** The collet's root radius and the bore's (root + tolerance). */
  r: number;
  rBore: number;
  /** Outer radius of the cap (without the ribs). */
  rOut: number;
  rHole: number;
  /** The cone: r = coneK − z, from `zCone` (where it leaves the thread) up to the hole at `zApex`. */
  coneK: number;
  zCone: number;
  zApex: number;
  height: number;
};

export interface CordGripStats extends GeometryStats {
  derived: CordGripDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveCordGrip(p: CordGripParams): CordGripDerived {
  const j = p.joint;
  const depth = j.thread?.depth ?? 0;
  const r = j.nominalDiameter / 2;
  const rBore = r + j.tolerance;
  const rHole = p.cordHole / 2;
  // The collet's lead-in in the grip's frame: r = r + (L − travel − z); the
  // cone is the same line `tolerance` away (perpendicular), i.e. tol·√2 out.
  const coneK = r + j.tolerance * Math.SQRT2 + j.length - p.travel;
  const zCone = coneK - (rBore + depth + 0.5);
  const zApex = coneK - rHole;
  return {
    r,
    rBore,
    rOut: rBore + depth + p.wall,
    rHole,
    coneK,
    zCone,
    zApex,
    height: zApex + TOP_WALL,
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function cordGripFootprint(p: CordGripParams): Footprint {
  const d = deriveCordGrip(p);
  const r = d.rOut + RIB_HEIGHT;
  return { x: 2 * r, y: 2 * r, z: d.height };
}

/**
 * Build the cord grip.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildCordGrip(
  k: Kernel,
  params: CordGripParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: CordGripStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const d = deriveCordGrip(p);
    const segs = Math.max(64, QUALITY[quality].segments / 2);

    const cap = s.add(Manifold.cylinder(d.height, d.rOut, d.rOut, segs));
    // V ribs along the outside to turn it by hand (vertical, from the bed: no overhang).
    const side = (RIB_HEIGHT + 0.2) * Math.SQRT2;
    const rib = s.add(
      s
        .add(s.add(Manifold.cube([side, side, d.height], true)).rotate([0, 0, 45]))
        .translate([d.rOut - 0.2, 0, d.height / 2]),
    );
    const ribs = Array.from({ length: RIBS }, (_, i) =>
      s.add(rib.rotate([0, 0, (i * 360) / RIBS])),
    );
    const body = s.add(Manifold.union([cap, ...ribs]));

    // The thread's grooves stop at the cone: clipped under its 45° line, so the
    // cutter's end leaves no flat ceiling above the cone.
    const reach = d.rOut + 2;
    const underCone = s.add(
      Manifold.revolve(
        [
          [
            [0, -2],
            [reach, -2],
            [reach, d.coneK - reach],
            [0, d.coneK],
          ],
        ],
        segs,
      ),
    );
    const thread = threadJoint
      .femaleCutters(k, p.joint, { rCollar: d.r, z: [0, p.joint.length], segs, quality })
      .map((m) => s.add(Manifold.intersection(s.add(m), underCone)));
    const rA = d.coneK - d.zCone;
    const rTip = d.rHole - 0.2;
    const cone: Vec2[] = [
      [0, d.zCone - 0.5],
      [rA, d.zCone - 0.5],
      [rA, d.zCone],
      [rTip, d.coneK - rTip],
      [0, d.coneK - rTip],
    ];
    const coneCutter = s.add(Manifold.revolve([cone], segs));
    const hole = s.add(
      s
        .add(Manifold.cylinder(d.height - d.zCone + 1, d.rHole, d.rHole, segs))
        .translate([0, 0, d.zCone]),
    );
    const result = s.add(Manifold.difference([body, ...thread, coneCutter, hole]));

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: CordGripStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The countersink, the thread's flanks and the cone are 45°.
      maxOverhangDeg: 45,
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
