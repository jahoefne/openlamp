/**
 * Part kind `tier`: one tier of a tiered (PH-style) shade. The builder lives
 * with its family in `shades/tiered.ts` (M3b); this is the registry's entry.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { TierParams } from '../../model/parts.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';
import { buildTier, tierFootprint } from './shades/tiered.ts';

export function buildTierPart(
  k: Kernel,
  params: TierParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: GeometryStats } {
  return buildTier(k, params, quality);
}

/** Bed footprint of a tier without building it. Pure, no WASM. */
export function tierPartFootprint(params: TierParams): Footprint {
  return tierFootprint(params);
}
