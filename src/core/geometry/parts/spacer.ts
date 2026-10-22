/**
 * Part kind `spacer` (M3b): a rod that holds two tiers of a tiered shade
 * apart, Ø5 with a Ø4 × 3 pin at each end that goes through the tiers'
 * sockets (Ø4.3 at the default tolerance). Its axis is square to the two
 * shells where they overlap (more upright where that would put a socket
 * outside the overlap), its end faces sit flush on them (`endSlopes`, tilted
 * about its y axis), and it prints standing on its lower pin:
 *
 *            ┃┃   top pin (into the upper tier's socket)
 *          ▁▁┃┃▔▔ top face: the upper tier's lower face
 *          ▐  ▌   rod, `length` on the axis
 *          ▔▔┃┃▁▁ bottom face: the lower tier's upper face
 *            ┃┃   bottom pin, standing on the bed (z 0)
 *
 * The pin runs through the whole rod (one Ø4 core), the rod is a Ø5 cylinder
 * trimmed by its two end planes. The bottom pin is longer than `pin.length`
 * only when a steep bottom face would otherwise reach down to the bed.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { SpacerParams } from '../../model/parts.ts';
import { scoped, type Kernel, type Manifold } from '../kernel.ts';
import type { Quality } from '../quality.ts';
import { SOCKET_SEGMENTS } from './shades/tiered.ts';

/** The lowest point of the bottom face stays this far above the bed, mm. */
const BED_LIP = 0.6;
/** The shortest rod the builder makes, whatever its params say, mm. */
const MIN_ROD = 0.5;

/** Derived dimensions of a spacer in its print frame (axis = z, the bottom pin's end on the bed). */
export type SpacerDerived = {
  rRod: number;
  rPin: number;
  /** The end faces' slopes (dz/dx, falling toward +x). */
  slopeTop: number;
  slopeBottom: number;
  /** The rod on the axis, as built. */
  length: number;
  /** The bottom pin, from the bed to the bottom face on the axis. */
  pinBottom: number;
  /** The end faces on the axis. */
  zBottom: number;
  zTop: number;
  /** The top pin's end. */
  zPinTop: number;
  /** The highest point. */
  height: number;
};

export interface SpacerStats extends GeometryStats {
  derived: SpacerDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveSpacer(p: SpacerParams): SpacerDerived {
  const rRod = p.diameter / 2;
  const rPin = Math.min(p.pin.diameter / 2, rRod);
  const slopeTop = p.endSlopes?.top ?? 0;
  const slopeBottom = p.endSlopes?.bottom ?? 0;
  const length = Math.max(MIN_ROD, p.length);
  const pinBottom = Math.max(p.pin.length, rRod * Math.abs(slopeBottom) + BED_LIP);
  const zBottom = pinBottom;
  const zTop = zBottom + length;
  const zPinTop = zTop + p.pin.length;
  return {
    rRod,
    rPin,
    slopeTop,
    slopeBottom,
    length,
    pinBottom,
    zBottom,
    zTop,
    zPinTop,
    height: Math.max(zPinTop, zTop + rRod * Math.abs(slopeTop)),
  };
}

/** Bed footprint (the bounding box, standing) without building it. Pure, no WASM. */
export function spacerFootprint(p: SpacerParams): Footprint {
  const d = deriveSpacer(p);
  return { x: 2 * d.rRod, y: 2 * d.rRod, z: d.height };
}

/**
 * Build a spacer standing on its bottom pin.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildSpacer(
  k: Kernel,
  params: SpacerParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: SpacerStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const d = deriveSpacer(params);
    const segs = SOCKET_SEGMENTS[quality];
    // The rod, long enough for both tilted faces, trimmed by them.
    const z0 = d.zBottom - d.rRod * Math.abs(d.slopeBottom) - 1;
    const z1 = d.zTop + d.rRod * Math.abs(d.slopeTop) + 1;
    const blank = s.add(
      s.add(Manifold.cylinder(z1 - z0, d.rRod, d.rRod, segs)).translate([0, 0, z0]),
    );
    // Keep z + slope·x ≥ zBottom (above the bottom face) and ≤ zTop (below the top face).
    const nb = Math.hypot(d.slopeBottom, 1);
    const above = s.add(blank.trimByPlane([d.slopeBottom / nb, 0, 1 / nb], d.zBottom / nb));
    const nt = Math.hypot(d.slopeTop, 1);
    const rod = s.add(above.trimByPlane([-d.slopeTop / nt, 0, -1 / nt], -d.zTop / nt));
    const pin = s.add(Manifold.cylinder(d.zPinTop, d.rPin, d.rPin, segs));
    const result = s.add(Manifold.union(rod, pin));

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: SpacerStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // Vertical, its faces up or (the bottom one) a 0.5 mm step from the pin, narrower than one extrusion.
      maxOverhangDeg: 0,
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
