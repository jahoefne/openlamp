/**
 * The slatted (louvred) shade family: a bottom ring on the bed, `slatCount`
 * flat slats and a top ring whose 45° shoulder cone rises to the collar the
 * hub holds. Printed open end down, collar up, like the revolved shade:
 *
 *              ┃ ┃ collar (joint male side: lugs / ribs / thread)
 *            ══╋═╋══ zCollar: flat seat out to the hub ring's outer radius
 *            ▐▒▒▒▒▒▌  neck: solid crown under the seat, 45° underside
 *           ╱       ╲ 45° shoulder cone (the shade's wall)
 *          ▐█▌     ▐█▌ top ring (ringHeight), the slats' upper ends inside it
 *          ╱ ╱  ╱  ╱   slats: straight flat boards, `twist` around the axis
 *         ╱ ╱  ╱  ╱    from bottom to top, turned `louvreAngle` about their
 *        ▐█▌     ▐█▌   long axis; bottom ring (ringHeight) on the bed
 *
 * Every slat is one `Manifold.hull` of its two end rectangles (8 corners): the
 * lower one centred in the bottom ring at angle θ, the upper one in the top
 * ring at θ + twist, both turned the same way (the board's frame at
 * θ + twist / 2, turned by `louvreAngle`), so each slat is a flat board of
 * constant thickness. Its ends sit half a ring deep inside the rings (no
 * coplanar faces), each ring is as wide as the slat ends need plus a lip on
 * both sides. Rings, top profile and slats are joined in one batch `union`;
 * `collar.ts` adds the collar tube and the joint. Rings and collar use the
 * quality's circular segments; the slats are exact hulls. Part kind `shade`
 * (`variant: 'slatted'`).
 */
import type { Footprint, GeometryStats } from '../../../model/assembly.ts';
import type { SlattedShadeParams } from '../../../model/parts.ts';
import { scoped, type Kernel, type Manifold, type Vec2, type Vec3 } from '../../kernel.ts';
import { QUALITY, type Quality } from '../../quality.ts';
import { addCollar } from './collar.ts';

const DEG = Math.PI / 180;
/** Large enough to stand in for infinity in the profile booleans, mm. */
const FAR = 1e4;
/** Material around a slat's end inside its ring, on every side, mm. */
export const SLAT_RING_LIP = 0.8;
/** The most slats a shade is built with (the parameter's maximum), whatever its params say. */
export const MAX_SLAT_COUNT = 96;
/** The least gap between two neighbouring slats (at their inner faces), mm; fewer slats otherwise. */
export const MIN_SLAT_GAP = 1;
/** The steepest lean of a slat from vertical that prints without support, degrees. */
export const MAX_SLAT_LEAN = 50;
/** The longest bridge the top ring may span between two slats before an info, mm. */
export const SLAT_MAX_BRIDGE = 11;
/** Slope of the shoulder cone from the top ring to the seat (dz/dr = 1: 45°). */
const SHOULDER_SLOPE = 1;
/** The crown's underside starts this far below the shell's inner cone at the seat radius, mm. */
const CROWN_LIP = 0.3;
/** Thickness of the crown at the collar's bore, mm. */
const CROWN_MIN = 1;
/** Shortest neck between the shoulder cone and the seat, mm. */
const NECK_MIN = 1;
/** Points along a slat where the gap to its neighbours is measured. */
const GAP_SAMPLES = 32;

/** One slat end's footprint: how far its rectangle reaches across and along its ring. */
interface SlatEnd {
  /** Turn of the slat's width against the ring's tangent there, radians. */
  beta: number;
  /** Radial extent of the end rectangle. */
  radial: number;
  /** Tangential extent of the end rectangle. */
  tangential: number;
}

function slatEnd(p: SlattedShadeParams, beta: number): SlatEnd {
  const c = Math.abs(Math.cos(beta));
  const s = Math.abs(Math.sin(beta));
  return {
    beta,
    radial: p.slatWidth * s + p.slatThickness * c,
    tangential: p.slatWidth * c + p.slatThickness * s,
  };
}

/**
 * The radius of a slat end's centre in a ring of outer radius `r`, so that its
 * corners stay a lip inside the ring's outer face.
 */
function endCentreRadius(r: number, end: SlatEnd): number {
  const outer = r - SLAT_RING_LIP;
  return Math.sqrt(Math.max(0, outer * outer - (end.tangential / 2) ** 2)) - end.radial / 2;
}

/** Derived dimensions of the shade, in its print frame. */
export type SlattedShadeDerived = {
  rBot: number;
  rTop: number;
  H: number;
  ringHeight: number;
  /** The shoulder cone's wall. */
  t: number;
  /** Slats actually built (the parameter rounded, 1 … `MAX_SLAT_COUNT`). */
  slatCount: number;
  /** Centre radius of a slat's end in the bottom / top ring. */
  rcBot: number;
  rcTop: number;
  /** Inner radius of the bottom / top ring. */
  rBotInner: number;
  rTopInner: number;
  /** A slat's lower and upper end (half a ring deep inside each ring). */
  zSlat0: number;
  zSlat1: number;
  /** A slat's lean from vertical, degrees (its steepest overhang). */
  leanDeg: number;
  /** The narrowest gap between two neighbouring slats (at their inner faces), mm. */
  gapMin: number;
  /** The most slats that keep `MIN_SLAT_GAP` apart. */
  maxSlats: number;
  /** The gap the top ring bridges between two slats, mm. */
  bridge: number;
  /** Shoulder cones: outer z = kOuter − r, inner z = kInner − r. */
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

export interface SlattedShadeStats extends GeometryStats {
  derived: SlattedShadeDerived;
}

/**
 * Where a slat is between its ends (`s` 0 … 1, bottom to top) for the gap
 * check: its centre's radius, and how far its cross-section reaches across and
 * along the circle there. Slat 0 (θ = 0).
 */
function slatAt(
  p: SlattedShadeParams,
  rcBot: number,
  rcTop: number,
  s: number,
): { r: number; end: SlatEnd } {
  const tw = p.twist * DEG;
  const x = (1 - s) * rcBot + s * rcTop * Math.cos(tw);
  const y = s * rcTop * Math.sin(tw);
  const psi = Math.atan2(y, x);
  // The board's frame is at tw / 2, turned by the louvre angle.
  return { r: Math.hypot(x, y), end: slatEnd(p, p.louvreAngle * DEG + tw / 2 - psi) };
}

/** All derived dimensions. Pure, no WASM. */
export function deriveSlattedShade(p: SlattedShadeParams): SlattedShadeDerived {
  const rBot = p.bottomDiameter / 2;
  const rTop = p.topDiameter / 2;
  const H = p.height;
  const hr = p.ringHeight;
  const t = p.wallThickness;
  // Bounded whatever the params say (they come clamped from assemble(), but
  // the builder may be called directly): one hull per slat.
  const n = Number.isFinite(p.slatCount)
    ? Math.min(MAX_SLAT_COUNT, Math.max(1, Math.round(p.slatCount)))
    : 1;
  const tw = p.twist * DEG;
  const louvre = p.louvreAngle * DEG;
  const bottomEnd = slatEnd(p, louvre + tw / 2);
  const topEnd = slatEnd(p, louvre - tw / 2);
  const rcBot = endCentreRadius(rBot, bottomEnd);
  const rcTop = endCentreRadius(rTop, topEnd);
  const zSlat0 = hr / 2;
  const zSlat1 = H - hr / 2;
  const reach = Math.sqrt(rcBot * rcBot + rcTop * rcTop - 2 * rcBot * rcTop * Math.cos(tw));
  const leanDeg = Math.atan(reach / Math.max(1e-9, zSlat1 - zSlat0)) / DEG;

  let gapMin = Infinity;
  let maxSlats = Infinity;
  for (let i = 0; i <= GAP_SAMPLES; i++) {
    const { r, end } = slatAt(p, rcBot, rcTop, i / GAP_SAMPLES);
    const around = 2 * Math.PI * (r - end.radial / 2);
    gapMin = Math.min(gapMin, around / n - end.tangential);
    maxSlats = Math.min(maxSlats, Math.floor(around / (end.tangential + MIN_SLAT_GAP)));
  }
  const under = slatAt(p, rcBot, rcTop, (H - hr - zSlat0) / Math.max(1e-9, zSlat1 - zSlat0));
  const bridge = (2 * Math.PI * under.r) / n - under.end.tangential;

  // The top ring and its shoulder, as the revolved shade's (45°).
  const m = SHOULDER_SLOPE;
  const rCollar = p.collar.radius;
  const rCollarBore = rCollar - p.collar.wall;
  const rSeat = p.collar.seatRadius;
  const kOuter = H + m * rTop;
  const shellRise = t * Math.sqrt(1 + m * m);
  const kInner = kOuter - shellRise;
  const zNeck = kOuter - m * rSeat;
  const lip = shellRise + CROWN_LIP;
  const neckHeight = Math.max(NECK_MIN, rSeat - rCollarBore - lip + CROWN_MIN);
  const zCollar = zNeck + neckHeight;
  return {
    rBot,
    rTop,
    H,
    ringHeight: hr,
    t,
    slatCount: n,
    rcBot,
    rcTop,
    rBotInner: rcBot - bottomEnd.radial / 2 - SLAT_RING_LIP,
    rTopInner: rcTop - topEnd.radial / 2 - SLAT_RING_LIP,
    zSlat0,
    zSlat1,
    leanDeg,
    gapMin,
    maxSlats: Number.isFinite(maxSlats) ? Math.max(0, maxSlats) : 0,
    bridge,
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

/** The 8 corners of slat `i`: its lower end rectangle, then its upper one. Pure, no WASM. */
export function slatCorners(p: SlattedShadeParams, d: SlattedShadeDerived, i: number): Vec3[] {
  const theta = (2 * Math.PI * i) / d.slatCount;
  const tw = p.twist * DEG;
  // The board's frame: width along e1, thickness along e2.
  const phi = theta + tw / 2;
  const a = p.louvreAngle * DEG;
  const radial: Vec2 = [Math.cos(phi), Math.sin(phi)];
  const tangent: Vec2 = [-Math.sin(phi), Math.cos(phi)];
  // e1 = the tangent turned by the louvre angle (counter-clockwise seen from
  // above), e2 = e1 turned back a quarter (the radial direction at 0°).
  const e1: Vec2 = [
    Math.cos(a) * tangent[0] - Math.sin(a) * radial[0],
    Math.cos(a) * tangent[1] - Math.sin(a) * radial[1],
  ];
  const e2: Vec2 = [
    Math.sin(a) * tangent[0] + Math.cos(a) * radial[0],
    Math.sin(a) * tangent[1] + Math.cos(a) * radial[1],
  ];
  const hw = p.slatWidth / 2;
  const ht = p.slatThickness / 2;
  const corners: Vec3[] = [];
  const ends: [number, number, number][] = [
    [d.rcBot, theta, d.zSlat0],
    [d.rcTop, theta + tw, d.zSlat1],
  ];
  for (const [rc, angle, z] of ends) {
    const cx = rc * Math.cos(angle);
    const cy = rc * Math.sin(angle);
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      corners.push([cx + u * hw * e1[0] + v * ht * e2[0], cy + u * hw * e1[1] + v * ht * e2[1], z]);
    }
  }
  return corners;
}

/** Bed footprint (the bounding box) without building it. Pure, no WASM. */
export function slattedShadeFootprint(p: SlattedShadeParams): Footprint {
  const d = deriveSlattedShade(p);
  // The radius is convex, so a slat (a hull) reaches farthest at a corner.
  let r = Math.max(d.rBot, d.rTop, d.rSeat);
  for (const [x, y] of slatCorners(p, d, 0)) r = Math.max(r, Math.hypot(x, y));
  return { x: 2 * r, y: 2 * r, z: d.zTop };
}

/** The top ring with its shoulder, neck and crown (without the collar tube) in the (r, z) plane. */
function topProfile(k: Kernel, d: SlattedShadeDerived): Vec2[][] {
  const m = SHOULDER_SLOPE;
  const R = 2 * d.rTop + 100; // right of everything
  return scoped(k, (s) => {
    const { CrossSection } = k;
    const poly = (pts: Vec2[]) => s.add(new CrossSection([pts]));
    const envelope = poly([
      [0, d.H - d.ringHeight],
      [d.rTop, d.H - d.ringHeight],
      [d.rTop, d.H],
      [d.rSeat, d.zNeck],
      [d.rSeat, d.zCollar],
      [0, d.zCollar],
    ]);
    const insideRing = poly([
      [-1, -FAR],
      [d.rTopInner, -FAR],
      [d.rTopInner, FAR],
      [-1, FAR],
    ]);
    const belowCone = poly([
      [-1, -FAR],
      [R, -FAR],
      [R, d.kInner - m * R],
      [-1, d.kInner + m],
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
    const hollow = s.add(CrossSection.intersection([insideRing, belowCone, belowCrown]));
    const cavity = s.add(CrossSection.union(hollow, bore));
    return s.add(CrossSection.difference(envelope, cavity)).toPolygons();
  });
}

/**
 * Build the shade.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildSlattedShade(
  k: Kernel,
  params: SlattedShadeParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: SlattedShadeStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const d = deriveSlattedShade(p);
    const segs = QUALITY[quality].segments;

    const bottomRing = s.add(
      Manifold.revolve(
        [
          [
            [d.rBotInner, 0],
            [d.rBot, 0],
            [d.rBot, d.ringHeight],
            [d.rBotInner, d.ringHeight],
          ],
        ],
        segs,
      ),
    );
    const top = s.add(Manifold.revolve(topProfile(k, d), segs));
    const slats: Manifold[] = [];
    for (let i = 0; i < d.slatCount; i++) {
      slats.push(s.add(Manifold.hull(slatCorners(p, d, i))));
    }
    const body = s.add(Manifold.union([bottomRing, top, ...slats]));
    const result = s.add(
      addCollar(k, body, p.joint, { collar: p.collar, z0: d.zCollar, segs, quality }),
    );

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: SlattedShadeStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The shoulder, the crown's underside and the lugs are 45°; the slats lean.
      maxOverhangDeg: Math.max(d.leanDeg, 45),
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
