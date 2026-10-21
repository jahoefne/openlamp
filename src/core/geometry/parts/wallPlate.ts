/**
 * Part kind `wallPlate`: the wall arm's wall plate. Stub: the builder arrives in step M2.2b,
 * which owns this file (see `WallPlateParams` in model/parts.ts for its parameters).
 */
import type { GeometryStats } from '../../model/assembly.ts';
import type { WallPlateParams } from '../../model/parts.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';

/**
 * Build the wall arm's wall plate in its print orientation (bed = z 0).
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export const buildWallPlate: (
  k: Kernel,
  params: WallPlateParams,
  quality?: Quality,
) => { manifold: Manifold; stats: GeometryStats } = () => {
  throw new Error('wallPlate builder arrives in step M2.2b');
};
