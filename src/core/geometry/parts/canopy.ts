/**
 * The ceiling canopy of a pendant (part kind `canopy`), printed ceiling-face-down:
 *
 *                 ┃┃ ┃┃      collet neck (grip `collet`): thread, 3 slits
 *            ╭────┸┸─┸┸────╮ room side, flat top (r = rTop)
 *          ╱  ▕ ▏  ╱╲  ▕ ▏   ╲   the cone narrows toward the room
 *        ╱    ▕ ▏ ╱  ╲ ▕ ▏     ╲ screw slots with head counterbores
 *       │     ▕ ▏╱    ╲▕ ▏      │ rim
 *   ════╧════════ recess ════════╧════ ceiling face (on the bed)
 *
 * Revolve of the cone, minus a 45° recess on the ceiling side (the cord's knot
 * sits in its apex above the cord hole; a cone with its apex up prints without
 * support), the cord hole, two radial screw slots (through) with counterbores
 * for the heads (from the floor up). With a collet, a threaded neck (the male
 * side of the grip's joint) stands on the room side, slit three times so the
 * grip's cone can press it onto the cord.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { CanopyParams } from '../../model/parts.ts';
import { threadJoint } from '../joints/thread.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';

/** Vertical rim at the ceiling face, mm. */
const RIM = 2;
/** Material between the recess's apex and the room side, mm. */
const TOP_WALL = 3;
/** Wall between the recess and the screw slots, mm. */
const SLOT_WALL = 2;
/** Radial inset of a thread's body under its teeth (as joints/thread.ts). */
const THREAD_BODY_INSET = 0.3;
/** The collet's slits start this far above the canopy's top, mm. */
const SLIT_ROOT = 2;

/** Derived dimensions of the canopy, in its print frame (ceiling face at z 0). */
export type CanopyDerived = {
  R: number;
  H: number;
  rim: number;
  /** Radius of the flat top (room side). */
  rTop: number;
  /** The recess: radius at the ceiling face; its apex is `rRecess` higher (45°). 0 = none. */
  rRecess: number;
  rHole: number;
  /** Centre radius of the screw slots' round ends (inner, outer). */
  slotR0: number;
  slotR1: number;
  /** Top of the collet neck (= H without a collet). */
  zTop: number;
};

export interface CanopyStats extends GeometryStats {
  derived: CanopyDerived;
}

/** The outer surface's height at radius r. */
function outerZ(d: Pick<CanopyDerived, 'R' | 'H' | 'rim' | 'rTop'>, r: number): number {
  if (r <= d.rTop) return d.H;
  return d.rim + ((d.H - d.rim) * (d.R - r)) / (d.R - d.rTop);
}

/** The collet thread's crest radius (0 without a collet). */
export function colletCrestRadius(p: Pick<CanopyParams, 'collet'>): number {
  if (!p.collet) return 0;
  return p.collet.joint.nominalDiameter / 2 + (p.collet.joint.thread?.depth ?? 0);
}

/** All derived dimensions. Pure, no WASM. */
export function deriveCanopy(p: CanopyParams): CanopyDerived {
  const R = p.diameter / 2;
  const H = p.height;
  const rim = Math.min(RIM, H / 4);
  const rHole = p.cordHole / 2;
  const rTop = Math.min(R - 5, Math.max(R / 2, colletCrestRadius(p) + 3, rHole + 4));
  const c = (p.screwSlot.length - p.screwSlot.width) / 2;
  const slotR0 = p.screwSpacing / 2 - c;
  const slotR1 = p.screwSpacing / 2 + c;
  const base = { R, H, rim, rTop };
  // The recess: as large as the top wall, the slots and the outer surface allow.
  const slotInner = slotR0 - p.screwSlot.width / 2; // through slot, z 0 … floor
  const headInner = slotR0 - p.screwSlot.headDiameter / 2; // counterbore, floor … top
  let rRecess = Math.min(
    H - TOP_WALL,
    slotInner - SLOT_WALL,
    headInner - SLOT_WALL + p.screwSlot.floor,
  );
  const fits = (rr: number) => {
    for (let i = 0; i <= 32; i++) {
      const r = (rr * i) / 32;
      if (outerZ(base, r) - (rr - r) < TOP_WALL) return false;
    }
    return true;
  };
  while (rRecess > 0 && !fits(rRecess)) rRecess -= 0.5;
  if (rRecess < 2 * rHole + 2) rRecess = 0;
  const zTop = p.collet ? H + p.collet.joint.length : H;
  return { ...base, rRecess, rHole, slotR0, slotR1, zTop };
}

/** Bed footprint without building it. Pure, no WASM. */
export function canopyFootprint(p: CanopyParams): Footprint {
  const d = deriveCanopy(p);
  return { x: 2 * d.R, y: 2 * d.R, z: d.zTop };
}

/** A stadium (slot) along +x from r0 to r1, `width` wide, as a prism from z0 to z1. */
function slotPrism(
  k: Kernel,
  r0: number,
  r1: number,
  width: number,
  z0: number,
  z1: number,
  segs: number,
): Manifold {
  return scoped(k, (s) => {
    const { CrossSection } = k;
    const n = Math.max(8, Math.round(segs / 8));
    const circle = s.add(CrossSection.circle(width / 2, n));
    const a = s.add(circle.translate([r0, 0]));
    const b = s.add(circle.translate([r1, 0]));
    const stadium = s.add(CrossSection.hull([a, b]));
    return s.keep(s.add(s.add(stadium.extrude(z1 - z0)).translate([0, 0, z0])));
  });
}

/**
 * Build the canopy.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildCanopy(
  k: Kernel,
  params: CanopyParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: CanopyStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const d = deriveCanopy(p);
    const segs = QUALITY[quality].segments;
    const outline: Vec2[] = [
      [0, 0],
      [d.R, 0],
      [d.R, d.rim],
      [d.rTop, d.H],
      [0, d.H],
    ];
    const body = s.add(Manifold.revolve([outline], segs));
    const parts: Manifold[] = [body];
    if (p.collet) {
      const { joint } = p.collet;
      const r = joint.nominalDiameter / 2;
      const rTube = r - THREAD_BODY_INSET;
      const L = joint.length;
      parts.push(
        s.add(s.add(Manifold.cylinder(L + 0.5, rTube, rTube, segs)).translate([0, 0, d.H - 0.5])),
      );
      const ring = s.add(threadJoint.male(k, joint, { rCollar: r, z: [0, L], segs, quality }));
      parts.push(s.add(ring.translate([0, 0, d.H])));
    }
    const solid = s.add(Manifold.union(parts));

    const cutters: Manifold[] = [];
    if (d.rRecess > 0) {
      const rr = d.rRecess + 1; // from 1 mm below the ceiling face, same 45° line
      cutters.push(s.add(s.add(Manifold.cylinder(rr, rr, 0, segs)).translate([0, 0, -1])));
    }
    cutters.push(
      s.add(s.add(Manifold.cylinder(d.zTop + 2, d.rHole, d.rHole, segs)).translate([0, 0, -1])),
    );
    const { width, headDiameter, floor } = p.screwSlot;
    const through = s.add(slotPrism(k, d.slotR0, d.slotR1, width, -1, d.H + 1, segs));
    const head = s.add(slotPrism(k, d.slotR0, d.slotR1, headDiameter, floor, d.H + 1, segs));
    for (const a of [0, 180]) {
      cutters.push(s.add(through.rotate([0, 0, a])), s.add(head.rotate([0, 0, a])));
    }
    if (p.collet) {
      const { slits, slitWidth, joint } = p.collet;
      const rOut = colletCrestRadius(p) + 1;
      const h = joint.length - SLIT_ROOT + 1;
      const slit = s.add(
        s
          .add(Manifold.cube([rOut, slitWidth, h], false))
          .translate([0, -slitWidth / 2, d.H + SLIT_ROOT]),
      );
      for (let i = 0; i < slits; i++) {
        cutters.push(s.add(slit.rotate([0, 0, 90 + (i * 360) / slits])));
      }
    }
    const result = s.add(Manifold.difference([solid, ...cutters]));

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: CanopyStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The recess and the thread's flanks are 45°; everything else faces up or is vertical.
      maxOverhangDeg: 45,
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
