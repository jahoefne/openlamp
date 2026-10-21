/**
 * Part registry: one builder per part kind, and `buildPart` to run the right one
 * for a part spec.
 */
import type { GeometryStats, PartKind, PartParamsByKind, PartStats } from '../model/assembly.ts';
import type { Kernel, Manifold } from './kernel.ts';
import { buildHub } from './parts/hub.ts';
import { buildShade } from './parts/shade.ts';
import type { Quality } from './quality.ts';

/**
 * Builds one part in its print orientation (bed = z 0). The caller owns the
 * returned manifold and must dispose it.
 */
export type Builder<P> = (
  k: Kernel,
  params: P,
  quality: Quality,
) => { manifold: Manifold; stats: GeometryStats };

export const PART_BUILDERS: { readonly [K in PartKind]: Builder<PartParamsByKind[K]> } = {
  hub: buildHub,
  shade: buildShade,
};

/** One line per part kind, for the CLI's `list`. */
export const PART_KIND_DESCRIPTIONS: { readonly [K in PartKind]: string } = {
  hub: 'holds the light, hangs from the mount and holds the shade (two-part lamps)',
  shade:
    'the shade: hub and shade fused into one print (the classic shade), or a shade with a collar',
};

/** What a builder needs of a part spec: its kind and the matching params. */
export type BuildableSpec = {
  [K in PartKind]: { kind: K; params: PartParamsByKind[K] };
}[PartKind];

/**
 * Build a part and time it. The quality defaults to the one `assemble()` baked
 * into the part's params (and its buildKey).
 */
export function buildPart(
  k: Kernel,
  spec: BuildableSpec,
  quality: Quality = spec.params.quality,
): { manifold: Manifold; stats: PartStats } {
  const t0 = Date.now();
  const { manifold, stats } = runBuilder(k, spec, quality);
  return { manifold, stats: { ...stats, buildMs: Date.now() - t0 } };
}

function runBuilder(
  k: Kernel,
  spec: BuildableSpec,
  quality: Quality,
): { manifold: Manifold; stats: GeometryStats } {
  switch (spec.kind) {
    case 'hub':
      return PART_BUILDERS.hub(k, spec.params, quality);
    case 'shade':
      return PART_BUILDERS.shade(k, spec.params, quality);
  }
}
