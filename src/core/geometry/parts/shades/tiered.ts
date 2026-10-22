/**
 * The tiered (PH-style) shade family's tiers (part kind `tier`, M3b): every
 * tier is the revolve of a curved shell from its inner, upper edge down and
 * out to its rim; the top tier ends in the collar the hub holds. In its print
 * frame a tier stands on its rim (the rim's mid-surface point at z 0), collar
 * or inner edge up, unless `flipped` (turned over onto its inner edge):
 *
 *            ┃ ┃ collar (joint male side), top tier only
 *          ══╋═╋══ zCollar: flat seat out to the hub ring's outer radius
 *          ▐▒▒▒▒▒▌ neck and crown under the seat (45° underside), as the
 *             ╲    revolved shade's; a lower tier ends in a cut square to
 *              ╲   the shell instead
 *            ○  ╲  the shell: `drop` tall from `rInner` to `rOuter`, bowed
 *                ╲ by `curve` (flatter inside, steeper toward the rim)
 *            ═════╲ the rim, cut flat on the bed
 *
 * The mid-surface is z(u) = drop · (1 − f(u)) at r = rInner + u · span, with
 * f(u) = (1 − c) · u + c · u² (c = `curve`, 0 a straight cone); the shell is
 * that curve offset by half the wall to either side along its normal, built
 * with 2D booleans like the revolved shade's profile. The spacer sockets (○)
 * are holes through the shell along the spacers' axes (perpendicular to the
 * shells, `spacerTiltDeg` from vertical toward the rim), centred where those
 * axes cross the mid-surface (`spacerSockets.above` / `below` radius).
 *
 * A thin shell overhangs the same either way up (every slope of one face has
 * a parallel one on the other), so only its features tell the two print
 * orientations apart: the top tier's seat would face down when turned over,
 * a lower tier prints the same both ways (the rim, with the wider bed contact,
 * goes down).
 */
import type { Footprint, GeometryStats } from '../../../model/assembly.ts';
import type { TierParams } from '../../../model/parts.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../../kernel.ts';
import { profileSteps, type RZ } from '../../profile.ts';
import { QUALITY, type Quality } from '../../quality.ts';
import { addCollar } from './collar.ts';

const DEG = Math.PI / 180;
/** Large enough to stand in for infinity in the profile booleans, mm. */
const FAR = 1e4;
/** The offset curves run on this far past both ends (along their tangents) for the booleans, mm. */
const EXTEND = 200;
/** The overhang a tier may have and print without supports, degrees from vertical. */
export const MAX_TIER_OVERHANG = 50;
/** The narrowest and the shortest shell the builder makes, whatever its params say, mm. */
const MIN_SPAN = 0.5;
const MIN_DROP = 0.1;
/** The crown's underside starts this far below the shell at the seat radius, mm (as the revolved shade's). */
const CROWN_LIP = 0.3;
/** Thickness of the crown at the collar's bore, mm. */
const CROWN_MIN = 1;
/** Shortest neck between the shell and the seat, mm. */
const NECK_MIN = 1;
/** A socket's bore runs on this far past the shell along its axis (a pin's length and its seat gap), mm. */
const SOCKET_REACH = 5;
/** Circular segments of the spacer sockets (and of the spacers' pins, so the two match vertex for vertex). */
export const SOCKET_SEGMENTS = { draft: 24, normal: 32, fine: 48 } as const satisfies Record<
  Quality,
  number
>;

/** f(u): the mid-surface's fall from the inner edge (0) to the rim (1). */
export function tierBend(curve: number, u: number): number {
  return (1 - curve) * u + curve * u * u;
}

/** f′(u). */
export function tierBendSlope(curve: number, u: number): number {
  return 1 - curve + 2 * curve * u;
}

/**
 * The angle of spacer `j` of the spacers between tier `gap + 1` and tier
 * `gap + 2` (gap 0 hangs tier 2 from tier 1), degrees: every other gap is
 * turned half a step, so the spacers of two gaps never line up.
 */
export function spacerAngleDeg(gap: number, j: number, count: number): number {
  return ((j + (gap % 2) / 2) * 360) / Math.max(1, count);
}

/** A tier's shell, cleaned up: what every function below works from. */
export interface TierShape {
  rIn: number;
  span: number;
  /** The shell's own height (`profile.drop`). */
  h: number;
  /** `curve`, 0 … 1. */
  c: number;
  /** Wall. */
  t: number;
}

/** Whether the tier carries the collar (the top tier with its collar and joint). */
export function isTopTier(p: TierParams): boolean {
  return p.role.top && p.collar !== undefined && p.joint !== undefined;
}

/** Whether it prints turned over (the top tier never does: its collar goes up). */
export function isFlippedTier(p: TierParams): boolean {
  return p.flipped && !isTopTier(p);
}

export function tierShape(p: TierParams): TierShape {
  const c = Number.isFinite(p.profile.curve) ? Math.min(1, Math.max(0, p.profile.curve)) : 0;
  return {
    rIn: p.profile.rInner,
    span: Math.max(MIN_SPAN, p.profile.rOuter - p.profile.rInner),
    h: Math.max(MIN_DROP, p.profile.drop),
    c,
    t: p.wallThickness,
  };
}

/** The mid-surface's height at radius `r` in the tier's (unflipped) print frame, its tangents beyond its ends. */
export function tierMidZ(s: TierShape, r: number): number {
  const u = (r - s.rIn) / s.span;
  if (u < 0) return s.h - s.h * tierBendSlope(s.c, 0) * u;
  if (u > 1) return -s.h * tierBendSlope(s.c, 1) * (u - 1);
  return s.h * (1 - tierBend(s.c, u));
}

/** How steeply the mid-surface falls outward at radius `r` (−dz/dr), its ends' beyond them. */
export function tierMidSlope(s: TierShape, r: number): number {
  const u = Math.min(1, Math.max(0, (r - s.rIn) / s.span));
  return (s.h / s.span) * tierBendSlope(s.c, u);
}

/** The shell's mid-surface and its two faces, sampled from the inner edge to the rim, in the unflipped print frame. */
export interface TierCurves {
  mid: RZ[];
  upper: RZ[];
  lower: RZ[];
}

/** The shell's curves at `quality`'s wall step. Pure, no WASM. */
export function tierCurves(p: TierParams, quality: Quality = p.quality): TierCurves {
  const s = tierShape(p);
  const n = profileSteps(Math.hypot(s.span, s.h), QUALITY[quality].wallStep, 16);
  const mid: RZ[] = [];
  const upper: RZ[] = [];
  const lower: RZ[] = [];
  for (let j = 0; j <= n; j++) {
    const u = j / n;
    const r = s.rIn + s.span * u;
    const z = s.h * (1 - tierBend(s.c, u));
    const k = (s.h / s.span) * tierBendSlope(s.c, u);
    const len = Math.hypot(k, 1);
    // The upward normal of a curve falling outward with slope k is (k, 1)/len.
    const nr = ((s.t / 2) * k) / len;
    const nz = s.t / 2 / len;
    mid.push([r, z]);
    upper.push([r + nr, z + nz]);
    lower.push([r - nr, z - nz]);
  }
  return { mid, upper, lower };
}

/** Derived dimensions of a tier (all numbers; the top tier's collar fields are 0 on the others). */
export type TierDerived = {
  rInner: number;
  rOuter: number;
  span: number;
  drop: number;
  curve: number;
  wall: number;
  /** The shell's chord slope (drop / span), and its slope at the inner edge and at the rim (dz/dr falling outward). */
  slope: number;
  slopeInner: number;
  slopeRim: number;
  /** Steepest overhang printed on its rim (as exported unflipped) and turned over, degrees from vertical. */
  overhangUp: number;
  overhangDown: number;
  /** The orientation it prints in (`flipped` or not). */
  overhang: number;
  /** Top tier: the collar and its seat (the collar plane), as the revolved shade's. */
  rCollar: number;
  rCollarBore: number;
  rSeat: number;
  zNeck: number;
  neckHeight: number;
  zCollar: number;
  zTop: number;
  crownK: number;
  /** Lowest and highest point in the unflipped print frame, and the largest radius. */
  zMin: number;
  zMax: number;
  rMax: number;
  /** Height as printed. */
  height: number;
};

export interface TierStats extends GeometryStats {
  derived: TierDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveTier(p: TierParams): TierDerived {
  const s = tierShape(p);
  const top = isTopTier(p);
  const flipped = isFlippedTier(p);
  const k = s.h / s.span;
  const k0 = k * tierBendSlope(s.c, 0);
  const k1 = k * tierBendSlope(s.c, 1);
  const half = s.t / 2;
  // The shell's steepest overhang is at its flattest slope, the inner edge's (c ≥ 0).
  const shell = 90 - Math.atan(Math.min(k0, k1)) / DEG;
  // The top tier's seat, lugs and crown are 45° collar-up; its seat would face down turned over.
  const overhangUp = top ? Math.max(shell, 45) : shell;
  const overhangDown = top ? 90 : shell;

  let rCollar = 0;
  let rCollarBore = 0;
  let rSeat = 0;
  let zNeck = 0;
  let neckHeight = 0;
  let zCollar = 0;
  let zTop = 0;
  let crownK = 0;
  if (top) {
    rCollar = p.collar!.radius;
    rCollarBore = rCollar - p.collar!.wall;
    rSeat = p.collar!.seatRadius;
    // The upper face at the inner edge, run on along its tangent to the seat radius.
    const len0 = Math.hypot(k0, 1);
    const u0r = s.rIn + (half * k0) / len0;
    const u0z = s.h + half / len0;
    zNeck = u0z + k0 * (u0r - rSeat);
    const lip = s.t * len0 + CROWN_LIP;
    neckHeight = Math.max(NECK_MIN, rSeat - rCollarBore - lip + CROWN_MIN);
    zCollar = zNeck + neckHeight;
    zTop = zCollar + p.joint!.length;
    crownK = zNeck - lip + rSeat;
  }
  const len1 = Math.hypot(k1, 1);
  const len0 = Math.hypot(k0, 1);
  const rOuter = s.rIn + s.span;
  // Unflipped: the rim cut flat at z 0 (the upper face meets the bed past the rim);
  // flipped: the rim cut square to the shell, the inner edge cut flat at the drop.
  const zMin = flipped ? -half / len1 : 0;
  const zMax = top ? zTop : flipped ? s.h : s.h + half / len0;
  const rRim = flipped ? rOuter + (half * k1) / len1 : rOuter + (half * len1) / Math.max(k1, 1e-6);
  const rMax = Math.max(rRim, top ? rSeat : 0);
  return {
    rInner: s.rIn,
    rOuter,
    span: s.span,
    drop: s.h,
    curve: s.c,
    wall: s.t,
    slope: k,
    slopeInner: k0,
    slopeRim: k1,
    overhangUp,
    overhangDown,
    overhang: flipped ? overhangDown : overhangUp,
    rCollar,
    rCollarBore,
    rSeat,
    zNeck,
    neckHeight,
    zCollar,
    zTop,
    crownK,
    zMin,
    zMax,
    rMax,
    height: zMax - zMin,
  };
}

/** Bed footprint (an upper bound of the bounding box) without building it. Pure, no WASM. */
export function tierFootprint(p: TierParams): Footprint {
  const d = deriveTier(p);
  return { x: 2 * d.rMax, y: 2 * d.rMax, z: d.height };
}

/** `curve` run on along its end tangents by `EXTEND` at both ends. */
function extended(curve: readonly RZ[], k0: number, k1: number): RZ[] {
  const first = curve[0]!;
  const last = curve[curve.length - 1]!;
  const t0 = Math.hypot(1, k0);
  const t1 = Math.hypot(1, k1);
  return [
    [first[0] - EXTEND / t0, first[1] + (EXTEND * k0) / t0],
    ...curve,
    [last[0] + EXTEND / t1, last[1] - (EXTEND * k1) / t1],
  ];
}

/** The region below a curve that runs outward (r increasing), counter-clockwise. */
function below(curve: readonly RZ[]): Vec2[] {
  const first = curve[0]!;
  const last = curve[curve.length - 1]!;
  return [[first[0], -FAR], [last[0], -FAR], ...[...curve].reverse()];
}

/**
 * The half-plane on one side of the line through `p` along the normal of a
 * curve with slope `k` there: toward the rim (`+1`) or toward the axis (`−1`).
 */
function sideOfNormal(p: RZ, k: number, toward: 1 | -1): Vec2[] {
  const len = Math.hypot(1, k);
  const T: Vec2 = [(toward * 1) / len, (toward * -k) / len];
  // The normal turned a quarter counter-clockwise from T, so the corners run counter-clockwise.
  const N: Vec2 = [-T[1], T[0]];
  const F = 2000;
  const at = (a: number, b: number): Vec2 => [
    p[0] + a * T[0] + b * N[0],
    p[1] + a * T[1] + b * N[1],
  ];
  return [at(0, -F), at(F, -F), at(F, F), at(0, F)];
}

const box = (r0: number, z0: number, r1: number, z1: number): Vec2[] => [
  [r0, z0],
  [r1, z0],
  [r1, z1],
  [r0, z1],
];

/** The tier's revolve profile (without the collar tube) in the (r, z) plane of the unflipped print frame. */
function tierProfile(k: Kernel, p: TierParams, d: TierDerived, quality: Quality): Vec2[][] {
  const s = tierShape(p);
  const curves = tierCurves(p, quality);
  return scoped(k, (sc) => {
    const { CrossSection } = k;
    const poly = (pts: Vec2[]) => sc.add(new CrossSection([pts]));
    const belowUpper = poly(below(extended(curves.upper, d.slopeInner, d.slopeRim)));
    const belowLower = poly(below(extended(curves.lower, d.slopeInner, d.slopeRim)));
    const first = curves.mid[0]!;
    const last = curves.mid[curves.mid.length - 1]!;
    let section;
    if (isTopTier(p)) {
      // As the slatted shade's top: everything below the upper face (and the
      // block inside the seat radius) up to the collar plane, minus what lies
      // below both the lower face and the crown's 45° underside, minus the bore.
      const R = 2 * d.rMax + 100;
      const envelope = sc.add(
        CrossSection.intersection(
          sc.add(CrossSection.union(belowUpper, poly(box(-1, -FAR, d.rSeat, d.zCollar)))),
          poly(box(0, 0, FAR, d.zCollar)),
        ),
      );
      const belowCrown = poly([
        [-1, -FAR],
        [R, -FAR],
        [R, FAR],
        [d.rSeat, FAR],
        [d.rSeat, d.crownK - d.rSeat],
        [-1, d.crownK + 1],
      ]);
      const hollow = sc.add(CrossSection.intersection(belowLower, belowCrown));
      const cavity = sc.add(CrossSection.union(hollow, poly(box(-1, -FAR, d.rCollarBore, FAR))));
      section = sc.add(CrossSection.difference(envelope, cavity));
    } else {
      const band = sc.add(CrossSection.difference(belowUpper, belowLower));
      const cuts = isFlippedTier(p)
        ? // On its inner edge: that end cut flat, the rim square to the shell.
          [poly(box(0, -FAR, FAR, s.h)), poly(sideOfNormal(last, d.slopeRim, -1))]
        : // On its rim: the rim cut flat on the bed, the inner edge square to the shell.
          [poly(box(0, 0, FAR, FAR)), poly(sideOfNormal(first, d.slopeInner, 1))];
      section = sc.add(CrossSection.intersection([band, ...cuts]));
    }
    return section.toPolygons();
  });
}

type Mat4 = Parameters<Manifold['transform']>[0];

/** Rotation by `tiltDeg` about y (toward +x), then by `phiDeg` about z, then a translation. */
function socketTransform(
  tiltDeg: number,
  phiDeg: number,
  at: readonly [number, number, number],
): Mat4 {
  const ct = Math.cos(tiltDeg * DEG);
  const st = Math.sin(tiltDeg * DEG);
  const cp = Math.cos(phiDeg * DEG);
  const sp = Math.sin(phiDeg * DEG);
  return [
    ct * cp,
    ct * sp,
    -st,
    0,
    -sp,
    cp,
    0,
    0,
    st * cp,
    st * sp,
    ct,
    0,
    at[0],
    at[1],
    at[2],
    1,
  ] as Mat4;
}

/**
 * The spacer sockets: for the spacers to the tier above (gap `index − 1`) and
 * below (gap `index`), holes through the shell along each spacer's axis,
 * centred on the mid-surface, turned like the spacer's pin (vertex for vertex).
 */
function socketCutters(k: Kernel, p: TierParams, quality: Quality): Manifold[] {
  const s = tierShape(p);
  const sockets = p.spacerSockets;
  const segs = SOCKET_SEGMENTS[quality];
  const r = sockets.diameter / 2;
  const out: Manifold[] = [];
  const sets: [number, { radius: number } | undefined, number][] = [
    [p.index - 1, sockets.above, p.spacerTiltDeg?.above ?? 0],
    [p.index, sockets.below, p.spacerTiltDeg?.below ?? 0],
  ];
  return scoped(k, (sc) => {
    for (const [gap, at, tilt] of sets) {
      if (!at || gap < 0) continue;
      const z = tierMidZ(s, at.radius);
      // Long enough along the axis to clear the shell under the whole bore and a pin's
      // run through it, however obliquely the axis meets the shell.
      const oblique =
        Math.min(80, Math.abs(Math.atan(tierMidSlope(s, at.radius)) / DEG - tilt)) * DEG;
      const half = s.t / 2 / Math.cos(oblique) + r * Math.tan(oblique) + SOCKET_REACH;
      const cyl = sc.add(k.Manifold.cylinder(2 * half, r, r, segs, true));
      for (let j = 0; j < sockets.count; j++) {
        const phi = spacerAngleDeg(gap, j, sockets.count);
        const c: [number, number, number] = [
          at.radius * Math.cos(phi * DEG),
          at.radius * Math.sin(phi * DEG),
          z,
        ];
        out.push(sc.keep(cyl.transform(socketTransform(tilt, phi, c))));
      }
    }
    return out;
  });
}

/**
 * Build one tier.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildTier(
  k: Kernel,
  params: TierParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: TierStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const d = deriveTier(p);
    const segs = QUALITY[quality].segments;

    let body = s.add(Manifold.revolve(tierProfile(k, p, d, quality), segs));
    const cutters = socketCutters(k, p, quality).map((c) => s.add(c));
    if (cutters.length > 0) {
      const holes = s.add(Manifold.union(cutters));
      body = s.swap(body, Manifold.difference(body, holes));
    }
    if (isTopTier(p)) {
      const withCollar = addCollar(k, body, p.joint!, {
        collar: p.collar!,
        z0: d.zCollar,
        segs,
        quality,
      });
      body = s.swap(body, withCollar);
    }
    if (isFlippedTier(p)) {
      // Turned over about x onto its inner edge: (x, y, z) → (x, −y, drop − z).
      const turned = s.add(body.rotate([180, 0, 0]));
      body = s.swap(body, turned.translate([0, 0, d.drop]));
    }

    const bb = body.boundingBox();
    const volume = body.volume();
    const stats: TierStats = {
      status: body.status(),
      triangles: body.numTri(),
      vertices: body.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The shell's flattest slope (the sockets' short bores through it are not counted).
      maxOverhangDeg: d.overhang,
      derived: d,
    };
    return { manifold: s.keep(body), stats };
  });
}
