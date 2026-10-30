/**
 * The hanger of the wall arm (part kind `hanger`), printed thread mouth down
 * (see `HangerParams` for the hanger frame):
 *
 *         ╭──╮         the tang (rosette hinge, axis along x), in the last link's end clevis
 *        │ ⊙  │
 *         ╰┬┬╯         the stalk: the axis `axisAboveBody` above the body's top
 *       ┌──┴┴──┐       the body (Ø `bodyDiameter`): the cable bore from the tang's
 *       │ ╱  ╲ │       channel down to a 45° roof over …
 *       │▚    ▞│       … the female thread for the hub's stub (`hubJoint`) …
 *   ════╧══════╧════   … its countersunk mouth on the bed (the hub's mount face meets it)
 *
 * Loose, it hangs plumb whatever the arm's tilt; tightened, it aims the shade.
 * The pure functions here (`deriveHanger`, `hangerFootprint`,
 * `hangerBodyHeight`) are frozen: the wall arm's placement reads them.
 *
 * STEP 0 PLACEHOLDER: `buildHanger` returns a solid filling the footprint;
 * step 2 builds it (the tang from `features/rosette.ts`, the female thread
 * mouth down with a 45° roof as the stem's female end, parts/stem.ts).
 */
import type { Footprint, GeometryStats, JointInterface } from '../../model/assembly.ts';
import type { HangerParams } from '../../model/parts.ts';
import type { Kernel, Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';
import { placeholderPart } from './placeholder.ts';

/** Material over the thread's 45° roof, at its rim, mm. */
export const HANGER_ROOF_SKIN = 2;

/**
 * The body's height: the female thread (`hubJoint.length` from the mouth),
 * the 45° roof from the thread's crest in to the cable bore, and a skin. Pure.
 */
export function hangerBodyHeight(hubJoint: JointInterface, boreDiameter: number): number {
  const rCrest =
    hubJoint.nominalDiameter / 2 + hubJoint.tolerance + (hubJoint.thread?.depth ?? 0) + 0.05;
  return hubJoint.length + Math.max(0, rCrest - boreDiameter / 2) + HANGER_ROOF_SKIN;
}

/** Derived dimensions of the hanger (hanger frame unless noted). */
export type HangerDerived = {
  rBody: number;
  rBore: number;
  bodyHeight: number;
  axisAboveBody: number;
  /** From the hinge axis down to the thread's mouth (the hub's mount face): the print frame is the hanger frame moved up by it. */
  drop: number;
  /** The print height: up to the top of the tang's disc. */
  height: number;
};

export interface HangerStats extends GeometryStats {
  derived: HangerDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveHanger(p: HangerParams): HangerDerived {
  const drop = p.bodyHeight + p.axisAboveBody;
  return {
    rBody: p.bodyDiameter / 2,
    rBore: p.boreDiameter / 2,
    bodyHeight: p.bodyHeight,
    axisAboveBody: p.axisAboveBody,
    drop,
    height: drop + p.rosette.radius,
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function hangerFootprint(p: HangerParams): Footprint {
  const d = deriveHanger(p);
  return {
    x: Math.max(2 * d.rBody, p.rosette.tangThickness),
    y: Math.max(2 * d.rBody, 2 * p.rosette.radius),
    z: d.height,
  };
}

/**
 * Build the hanger.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 *
 * STEP 0 PLACEHOLDER: a solid filling the footprint (step 2 builds the hanger).
 */
export function buildHanger(
  k: Kernel,
  params: HangerParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: HangerStats } {
  void quality;
  const d = deriveHanger(params);
  const { manifold, stats } = placeholderPart(k, hangerFootprint(params));
  return { manifold, stats: { ...stats, derived: d } };
}
