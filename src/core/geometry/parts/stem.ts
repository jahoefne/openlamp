/**
 * Part kind `stem`: the standing lamp's stem segments. Stub: the builder arrives in step M2.2b,
 * which owns this file (see `StemParams` in model/parts.ts for its parameters).
 */
import type { GeometryStats } from '../../model/assembly.ts';
import type { StemParams } from '../../model/parts.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';

/**
 * Build the standing lamp's stem segments in its print orientation (bed = z 0).
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export const buildStem: (
  k: Kernel,
  params: StemParams,
  quality?: Quality,
) => { manifold: Manifold; stats: GeometryStats } = () => {
  throw new Error('stem builder arrives in step M2.2b');
};
