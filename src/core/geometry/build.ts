/**
 * Part registry: one builder per part kind, and `buildPart` to run the right one
 * for a part spec.
 */
import type {
  GeometryStats,
  PartKind,
  PartParamsByKind,
  PartSpec,
  PartStats,
} from '../model/assembly.ts';
import type { Kernel, Manifold } from './kernel.ts';
import { buildClassicShade } from './parts/classicShade.ts';
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
  classicShade: buildClassicShade,
};

/** Build a part at the given quality and time it. */
export function buildPart(
  k: Kernel,
  spec: Pick<PartSpec, 'kind' | 'params'>,
  quality: Quality,
): { manifold: Manifold; stats: PartStats } {
  const builder: Builder<PartParamsByKind[typeof spec.kind]> = PART_BUILDERS[spec.kind];
  const t0 = Date.now();
  const { manifold, stats } = builder(k, spec.params, quality);
  return { manifold, stats: { ...stats, buildMs: Date.now() - t0 } };
}
