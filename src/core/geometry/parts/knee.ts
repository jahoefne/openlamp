/**
 * The knee of the wall arm (part kind `knee`), printed spigot down (see
 * `KneeParams` for the knee frame):
 *
 *         ╭──╮         the tang (rosette hinge, axis along x) …
 *        │ ⊙  │        … its axis `hingeHeight` above the seat plane
 *         ╰┬┬╯
 *          ││          the stalk (`stalk.width` × `stalk.depth`)
 *       ┌──┴┴──┐       the body (Ø `bodyDiameter`), its top `bodyHeight` above …
 *        ╲    ╱  ───   … the seat plane: the 45° shoulder rests on the seat cup
 *         │  │         the spigot (the pivot's male side), `pivot.length` long
 *         └──┘         its end on the bed
 *
 * The pure functions here (`deriveKnee`, `kneeFootprint`) are frozen: the
 * wall arm's placement reads them.
 *
 * STEP 0 PLACEHOLDER: `buildKnee` returns a solid filling the footprint; step
 * 2 builds the knee from `features/pivot.ts` (`spigot`) and
 * `features/rosette.ts` (`rosetteTang`).
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { KneeParams } from '../../model/parts.ts';
import { pivotDims } from '../features/pivot.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';
import { placeholderPart } from './placeholder.ts';

/** Derived dimensions of the knee (knee frame unless noted). */
export type KneeDerived = {
  rSpigot: number;
  rBore: number;
  /** The spigot's length below the seat plane: the print frame is the knee frame moved up by it. */
  spigotLength: number;
  /** The hinge axis above the seat plane. */
  seatToHinge: number;
  rBody: number;
  bodyHeight: number;
  /** The hinge axis's height in the print frame. */
  hingeZ: number;
  /** The print height: up to the top of the tang's disc. */
  height: number;
};

export interface KneeStats extends GeometryStats {
  derived: KneeDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveKnee(p: KneeParams): KneeDerived {
  const pv = pivotDims(p.pivot);
  const spigotLength = pv.length;
  const hingeZ = spigotLength + p.hingeHeight;
  return {
    rSpigot: pv.rSpigot,
    rBore: p.boreDiameter / 2,
    spigotLength,
    seatToHinge: p.hingeHeight,
    rBody: p.bodyDiameter / 2,
    bodyHeight: p.bodyHeight,
    hingeZ,
    height: hingeZ + p.rosette.radius,
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function kneeFootprint(p: KneeParams): Footprint {
  const d = deriveKnee(p);
  return {
    x: Math.max(2 * d.rBody, p.stalk.width, p.rosette.tangThickness),
    y: Math.max(2 * d.rBody, p.stalk.depth, 2 * p.rosette.radius),
    z: d.height,
  };
}

/**
 * Build the knee.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 *
 * STEP 0 PLACEHOLDER: a solid filling the footprint (step 2 builds the knee).
 */
export function buildKnee(
  k: Kernel,
  params: KneeParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: KneeStats } {
  void quality;
  const d = deriveKnee(params);
  const { manifold, stats } = placeholderPart(k, kneeFootprint(params));
  return { manifold, stats: { ...stats, derived: d } };
}
