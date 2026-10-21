/**
 * Mesh quality presets. `segments` is the number of segments around a full
 * circle, `wallStep` the vertical sampling step of a revolve profile in mm.
 */
import type { SurfaceStyleName } from './surface.ts';

export const QUALITIES = ['draft', 'normal', 'fine'] as const;

export type Quality = (typeof QUALITIES)[number];

export const QUALITY = {
  draft: { segments: 128, wallStep: 3 },
  normal: { segments: 256, wallStep: 1.5 },
  fine: { segments: 512, wallStep: 1 },
} as const satisfies Record<Quality, { segments: number; wallStep: number }>;

/**
 * Circular segments for a revolved surface. A ribbed or faceted surface needs a
 * few vertices per rib / facet, and a segment count that is a multiple of the
 * pattern count so every rib is sampled the same way.
 */
export function circularSegments(
  quality: Quality,
  surface?: { readonly style: SurfaceStyleName; readonly patternCount: number },
): number {
  const base = QUALITY[quality].segments;
  if (!surface || surface.style === 'smooth') return base;
  const n = Math.max(1, Math.round(surface.patternCount));
  const perPattern = surface.style === 'ribbed' ? 8 : 6;
  return Math.ceil(Math.max(base, n * perPattern) / n) * n;
}
