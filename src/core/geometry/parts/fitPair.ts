/**
 * The fit-test pair (`project.fitTest` on a two-part lamp): two small pieces
 * that test the shade ↔ hub joint before the whole lamp is printed. Both are
 * built from the same collar numbers (`CollarDims`) and the same
 * `JointInterface` (`shadeToHub`) as the real shade and hub, with the same
 * joint builders, so the pair fits exactly as the lamp will:
 *
 *   fitMale (part kind `fitMale`)        fitFemale (part kind `fitFemale`)
 *
 *        ┃ ┃  collar section                 ┃ ┃  ring section (bore = the
 *        ┃▐┃  lugs / ribs / thread           ┃▌┃  hub ring's, female cutters
 *    ════╋═╋════ base disc (its top          ┃▌┃  at the mouth)
 *    ════╧═╧════ = the shade's seat)     ════╛ ╘════ ring base at the mouth
 *
 * - The male piece is a `FIT_SECTION` tall section of the outer shade's collar
 *   (the tube and the joint's male side, exactly where the shade has them above
 *   its seat) standing on a `FIT_BASE` thick base disc whose top is the collar
 *   plane. It prints base down, collar up, like the shade.
 * - The female piece is a `FIT_SECTION` + `FIT_BASE` tall section of the hub's
 *   outer collar ring (its bore, its outer radius and the joint's female
 *   cutters at the mouth) whose bottom `FIT_BASE` widen into a ring base. It
 *   prints mouth down, like the hub, so the joint's surfaces print as the hub's do.
 *
 * Assembled, the female piece stands on the male's base disc (its mouth on the
 * collar plane), as the hub stands on the shade's seat. Every overhang is the
 * joint's own 45° (lug undersides, groove ceilings, thread flanks).
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { FitPieceParams } from '../../model/parts.ts';
import { collarJoint } from '../joints/index.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';

/** Height of the collar / ring section of a fit-test piece, mm. */
export const FIT_SECTION = 15;
/** Thickness of the base disc (male) and of the ring base (female), mm. */
export const FIT_BASE = 3;
/** How far the bases reach outside the hub ring's outer radius (a grip to turn them by), mm. */
export const FIT_GRIP = 3;

/** Derived dimensions of a fit-test piece, in its print frame. */
export type FitPieceDerived = {
  /** The joint's origin (the collar plane on the male, the ring's mouth on the female). */
  zJoint: number;
  /** Top of the piece. */
  zTop: number;
  /** The collar's body radius (male) or the ring's bore before the joint's inset (female). */
  rJoint: number;
  /** Outer radius of the base. */
  rBase: number;
};

export interface FitPieceStats extends GeometryStats {
  derived: FitPieceDerived;
}

/** Bed footprint of either piece (its bounding box) without building it. Pure, no WASM. */
export function fitPieceFootprint(p: FitPieceParams): Footprint {
  return { x: 2 * p.baseRadius, y: 2 * p.baseRadius, z: p.base + p.height };
}

function statsOf(result: Manifold, derived: FitPieceDerived): FitPieceStats {
  const bb = result.boundingBox();
  const volume = result.volume();
  return {
    status: result.status(),
    triangles: result.numTri(),
    vertices: result.numVert(),
    volumeMm3: volume,
    estGramsPla: (volume / 1000) * 1.24,
    bbox: { min: bb.min, max: bb.max },
    // Lug undersides, groove ceilings and thread flanks are 45°; everything else is vertical or flat.
    maxOverhangDeg: 45,
    derived,
  };
}

/**
 * The male piece: the base disc and the collar tube as one revolved profile
 * (the collar's bore runs through the disc), plus the joint's male side on the
 * collar plane.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildFitMale(
  k: Kernel,
  params: FitPieceParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: FitPieceStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const segs = QUALITY[quality].segments;
    const joint = collarJoint(p.joint.type);
    const r = p.collar.radius;
    const rOut = r - joint.bodyInset;
    const rBore = r - p.collar.wall;
    const z0 = p.base;
    const zTop = p.base + p.height;
    const profile: Vec2[] = [
      [rBore, 0],
      [p.baseRadius, 0],
      [p.baseRadius, z0],
      [rOut, z0],
      [rOut, zTop],
      [rBore, zTop],
    ];
    const body = s.add(Manifold.revolve([profile], segs));
    const male = s.add(
      joint.male(k, p.joint, { rCollar: r, z: [z0, z0 + p.joint.length], segs, quality }),
    );
    const result = s.add(Manifold.union([body, male]));
    return {
      manifold: s.keep(result),
      stats: statsOf(result, { zJoint: z0, zTop, rJoint: r, rBase: p.baseRadius }),
    };
  });
}

/**
 * The female piece: the hub ring's section with its ring base as one revolved
 * profile (the bore less the joint's inset, as the hub's), minus the joint's
 * female cutters at the mouth (z 0, on the bed).
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildFitFemale(
  k: Kernel,
  params: FitPieceParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: FitPieceStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const segs = QUALITY[quality].segments;
    const joint = collarJoint(p.joint.type);
    const rBore = p.collar.ringInnerRadius - joint.bodyInset;
    const rRing = p.collar.seatRadius;
    const zTop = p.base + p.height;
    const profile: Vec2[] = [
      [rBore, 0],
      [p.baseRadius, 0],
      [p.baseRadius, p.base],
      [rRing, p.base],
      [rRing, zTop],
      [rBore, zTop],
    ];
    const ring = s.add(Manifold.revolve([profile], segs));
    const cutters = joint
      .femaleCutters(k, p.joint, {
        rCollar: p.collar.radius,
        z: [0, p.joint.length],
        segs,
        quality,
      })
      .map((m) => s.add(m));
    const result = cutters.length > 0 ? s.add(Manifold.difference([ring, ...cutters])) : ring;
    return {
      manifold: s.keep(result),
      stats: statsOf(result, {
        zJoint: 0,
        zTop,
        rJoint: p.collar.ringInnerRadius,
        rBase: p.baseRadius,
      }),
    };
  });
}
