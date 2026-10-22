/**
 * The geometric shade family (M3b): `polyhedral` = `extrude(Ngon, H, 0, twist,
 * scaleTop)` minus the inner polygon extruded with the same twist (ruled
 * origami facets); `pleated` = `radialWarp` with a triangle wave whose phase
 * alternates per band (Yoshimura); `lattice` = a shell minus hole prisms on a
 * staggered (θ, z) grid, `Manifold.compose(cutters)` then one `difference`
 * (capped at ~600 holes). Every form ends in the flat annulus at the collar
 * plane that `collar.ts` stands the collar on (see `revolved.ts`). Part kind
 * `shade` (`variant: 'geometric'`).
 *
 * M3a ships this file as a stub: `assembly/shades/geometric.ts` still hands
 * the assembler a revolved stand-in, so nothing calls the builder yet.
 */
import type { Footprint, GeometryStats } from '../../../model/assembly.ts';
import type { GeometricShadeParams } from '../../../model/parts.ts';
import type { Kernel, Manifold } from '../../kernel.ts';
import type { Quality } from '../../quality.ts';

/** Bed footprint (an upper bound of the bounding box) without building it. Pure, no WASM. */
export function geometricShadeFootprint(p: GeometricShadeParams): Footprint {
  const r = Math.max(p.bottomDiameter, p.topDiameter) / 2 + (p.pleatDepth ?? 0);
  const rr = Math.max(r, p.collar.seatRadius);
  return { x: 2 * rr, y: 2 * rr, z: p.height + p.joint.length + 40 };
}

/** Build the shade (M3b). */
export function buildGeometricShade(
  k: Kernel,
  params: GeometricShadeParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: GeometryStats } {
  throw new Error(`Geometric shades (${params.pattern}, ${quality}) arrive in M3b`);
}
