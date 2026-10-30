/**
 * A rosette hinge's knob (part kind `knob`): a lobed star, printed flat (see
 * `KnobParams`): the face that lies on the ear on the bed, the bolt's bore
 * through it, the nut's hexagonal pocket open on the top face. One part, a
 * copy per hinge.
 *
 * The pure functions here (`knobFootprint`) are frozen.
 *
 * STEP 0 PLACEHOLDER: `buildKnob` returns a disc filling the footprint; step
 * 2 builds the knob.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { KnobParams } from '../../model/parts.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';
import { placeholderPart } from './placeholder.ts';

/** Bed footprint without building it. Pure, no WASM. */
export function knobFootprint(p: KnobParams): Footprint {
  return { x: p.diameter, y: p.diameter, z: p.height };
}

/**
 * Build the knob.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 *
 * STEP 0 PLACEHOLDER: a disc filling the footprint (step 2 builds the knob).
 */
export function buildKnob(
  k: Kernel,
  params: KnobParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: GeometryStats } {
  return placeholderPart(k, knobFootprint(params), {
    round: true,
    segs: Math.max(32, QUALITY[quality].segments / 4),
  });
}
