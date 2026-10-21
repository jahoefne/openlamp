/**
 * Part kind `base`: the standing lamp's weighted base. Stub: the builder arrives in step M2.2b,
 * which owns this file (see `BaseParams` in model/parts.ts for its parameters).
 */
import type { GeometryStats } from '../../model/assembly.ts';
import type { BaseParams } from '../../model/parts.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';

/**
 * Build the standing lamp's weighted base in its print orientation (bed = z 0).
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export const buildBase: (
  k: Kernel,
  params: BaseParams,
  quality?: Quality,
) => { manifold: Manifold; stats: GeometryStats } = () => {
  throw new Error('base builder arrives in step M2.2b');
};
