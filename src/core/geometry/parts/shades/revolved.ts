/**
 * The revolved shade family: today's wall (sampled profile, inward offset,
 * radial surface warp) with its own shoulder cone, ending in a collar the hub
 * holds. Printed open end down, collar up:
 *
 *            ┃ ┃ collar (joint male side: lugs / ribs / thread)
 *          ══╋═╋══ zCollar: flat seat out to the hub ring's outer radius
 *          ▐▒▒▒▒▒▌  neck: solid crown under the seat, 45° underside
 *         ╱       ╲ the shade's own shoulder cone
 *        ╱  shade  ╲
 *       ╵───────────╵ open end on the bed
 *
 * The profile is built with 2D booleans: (outer envelope) − (inside the inner
 * wall ∩ below the inner cone ∩ below the crown's 45° underside) − (the bore),
 * which needs no special cases for flat or steep shades. Part kind `shade`
 * (`variant: 'revolved'`).
 */
import type { Footprint, GeometryStats } from '../../../model/assembly.ts';
import type { RevolvedShadeParams } from '../../../model/parts.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../../kernel.ts';
import {
  offsetProfile,
  profileSteps,
  sampleProfile,
  uniformSamples,
  type RZ,
} from '../../profile.ts';
import { circularSegments, QUALITY, type Quality } from '../../quality.ts';
import { radialWarp, smoothstep } from '../../surface.ts';
import { addCollar } from './collar.ts';

const DEG = Math.PI / 180;
/** Large enough to stand in for infinity in the profile booleans, mm. */
const FAR = 1e4;
/** The crown's underside starts this far below the shell's inner cone at the seat radius, mm. */
const CROWN_LIP = 0.3;
/** Thickness of the crown at the collar's bore, mm. */
const CROWN_MIN = 1;
/** Shortest neck between the shoulder cone and the seat, mm. */
const NECK_MIN = 1;

/** Derived dimensions of the shade, in its print frame. */
export type RevolvedShadeDerived = {
  rBot: number;
  rTop: number;
  H: number;
  t: number;
  /** Shoulder slope dz/dr; outer cone z = kOuter − m·r, inner z = kInner − m·r. */
  m: number;
  kOuter: number;
  kInner: number;
  rCollar: number;
  rCollarBore: number;
  rSeat: number;
  /** The outer cone reaches the seat radius here; the neck rises from it. */
  zNeck: number;
  neckHeight: number;
  /** The collar plane: the seat the hub ring stands on (world z 0 when assembled). */
  zCollar: number;
  /** Top of the collar. */
  zTop: number;
  /** The crown's 45° underside: z = crownK − r (for r ≤ rSeat). */
  crownK: number;
};

export interface RevolvedShadeStats extends GeometryStats {
  derived: RevolvedShadeDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveRevolvedShade(p: RevolvedShadeParams): RevolvedShadeDerived {
  const rBot = p.bottomDiameter / 2;
  const rTop = p.topDiameter / 2;
  const H = p.height;
  const t = p.wallThickness;
  const m = Math.tan(p.shoulderAngle * DEG);
  const rCollar = p.collar.radius;
  const rCollarBore = rCollar - p.collar.wall;
  const rSeat = p.collar.seatRadius;
  const kOuter = H + m * rTop;
  const shellRise = t * Math.sqrt(1 + m * m); // vertical thickness of the cone shell
  const kInner = kOuter - shellRise;
  const zNeck = kOuter - m * rSeat;
  // The crown's underside rises at 45° from just below the shell at the seat
  // radius and must stay CROWN_MIN below the seat at the collar's bore.
  const lip = shellRise + CROWN_LIP;
  const neckHeight = Math.max(NECK_MIN, rSeat - rCollarBore - lip + CROWN_MIN);
  const zCollar = zNeck + neckHeight;
  return {
    rBot,
    rTop,
    H,
    t,
    m,
    kOuter,
    kInner,
    rCollar,
    rCollarBore,
    rSeat,
    zNeck,
    neckHeight,
    zCollar,
    zTop: zCollar + p.joint.length,
    crownK: zNeck - lip + rSeat,
  };
}

/** Outer wall radius at u in [0, 1] (0 = bottom, 1 = shoulder): the classic shade's wall. */
function wallRadius(p: RevolvedShadeParams, d: RevolvedShadeDerived, u: number): number {
  const bulge = p.curve * 0.3 * d.rBot;
  return d.rBot + (d.rTop - d.rBot) * u + bulge * Math.sin(Math.PI * u);
}

/** How far the surface pattern fades out below the top of the wall, mm (as `buildRevolvedShade`). */
const fadeTop = (d: RevolvedShadeDerived) => Math.min(15, d.H * 0.25);

/**
 * How far the surface pattern moves the wall at height `z` of the print
 * frame: out (`out`, the ribs' crests, the facets' corners) and in (`in`, the
 * ribs' troughs; facets keep their flats), for a wall of radius `r`.
 */
function warpExtent(
  p: RevolvedShadeParams,
  d: RevolvedShadeDerived,
  z: number,
  r: number,
): { out: number; in: number } {
  const { style, ribDepth, patternCount } = p.surface;
  if (style === 'smooth' || z < 0 || z >= d.H) return { out: 0, in: 0 };
  const f = fadeTop(d);
  const a = z > d.H - f ? 1 - smoothstep(d.H - f, d.H, z) : 1;
  if (style === 'ribbed') return { out: (a * ribDepth) / 2, in: (a * ribDepth) / 2 };
  const n = Math.max(1, Math.round(patternCount));
  return { out: a * r * (1 / Math.cos(Math.PI / n) - 1), in: 0 };
}

/**
 * The shade's radii at a height of its print frame, for checks that need no
 * mesh (the clearance between an inner and an outer shade, the bulb's heat
 * zone). Pure, no WASM. Below the collar plane only (`0 ≤ z < zCollar`):
 *
 * - `outerAt(z)`: the outermost surface (the wall with its pattern's crests,
 *   the shoulder cone, the neck under the seat);
 * - `innerAt(z)`: where the material starts, seen from the axis (the inner
 *   wall with its pattern's troughs, the inner cone, the crown's underside,
 *   the collar's bore).
 */
export function revolvedShadeRadii(p: RevolvedShadeParams): {
  derived: RevolvedShadeDerived;
  outerAt(z: number): number;
  innerAt(z: number): number;
} {
  const d = deriveRevolvedShade(p);
  const us = uniformSamples(profileSteps(d.H, QUALITY[p.quality].wallStep));
  const outerWall = sampleProfile((u) => wallRadius(p, d, u), d.H, us);
  const { inner } = offsetProfile(outerWall, d.t);
  /** Linear interpolation of a bottom → top profile at z (clamped to its ends). */
  const at = (profile: readonly RZ[], z: number): number => {
    const first = profile[0]!;
    if (z <= first[1]) return first[0];
    for (let i = 1; i < profile.length; i++) {
      const b = profile[i]!;
      if (z <= b[1]) {
        const a = profile[i - 1]!;
        const s = (z - a[1]) / (b[1] - a[1] || 1e-9);
        return a[0] + (b[0] - a[0]) * s;
      }
    }
    return profile[profile.length - 1]![0];
  };
  return {
    derived: d,
    outerAt(z) {
      if (z <= d.H) {
        const r = at(outerWall, z);
        return r + warpExtent(p, d, z, r).out;
      }
      if (z <= d.zNeck) return (d.kOuter - z) / d.m;
      return d.rSeat;
    },
    innerAt(z) {
      let r = Math.min(at(inner, z), (d.kInner - z) / d.m);
      const crown = d.crownK - z;
      if (crown < d.rSeat) r = Math.min(r, crown);
      r = Math.max(r, d.rCollarBore);
      return r - warpExtent(p, d, z, r).in;
    },
  };
}

/** Bed footprint (an upper bound of the bounding box) without building it. Pure, no WASM. */
export function revolvedShadeFootprint(p: RevolvedShadeParams): Footprint {
  const d = deriveRevolvedShade(p);
  let rMax = 0;
  for (const u of uniformSamples(128)) rMax = Math.max(rMax, wallRadius(p, d, u));
  const { style, ribDepth, patternCount } = p.surface;
  if (style === 'ribbed') rMax += ribDepth / 2;
  else if (style === 'faceted') rMax /= Math.cos(Math.PI / Math.max(1, Math.round(patternCount)));
  const r = Math.max(rMax, d.rSeat);
  return { x: 2 * r, y: 2 * r, z: d.zTop };
}

/** The body's revolve profile (without the collar tube) as polygons in the (r, z) plane. */
function shadeProfile(
  k: Kernel,
  p: RevolvedShadeParams,
  d: RevolvedShadeDerived,
  wallStep: number,
): { polygons: Vec2[][]; maxOverhangDeg: number } {
  const us = uniformSamples(profileSteps(d.H, wallStep));
  const outer = sampleProfile((u) => wallRadius(p, d, u), d.H, us);
  const { inner, maxOverhangDeg } = offsetProfile(outer, d.t);
  const first = inner[0]!;
  const last = inner[inner.length - 1]!;
  const R = 2 * (d.rBot + d.rTop) + 100; // right of everything
  const polygons = scoped(k, (s) => {
    const { CrossSection } = k;
    const poly = (pts: readonly RZ[]) =>
      s.add(new CrossSection([pts.map((q): Vec2 => [q[0], q[1]])]));
    const envelope = poly([
      [0, 0],
      ...outer,
      [d.rSeat, d.zNeck],
      [d.rSeat, d.zCollar],
      [0, d.zCollar],
    ]);
    const insideWall = poly([[-1, -1], [first[0], -1], ...inner, [last[0], FAR], [-1, FAR]]);
    const belowCone = poly([
      [-1, -FAR],
      [R, -FAR],
      [R, d.kInner - d.m * R],
      [-1, d.kInner + d.m],
    ]);
    const belowCrown = poly([
      [-1, -FAR],
      [R, -FAR],
      [R, FAR],
      [d.rSeat, FAR],
      [d.rSeat, d.crownK - d.rSeat],
      [-1, d.crownK + 1],
    ]);
    const bore = poly([
      [-1, -FAR],
      [d.rCollarBore, -FAR],
      [d.rCollarBore, FAR],
      [-1, FAR],
    ]);
    const hollow = s.add(CrossSection.intersection([insideWall, belowCone, belowCrown]));
    const cavity = s.add(CrossSection.union(hollow, bore));
    return s.add(CrossSection.difference(envelope, cavity)).toPolygons();
  });
  return { polygons, maxOverhangDeg };
}

/**
 * Build the shade.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildRevolvedShade(
  k: Kernel,
  params: RevolvedShadeParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: RevolvedShadeStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const d = deriveRevolvedShade(p);
    const q = QUALITY[quality];
    const segs = circularSegments(quality, p.surface);

    const { polygons, maxOverhangDeg } = shadeProfile(k, p, d, q.wallStep);
    let body = s.add(Manifold.revolve(polygons, segs));
    const warp = radialWarp({
      style: p.surface.style,
      count: p.surface.patternCount,
      depth: p.surface.ribDepth,
      twistDeg: p.surface.twist,
      zRange: [0, d.H],
      fade: { top: fadeTop(d) },
    });
    if (warp) body = s.swap(body, body.warp(warp));

    const result = s.add(
      addCollar(k, body, p.joint, { collar: p.collar, z0: d.zCollar, segs, quality }),
    );

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: RevolvedShadeStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The crown's underside and the lugs are 45°; the cone is 90° − angle.
      maxOverhangDeg: Math.max(maxOverhangDeg, 90 - p.shoulderAngle, 45),
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
