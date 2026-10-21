/**
 * Part kind `baseLid`: the lid of the standing lamp's weight pocket. Stub: the builder arrives in step M2.2b,
 * which owns this file (see `BaseLidParams` in model/parts.ts for its parameters).
 */
import type { GeometryStats } from '../../model/assembly.ts';
import type { BaseLidParams } from '../../model/parts.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';

/**
 * Build the lid of the standing lamp's weight pocket in its print orientation (bed = z 0).
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export const buildBaseLid: (
  k: Kernel,
  params: BaseLidParams,
  quality?: Quality,
) => { manifold: Manifold; stats: GeometryStats } = () => {
  throw new Error('baseLid builder arrives in step M2.2b');
};
