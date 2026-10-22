/**
 * Part kind `spacer` (M3b): a rod between two tiers of a tiered shade, Ø5
 * with a Ø4 × 3 pin at each end that goes into the tiers' Ø4.3 sockets.
 * Printed lying down (or standing on a pin).
 *
 * M3a ships this file as a stub: no assembly produces spacers yet.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { SpacerParams } from '../../model/parts.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';

/** Bed footprint (an upper bound of the bounding box) without building it. Pure, no WASM. */
export function spacerFootprint(p: SpacerParams): Footprint {
  const total = p.length + 2 * p.pin.length;
  return { x: total, y: p.diameter, z: p.diameter };
}

/** Build a spacer (M3b). */
export function buildSpacer(
  k: Kernel,
  params: SpacerParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: GeometryStats } {
  throw new Error(`Tier spacers (Ø${params.diameter} mm, ${quality}) arrive in M3b`);
}
