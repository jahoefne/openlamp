/**
 * The tiered (PH-style) shade family (M3b): every tier is the revolve of a
 * curved shell (part kind `tier`); tiers overlap (`rIn[i+1] < rOut[i]`, a
 * vertical `tierDrop` apart) so the light is never seen directly. The top
 * tier ends in the flat annulus at the collar plane that `collar.ts` stands
 * the collar on (see `revolved.ts`); the others hang from spacers (part kind
 * `spacer`, `parts/spacer.ts`) in Ø4.3 sockets. Each tier prints the way up
 * that its overhang analysis prefers (`TierParams.flipped`); flat saucers warn.
 *
 * M3a ships this file as a stub: `assembly/shades/tiered.ts` still hands the
 * assembler a revolved stand-in, so nothing calls the builder yet.
 */
import type { Footprint, GeometryStats } from '../../../model/assembly.ts';
import type { TierParams } from '../../../model/parts.ts';
import type { Kernel, Manifold } from '../../kernel.ts';
import type { Quality } from '../../quality.ts';

/** Bed footprint (an upper bound of the bounding box) without building it. Pure, no WASM. */
export function tierFootprint(p: TierParams): Footprint {
  const r = Math.max(p.profile.rOuter, p.profile.rInner, p.collar?.seatRadius ?? 0);
  return { x: 2 * r, y: 2 * r, z: p.profile.drop + (p.joint?.length ?? 0) + 40 };
}

/** Build one tier (M3b). */
export function buildTier(
  k: Kernel,
  params: TierParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: GeometryStats } {
  throw new Error(`Tiered shades (tier ${params.index + 1}, ${quality}) arrive in M3b`);
}
