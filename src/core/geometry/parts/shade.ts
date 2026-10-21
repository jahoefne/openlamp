/**
 * Part kind `shade`: the fused single-piece print (hub + shade, the classic
 * shade's builder unchanged) or a shade of one family that ends in a collar
 * (the revolved family so far; tiered, slatted and geometric join in M3).
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { ShadeParams } from '../../model/parts.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';
import { buildClassicShade, classicShadeFootprint } from './classicShade.ts';
import { buildRevolvedShade, revolvedShadeFootprint } from './shades/revolved.ts';

export function buildShade(
  k: Kernel,
  params: ShadeParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: GeometryStats } {
  switch (params.variant) {
    case 'fused':
      return buildClassicShade(k, params, quality);
    case 'revolved':
      return buildRevolvedShade(k, params, quality);
  }
}

/** Bed footprint of a shade without building it. Pure, no WASM. */
export function shadeFootprint(params: ShadeParams): Footprint {
  switch (params.variant) {
    case 'fused':
      return classicShadeFootprint(params);
    case 'revolved':
      return revolvedShadeFootprint(params);
  }
}
