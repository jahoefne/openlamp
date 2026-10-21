/**
 * The arm of the wall lamp (part kind `wallArm`), printed standing on its
 * flange (the flange's back face on the bed, the room's "up" along +y):
 *
 *              ┌──────┐       end boss: vertical in the room, lying here; the hub's
 *              │ ▒▒▒▒ ├─ ─    stub screws into its threaded bore from below (−y)
 *               ╲    ╱        teardrop section pointing at the wall (down here)
 *                ╲  ╱         faired into the tube with a hull
 *                 ││          the tube: straight, angled or curved (≤ 45° from vertical)
 *                 │┆│         cable bore Ø cable + 1 from the flange into the boss
 *            ═════╧═╧═════    flange on the bed: 4 × M3 through holes, counterbored on top
 *
 * The arm frame: z away from the wall (z 0 = the flange's back face, which
 * sits on the plate), y up in the room, x across. The tube's centre line
 * leaves the flange's centre along +z and ends on the boss's axis, the
 * vertical (room) line x 0, z = `length`: `straight` stays at y 0, `angled`
 * rises at `riseAngle` (a rotated extrusion), `curved` bends up along a torus
 * sector whose end tangent rises at `riseAngle` (a revolve). The print frame
 * is the arm frame moved along y so the footprint is centred (`yShift`).
 *
 * The boss's thread is the female side of the hub's stub (the joint frame's
 * z is the room's up, its mouth the boss's bottom face); it lies horizontal
 * here, its 45° flanks print, the cable continues up from it in a teardrop
 * bore that meets the tube's bore on the boss axis.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { WallArmParams } from '../../model/parts.ts';
import { screwPattern } from '../joints/screw.ts';
import { threadJoint } from '../joints/thread.ts';
import { scoped, type CrossSection, type Kernel, type Manifold } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';

const DEG = Math.PI / 180;
/** Wall of the boss around the thread's countersink: boss Ø = root Ø + 2 × wall + `BOSS_EXTRA`. */
export const BOSS_WALL = 2.4;
/** What the boss adds to the root Ø besides its walls (thread depth, tolerance, countersink). */
const BOSS_EXTRA = 8;
/** The tube's bore runs this far above the thread's end (plus the cutter's overrun allowance). */
const BORE_ABOVE_THREAD = 1.5;
/** The fairing slice's lower rim stays this far above the boss's bottom face (clear of the hub). */
const HUB_GAP = 1;
/** The vertical cable bore in the boss is this much wider than the tube's bore. */
const CABLE_GAP = 0.25;
/** The fairing's hull faces stay this far inside 45°, mm. */
const FAIR_MARGIN = 1;
/** The 45° bevel on the boss's upper side sits this far inside the slice's rim, mm. */
const BEVEL_MARGIN = 3;
/** Thickness of the tube slice the fairing is hulled with, mm. */
const SLICE = 0.5;
/** The tube reaches this far past the fairing's slice into the hull, mm. */
const TUBE_INTO_FAIRING = 2;
/** Rises below this are built straight, degrees. */
const MIN_RISE = 0.5;

/** Derived dimensions of the arm (all numbers; in the arm frame unless noted). */
export type WallArmDerived = {
  /** The rise actually built, degrees (0 for a straight arm). */
  rise: number;
  /** 0 straight, 1 angled, 2 curved (as built). */
  shapeIndex: number;
  /** Tube, cable bore and boss radii. */
  rTube: number;
  rBore: number;
  rBoss: number;
  /** Horizontal distance from the flange's back face to the boss axis (`length`). */
  reach: number;
  /** Height of the centre line where it meets the boss axis. */
  yEnd: number;
  /** Radius of a curved centre line (0 otherwise). */
  bendRadius: number;
  /** Length of the centre line from the flange to the boss axis. */
  centreLength: number;
  /** The boss: from its bottom face (the thread's mouth) `yBoss0` up to `yBoss1`. */
  yBoss0: number;
  yBoss1: number;
  bossHeight: number;
  /** Where the boss's teardrop points (toward the wall). */
  zTip: number;
  /** The fairing's slice, this far back along the centre line from the boss axis. */
  fairing: number;
  flangeRadius: number;
  flangeThickness: number;
  /** The print frame is the arm frame moved by `yShift` along y. */
  yShift: number;
  /** Bounding box half-width (x), extent (y) and height (z) in the print frame. */
  halfWidth: number;
  depth: number;
  height: number;
};

export interface WallArmStats extends GeometryStats {
  derived: WallArmDerived;
}

/** A point of the centre line `back` mm before its end, and the tube's tilt from vertical there. */
function centreLineAt(
  d: Pick<WallArmDerived, 'shapeIndex' | 'rise' | 'reach' | 'yEnd' | 'bendRadius'>,
  back: number,
): { y: number; z: number; tilt: number } {
  const th = d.rise * DEG;
  switch (d.shapeIndex) {
    case 1:
      return { y: d.yEnd - back * Math.sin(th), z: d.reach - back * Math.cos(th), tilt: th };
    case 2: {
      const phi = Math.max(0, th - back / d.bendRadius);
      return {
        y: d.bendRadius * (1 - Math.cos(phi)),
        z: d.bendRadius * Math.sin(phi),
        tilt: phi,
      };
    }
    default:
      return { y: 0, z: d.reach - back, tilt: 0 };
  }
}

/**
 * A 45° plane (in the print frame) just inside the fairing slice's upper rim
 * (+y): the boss is trimmed to the side of it toward the boss's axis, so the
 * hull's faces on that side are no steeper than 45°.
 * Null when the boss already lies there (straight and gently rising arms).
 */
export function fairingBevel(
  d: WallArmDerived,
): { normal: [number, number, number]; offset: number } | null {
  const c = centreLineAt(d, d.fairing);
  const hiY = c.y + d.rTube * Math.cos(c.tilt);
  const hiZ = c.z - d.rTube * Math.sin(c.tilt);
  // Keep z − y ≥ hiZ − hiY + a margin; the boss's corner furthest out is (yBoss1, zTip).
  const keep = hiZ - hiY + BEVEL_MARGIN * Math.SQRT2;
  if (d.zTip - d.yBoss1 >= keep) return null;
  return { normal: [0, -1, 1], offset: keep / Math.SQRT2 };
}

/** All derived dimensions. Pure, no WASM. */
export function deriveWallArm(p: WallArmParams): WallArmDerived {
  const bent = p.shape !== 'straight' && p.riseAngle >= MIN_RISE;
  const rise = bent ? Math.min(45, p.riseAngle) : 0;
  const shapeIndex = !bent ? 0 : p.shape === 'angled' ? 1 : 2;
  const th = rise * DEG;
  const rTube = p.tubeDiameter / 2;
  const rBore = p.boreDiameter / 2;
  const rBoss = Math.max((p.hubJoint.nominalDiameter + 2 * BOSS_WALL + BOSS_EXTRA) / 2, rTube + 1);
  const reach = p.length;
  let yEnd = 0;
  let bendRadius = 0;
  let centreLength = reach;
  if (shapeIndex === 1) {
    yEnd = reach * Math.tan(th);
    centreLength = reach / Math.cos(th);
  } else if (shapeIndex === 2) {
    bendRadius = reach / Math.sin(th);
    yEnd = bendRadius * (1 - Math.cos(th));
    centreLength = bendRadius * th;
  }
  // The boss: the thread from its bottom face up, then the tube's bore.
  const above = Math.max(rTube + 1, rBore + CABLE_GAP + 3.5);
  const yBoss1 = yEnd + above;
  const zTip = reach - rBoss * Math.SQRT2;
  const flangeRadius = p.flange.diameter / 2;
  const flangeThickness = p.flange.thickness;

  // The fairing: the hull of the boss and a slice of the tube far enough back
  // that the hull's faces from the slice's lower rim (−y) to the boss's
  // bottom face rise at 45° or steeper. (On the +y side the boss is bevelled
  // at 45° instead, see `fairingBevel`.) The boss reaches down past that rim,
  // so the hull (convex) never dips under the boss's bottom face, which sits
  // on the hub's mount face; the tube leaves it toward the wall at most at
  // its end tilt, so it clears the hub's 45° roof.
  const base = { shapeIndex, rise, reach, yEnd, bendRadius };
  const minBelow = p.hubJoint.length + BORE_ABOVE_THREAD + rBore;
  const maxBack = Math.max(rBoss * Math.SQRT2, centreLength - flangeThickness - rTube);
  /** The boss's depth under the centre line's end for a slice `back` mm back, and whether it prints. */
  const fit = (back: number) => {
    const c = centreLineAt(base, back);
    const loY = c.y - rTube * Math.cos(c.tilt);
    const loZ = c.z + rTube * Math.sin(c.tilt);
    const below = Math.max(minBelow, yEnd - loY + HUB_GAP);
    const rim = loY - (yEnd - below); // how far the rim sits above the boss's bottom
    return { below, ok: rim <= zTip - loZ - FAIR_MARGIN && loZ < zTip - FAIR_MARGIN };
  };
  let fairing = rBoss * Math.SQRT2 + FAIR_MARGIN;
  while (fairing < maxBack && !fit(fairing).ok) fairing += 0.25;
  fairing = Math.min(fairing, maxBack);
  const yBoss0 = yEnd - fit(fairing).below;

  const yMin = Math.min(-flangeRadius, yBoss0);
  const yMax = Math.max(flangeRadius, yBoss1);
  return {
    rise,
    shapeIndex,
    rTube,
    rBore,
    rBoss,
    reach,
    yEnd,
    bendRadius,
    centreLength,
    yBoss0,
    yBoss1,
    bossHeight: yBoss1 - yBoss0,
    zTip,
    fairing,
    flangeRadius,
    flangeThickness,
    yShift: -(yMin + yMax) / 2,
    halfWidth: Math.max(flangeRadius, rBoss),
    depth: yMax - yMin,
    height: reach + rBoss,
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function wallArmFootprint(p: WallArmParams): Footprint {
  const d = deriveWallArm(p);
  return { x: 2 * d.halfWidth, y: d.depth, z: d.height };
}

/**
 * Joint frame (z = the room's up, origin on the thread's mouth) → arm frame:
 * (x, y, z) → (−x, z, y) + mouth. Composed with the arm's own placement in
 * the room ((x, y, z) → (−x, z, y)) it is a pure translation, so the boss's
 * thread lines up with the hub's stub (column-major).
 */
function jointToArm(d: WallArmDerived): Parameters<Manifold['transform']>[0] {
  return [-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, d.yBoss0, d.reach, 1];
}

/** Largest gap between a curved arm's slices and its true arc, mm. */
const BEND_TOLERANCE: Readonly<Record<Quality, number>> = { draft: 0.1, normal: 0.05, fine: 0.025 };

/** Slices of a curved arm's torus sector (`revolve` takes them for the swept angle, not per turn). */
function bendSlices(
  d: Pick<WallArmDerived, 'bendRadius' | 'rTube'>,
  sweep: number,
  quality: Quality,
): number {
  const r = d.bendRadius + d.rTube;
  const step = 2 * Math.acos(Math.max(-1, 1 - BEND_TOLERANCE[quality] / r));
  return Math.max(2, Math.ceil((sweep * DEG) / step));
}

/**
 * A teardrop section: a circle of radius r with a 45° point `r·√2` from its
 * centre toward ±y. The caller owns the result.
 */
function teardrop(k: Kernel, r: number, segs: number, toward: 1 | -1): CrossSection {
  return scoped(k, (s) => {
    const circle = s.add(k.CrossSection.circle(r, segs));
    return s.keep(s.add(k.CrossSection.hull([circle, [[[0, toward * r * Math.SQRT2]]]])));
  });
}

/**
 * Build the arm.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildWallArm(
  k: Kernel,
  params: WallArmParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: WallArmStats } {
  return scoped(k, (s) => {
    const { Manifold, CrossSection } = k;
    const p = params;
    const d = deriveWallArm(p);
    const segs = QUALITY[quality].segments;
    const small = Math.max(32, segs / 4);
    const th = d.rise * DEG;
    const { rTube, rBore, reach } = d;

    // ---------------------------------------------------------------- body
    const flange = s.add(Manifold.cylinder(d.flangeThickness, d.flangeRadius, undefined, segs));
    /**
     * A tube of radius r along the centre line, from below the flange to
     * `back` mm before the boss axis.
     */
    const alongCentre = (r: number, n: number, back: number): Manifold => {
      if (d.shapeIndex === 2) {
        const sweep = d.rise - back / d.bendRadius / DEG;
        const section = s.add(s.add(CrossSection.circle(r, n)).translate([d.bendRadius, 0]));
        // Revolve: x → arm −y, y → arm +z, z → arm −x, about (0, R, 0).
        const torus = s.add(Manifold.revolve(section, bendSlices(d, sweep, quality), sweep));
        const placed = s.add(
          torus.transform([0, -1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, d.bendRadius, 0, 1]),
        );
        const stub = s.add(s.add(Manifold.cylinder(1, r, undefined, n)).translate([0, 0, -1]));
        return s.add(Manifold.union(placed, stub));
      }
      const below = r * Math.tan(th) + 1;
      const straight = s.add(
        s
          .add(Manifold.cylinder(d.centreLength - back + below, r, undefined, n))
          .translate([0, 0, -below]),
      );
      return th > 0 ? s.add(straight.rotate([-d.rise, 0, 0])) : straight;
    };
    // The tube ends just past the fairing's slice: the hull takes over from there.
    const tubeEnd = Math.max(0, d.fairing - TUBE_INTO_FAIRING);
    const tube = s.add(alongCentre(rTube, segs, tubeEnd).trimByPlane([0, 0, 1], 0));

    // The boss: a teardrop prism along y (pointing at the wall, −z), and the
    // fairing: its hull with a slice of the tube.
    const boss = s.add(
      s
        .add(s.add(s.add(teardrop(k, d.rBoss, segs, -1)).extrude(d.bossHeight)).rotate([90, 0, 0]))
        .translate([0, d.yBoss1, reach]),
    );
    // A curved tube's slices are chords inside the true arc: the fairing's
    // slice stays inside them (else its rim would show below the tube).
    const c = centreLineAt(d, d.fairing);
    const rSlice = d.shapeIndex === 2 ? rTube - BEND_TOLERANCE[quality] - 0.05 : rTube;
    const slice = s.add(
      s
        .add(
          s
            .add(Manifold.cylinder(SLICE, rSlice, undefined, segs, true))
            .rotate([-c.tilt / DEG, 0, 0]),
        )
        .translate([0, c.y, c.z]),
    );
    const bevel = fairingBevel(d);
    const bevelled = bevel ? s.add(boss.trimByPlane(bevel.normal, bevel.offset)) : boss;
    const fairing = s.add(Manifold.hull([bevelled, slice]));
    const body = s.add(Manifold.union([flange, tube, fairing]));

    // ---------------------------------------------------------------- cutters
    const cutters: Manifold[] = [];
    // The cable bore along the tube, from below the flange to the boss axis …
    cutters.push(s.add(alongCentre(rBore, small, 0)));
    // … then up in the boss (a teardrop pointing away from the wall, +z
    // here) from inside the thread's end to above the tube's bore.
    const L = p.hubJoint.length;
    const yBottom = d.yBoss0 + L;
    const yTop = d.yEnd + rBore + 0.5;
    cutters.push(
      s.add(
        s
          .add(
            s
              .add(s.add(teardrop(k, rBore + CABLE_GAP, small, 1)).extrude(yTop - yBottom))
              .rotate([90, 0, 0]),
          )
          .translate([0, yTop, reach]),
      ),
    );
    // The female thread and its countersink, from the boss's bottom face up.
    const toArm = jointToArm(d);
    for (const cutter of threadJoint.femaleCutters(k, p.hubJoint, {
      rCollar: p.hubJoint.nominalDiameter / 2,
      z: [0, L],
      segs,
      quality,
    })) {
      cutters.push(s.add(s.add(cutter).transform(toArm)));
    }
    // The flange's screws: through holes, counterbored from its front face.
    for (const m of screwPattern(k, p.plateScrews, 'male', {
      z: [0, d.flangeThickness],
      face: 'top',
      segs: small,
    })) {
      cutters.push(s.add(m));
    }
    const arm = s.add(Manifold.difference([body, ...cutters]));
    const result = s.add(arm.translate([0, d.yShift, 0]));

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: WallArmStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The teardrops, the countersink and the fairing are 45° (the thread's
      // crests across the horizontal bore aside); the tube leans by its rise.
      maxOverhangDeg: Math.max(45, d.rise),
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
