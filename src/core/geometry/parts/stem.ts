/**
 * A stem segment of the standing lamp (part kind `stem`), printed upright,
 * female end (or flange) on the bed:
 *
 *          ┌┴┴┐         male thread on top (`top`), 45° lead-in: into the next
 *       ───┘  └───      segment or the hub; the shoulder at `length` seats on it
 *        │  ┃┃  │       tube Ø `diameter`, cable bore Ø `boreDiameter` throughout
 *        │  ┃┃  │
 *        │ ╱  ╲ │       45° roof over the female bore (prints without support)
 *        │▚    ▞│       female thread (`bottom`, variant `segment`) …
 *   ═════╧══════╧═════  … with a countersunk mouth on the bed
 *
 *    ══╤══╱    ╲══╤══   variant `base` instead: a screw flange (`flange`) with a
 *                       45° fillet into the tube and through holes for the base
 *
 * Revolve of the outline (tube, or flange + fillet + tube), union of the male
 * thread (its tube and the threaded ring of joints/thread.ts), difference of
 * the cable bore, the female thread's cutters with the roof over them, and
 * the flange's screw holes (joints/screw.ts).
 */
import type { Footprint, GeometryStats, JointInterface } from '../../model/assembly.ts';
import type { StemParams } from '../../model/parts.ts';
import { screwPattern } from '../joints/screw.ts';
import { threadJoint } from '../joints/thread.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';

/** Radial inset of a thread's body under its teeth (as joints/thread.ts). */
const THREAD_BODY_INSET = 0.3;
/** At the mouth, the female countersink is this much wider than the thread's crest (as joints/thread.ts). */
const COUNTERSINK_AT_MOUTH = 0.5;
/** The thinnest tube wall around a female thread's mouth, mm. */
export const STEM_MIN_WALL = 1.6;
/** The 45° fillet between the flange and the tube, mm. */
const FLANGE_FILLET = 1.5;
/** Segments of the screw holes. */
const SCREW_SEGMENTS = 32;

/** Derived dimensions of a stem segment, in its print frame (bottom on the bed). */
export type StemDerived = {
  rOut: number;
  rBore: number;
  /** The shoulder (top of the tube), where the male thread starts. */
  length: number;
  /** The male thread on top: root radius and length. */
  rThread: number;
  threadLength: number;
  /** The print height: tube plus male thread. */
  height: number;
  /** The female bore (variant `segment`): root + tolerance; 0 without. */
  rFemale: number;
  /** The flange (variant `base`): radius and thickness; 0 without. */
  rFlange: number;
  flangeThickness: number;
};

export interface StemStats extends GeometryStats {
  derived: StemDerived;
}

/**
 * The thinnest stem that holds a female thread of this joint: the radius of
 * its countersunk mouth plus `STEM_MIN_WALL`. Pure, no WASM.
 */
export function minStemDiameter(joint: JointInterface): number {
  const depth = joint.thread?.depth ?? 0;
  const rMouth = joint.nominalDiameter / 2 + joint.tolerance + depth + COUNTERSINK_AT_MOUTH;
  return 2 * (rMouth + STEM_MIN_WALL);
}

/** All derived dimensions. Pure, no WASM. */
export function deriveStem(p: StemParams): StemDerived {
  const threadLength = p.top.length;
  return {
    rOut: p.diameter / 2,
    rBore: p.boreDiameter / 2,
    length: p.length,
    rThread: p.top.nominalDiameter / 2,
    threadLength,
    height: p.length + threadLength,
    rFemale: p.bottom ? p.bottom.nominalDiameter / 2 + p.bottom.tolerance : 0,
    rFlange: p.flange ? p.flange.diameter / 2 : 0,
    flangeThickness: p.flange ? p.flange.thickness : 0,
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function stemFootprint(p: StemParams): Footprint {
  const d = deriveStem(p);
  const r = Math.max(d.rOut, d.rFlange);
  return { x: 2 * r, y: 2 * r, z: d.height };
}

/**
 * Build a stem segment.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildStem(
  k: Kernel,
  params: StemParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: StemStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const d = deriveStem(p);
    const segs = QUALITY[quality].segments;
    const cyl = (h: number, r0: number, r1: number, z: number) =>
      s.add(s.add(Manifold.cylinder(h, r0, r1, segs)).translate([0, 0, z]));

    const L = d.length;
    const outline: Vec2[] = p.flange
      ? [
          [0, 0],
          [d.rFlange, 0],
          [d.rFlange, d.flangeThickness],
          [d.rOut + FLANGE_FILLET, d.flangeThickness],
          [d.rOut, d.flangeThickness + FLANGE_FILLET],
          [d.rOut, L],
          [0, L],
        ]
      : [
          [0, 0],
          [d.rOut, 0],
          [d.rOut, L],
          [0, L],
        ];
    const body = s.add(Manifold.revolve([outline], segs));
    // The male thread: its tube reaches 0.5 mm down into the shoulder for a clean union.
    const rTube = d.rThread - THREAD_BODY_INSET;
    const tube = cyl(d.threadLength + 0.5, rTube, rTube, L - 0.5);
    const ring = s.add(
      threadJoint.male(k, p.top, { rCollar: d.rThread, z: [L, d.height], segs, quality }),
    );
    const solid = s.add(Manifold.union([body, tube, ring]));

    const cutters: Manifold[] = [cyl(d.height + 2, d.rBore, d.rBore, -1)];
    if (p.bottom) {
      const female = threadJoint
        .femaleCutters(k, p.bottom, {
          rCollar: p.bottom.nominalDiameter / 2,
          z: [0, p.bottom.length],
          segs,
          quality,
        })
        .map((m) => s.add(m));
      // A 45° roof from the top of the thread's cutter (past the crest) in to
      // the cable bore, so the bore has no flat ceiling when printed.
      const zTop = Math.max(...female.map((m) => m.boundingBox().max[2]));
      const rCrest = d.rFemale + (p.bottom.thread?.depth ?? 0) + 0.05;
      cutters.push(...female, cyl(rCrest - d.rBore, rCrest, d.rBore, zTop));
    }
    if (p.flange) {
      cutters.push(
        ...screwPattern(k, p.flange.screws, 'male', {
          z: [0, d.flangeThickness],
          face: 'top',
          segs: SCREW_SEGMENTS,
        }).map((m) => s.add(m)),
      );
    }
    const result = s.add(Manifold.difference([solid, ...cutters]));

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: StemStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The threads' flanks, the countersink and the roof are 45°; the rest is
      // vertical or faces up.
      maxOverhangDeg: 45,
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
