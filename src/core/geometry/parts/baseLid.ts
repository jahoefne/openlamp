/**
 * The lid of the base's weight pocket (part kind `baseLid`): a flat ring that
 * sits in the pocket's mouth, flush with the base's underside, with a notch
 * for the base's spoke (the cable groove runs along it). Seen from below:
 *
 *            ╭───────────╮
 *          ╱  ╭───────╮   ╲      `snap`: 3 crush ribs on the outer edge press
 *         │   │ stem  │ ═══╡◄─   it into the pocket (clearance `tolerance`)
 *          ╲  ╰───────╯   ╱      `screws`: 3 counterbored holes into the
 *            ╰───────────╯       base's tapping bosses
 *
 * Built as it lies in the base (floor face at z 0), then turned half a turn
 * about x: it prints with the pocket side on the bed and the counterbores
 * open upward.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { BaseLidParams } from '../../model/parts.ts';
import { screwPattern } from '../joints/screw.ts';
import { scoped, type Kernel, type Manifold } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';
import { BASE_SPOKE_WIDTH } from './base.ts';

/** Crush ribs of the snap lid: count, angle of the first (clear of the spoke on +x). */
const RIBS = 3;
const FIRST_RIB_DEG = 60;
/** The ribs stand this much further out than the clearance, as the press-fit collar's. */
export const LID_CRUSH = 0.1;
/** Rib centre line just inside the lid's edge, so no rib edge lies on it. */
const RIB_SINK = 0.05;
/** Segments of the screw holes. */
const SCREW_SEGMENTS = 32;

/** Derived dimensions of the lid, as it lies in the base (floor face at z 0). */
export type BaseLidDerived = {
  /** The ring: the pocket's radii with the clearance. */
  rOuter: number;
  rInner: number;
  thickness: number;
  /** Half the width of the spoke's notch. */
  notchHalfWidth: number;
  /** How far the crush ribs reach (snap; `rOuter` otherwise). */
  rRibs: number;
};

export interface BaseLidStats extends GeometryStats {
  derived: BaseLidDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveBaseLid(p: BaseLidParams): BaseLidDerived {
  const rOuter = p.outerDiameter / 2 - p.tolerance;
  return {
    rOuter,
    rInner: p.innerDiameter / 2 + p.tolerance,
    thickness: p.thickness,
    notchHalfWidth: BASE_SPOKE_WIDTH / 2 + p.tolerance,
    rRibs: p.lid === 'snap' ? rOuter + p.tolerance + LID_CRUSH : rOuter,
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function baseLidFootprint(p: BaseLidParams): Footprint {
  const d = deriveBaseLid(p);
  return { x: 2 * d.rRibs, y: 2 * d.rRibs, z: d.thickness };
}

/**
 * Build the lid of the base's weight pocket.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildBaseLid(
  k: Kernel,
  params: BaseLidParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: BaseLidStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const d = deriveBaseLid(p);
    const segs = QUALITY[quality].segments;
    const t = d.thickness;

    const ring = s.add(
      Manifold.revolve(
        [
          [
            [d.rInner, 0],
            [d.rOuter, 0],
            [d.rOuter, t],
            [d.rInner, t],
          ],
        ],
        segs,
      ),
    );
    const notch = s.add(
      s
        .add(Manifold.cube([d.rOuter + 2, 2 * d.notchHalfWidth, t + 2], false))
        .translate([0, -d.notchHalfWidth, -1]),
    );
    const cutters: Manifold[] = [notch];
    if (p.joint) {
      cutters.push(
        ...screwPattern(k, p.joint, 'male', {
          z: [0, t],
          face: 'bottom',
          segs: SCREW_SEGMENTS,
        }).map((m) => s.add(m)),
      );
    }
    let lid = s.add(Manifold.difference([ring, ...cutters]));
    if (p.lid === 'snap') {
      // V ribs (squares turned 45°) across the whole edge; only their tips crush.
      const reach = d.rRibs - d.rOuter;
      const side = (reach + RIB_SINK) * Math.SQRT2;
      const rib = s.add(
        s
          .add(s.add(Manifold.cube([side, side, t], true)).rotate([0, 0, 45]))
          .translate([d.rOuter - RIB_SINK, 0, t / 2]),
      );
      const ribs = Array.from({ length: RIBS }, (_, i) =>
        s.add(rib.rotate([0, 0, FIRST_RIB_DEG + (i * 360) / RIBS])),
      );
      lid = s.swap(lid, Manifold.union([lid, ...ribs]));
    }
    // Half a turn about x: the pocket side on the bed.
    const result = s.add(s.add(lid.rotate([180, 0, 0])).translate([0, 0, t]));

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: BaseLidStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // A flat plate: the holes are vertical, the counterbores open upward.
      maxOverhangDeg: 0,
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
