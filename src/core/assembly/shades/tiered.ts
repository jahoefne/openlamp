/**
 * The tiered (PH-style) family (M3b): `tiers` curved shells (part kind
 * `tier`, `geometry/parts/shades/tiered.ts`), the top one carrying the
 * collar, the others hanging below it on spacers (part kind `spacer`,
 * `geometry/parts/spacer.ts`). Pure, no WASM.
 *
 * Layout (the shade frame: collar plane at z 0, the tiers below it):
 *
 * - tier i's rim radius runs evenly from `topDiameter / 2` (i = 0) to
 *   `bottomDiameter / 2` (the last), `step` apart; the top tier starts at the
 *   collar's seat, every other one `overlap` inside the rim of the tier above
 *   (`rIn(i+1) = rOut(i) − overlap`), so it reaches in under it;
 * - every tier has the same slope (its drop over its width): the steepest
 *   that leaves the spacers `SPACER_TARGET` mm between two tiers when their
 *   rims are `tierDrop` apart (`slope·step + gap(slope) = tierDrop`), so a
 *   larger drop or a smaller step makes steeper tiers; `curve` bows each shell
 *   (flatter inside, steeper at the rim);
 * - tier i+1 hangs so that the mid-surfaces are `tierDrop − slope·step` apart
 *   (vertically) halfway across the overlap: two tiers of the same width
 *   are then exactly `tierDrop` apart rim to rim;
 * - `spacers` rods per gap stand there, square to both shells (the bisector
 *   of their normals) where that keeps both sockets inside the overlap, else
 *   more upright; their end faces sit on the tiers' faces, their pins go
 *   through sockets bored along their axes; every other gap is turned half a
 *   step. The spacers of a gap are one part (`<id>-spacer1` …, "Spacer 1 ×3")
 *   with `instances = spacers` and one transform per copy
 *   (`ShadePart.instanceTransforms`, turned about the lamp's axis), each pin
 *   a `snap` joint with its tier (radial clearance `joints.tolerance / 2`:
 *   Ø4.3 sockets for the Ø4 pins at the default 0.3).
 *
 * Every tier prints the way up its overhang analysis prefers (`flipped`):
 * the top tier collar up, the others on their rims (a shell overhangs the
 * same either way up; the rim gives the wider bed contact).
 *
 * Rules (`normalize`, adjusting): the overlap is at least the sockets' room
 * (`minTierOverlap`), at most what the top tier leaves outside its collar's
 * seat (the top tier widened when even the least overlap does not fit); the
 * bottom tier at least as wide as the top one. Checks (`validate`): the light
 * seen directly between two tiers (line of sight from the light's centre,
 * from the horizontal down to the bottom tier's inner edge; steeper rays leave
 * through the open bottom, as with any open pendant), tiers too flat to print
 * either way up, spacers shorter than 6 mm; tiers that touch or leave no room
 * for a rod are an error.
 */
import {
  MAX_TIER_OVERHANG,
  deriveTier,
  spacerAngleDeg,
  tierCurves,
  tierFootprint,
  tierMidSlope,
  tierMidZ,
  tierShape,
  type TierDerived,
  type TierShape,
} from '../../geometry/parts/shades/tiered.ts';
import { deriveSpacer, spacerFootprint } from '../../geometry/parts/spacer.ts';
import type { RZ } from '../../geometry/profile.ts';
import type { JointInterface, Mat4, Warning } from '../../model/assembly.ts';
import type { SpacerParams, TierParams } from '../../model/parts.ts';
import type { LightSource, TieredStyle } from '../../model/project.ts';
import { compose, flipX, translation } from '../transforms.ts';
import { clampShadeStyle, shadePartColour, shadePartId, whole } from './common.ts';
import { SHADE_PRINT_NOTES } from './revolved.ts';
import type { ShadeCtx, ShadeModule, ShadePart, ShadeProfile } from './types.ts';

const DEG = Math.PI / 180;

/** The spacers' rod and pins, mm. */
export const SPACER_ROD_DIAMETER = 5;
export const SPACER_PIN_DIAMETER = 4;
export const SPACER_PIN_LENGTH = 3;
/** The rod length the tiers' slope is chosen for, mm. */
export const SPACER_TARGET = 8;
/** Shorter spacers get a warning, mm. */
export const MIN_SPACER_LENGTH = 6;
/** The rod's end faces stay this far off the tiers' faces (plus their curvature under the rod), mm. */
const SPACER_SEAT_GAP = 0.15;
/** Material left between a socket and the edge of the overlap, mm. */
const SOCKET_EDGE = 1;
/** The top tier's overlap starts at least this far outside its collar's seat, mm. */
const SEAT_CLEARANCE = 1;
/** Two tiers closer than this anywhere (vertically) touch: an error, mm. */
export const MIN_TIER_CLEARANCE = 0.4;
/** A rod shorter than this between two tiers leaves no room for a spacer: an error, mm. */
const MIN_ROD_LENGTH = 1;
/** The tiers' slope stays between these (≈ 3° … 75°). */
const SLOPE_MIN = 0.05;
const SLOPE_MAX = Math.tan(75 * DEG);
/** A gap in the line of sight narrower than this is noise, degrees. */
const SIGHT_EPS = 0.05;
/** The crown's thickness at the collar's bore (the revolved shade's `CROWN_MIN`), mm. */
const CROWN_AT_BORE = 1;
/** How far a revolve's facets fall inside it, per mm of radius, at the coarsest quality. */
const FACET_SAG = 1 - Math.cos(Math.PI / 128);
/** Points of a spacer's end face (its rim, half way in, its centre) checked against the tiers, mm. */
const END_SAMPLES: readonly (readonly [number, number])[] = [
  [0, 0],
  ...Array.from({ length: 24 }, (_, i): [number, number] => {
    const r = ((i % 3) + 1) * (SPACER_ROD_DIAMETER / 6);
    const a = (i * Math.PI) / 4;
    return [r * Math.cos(a), r * Math.sin(a)];
  }),
];

const mm = (n: number) => (Math.round(n * 10) / 10).toString();
const deg = (n: number) => Math.round(n).toString();

/** The project path of a style field of the shade, e.g. `shades.0.style.overlap`. */
const stylePath = (ctx: Pick<ShadeCtx, 'role'>, field: string) =>
  `shades.${ctx.role === 'inner' ? 1 : 0}.style.${field}`;

/** The least overlap that leaves the spacer sockets `SOCKET_EDGE` of material on both sides (0.5 mm steps). */
export function minTierOverlap(tolerance: number): number {
  const hole = SPACER_PIN_DIAMETER + tolerance;
  return Math.ceil((hole + 2 * SOCKET_EDGE) * 2) / 2;
}

/**
 * The tiers' common slope (drop over width): the steepest whose spacer gap
 * (`SPACER_TARGET` of rod plus the walls and seat gaps, measured square to the
 * shells) still fits when the rims are `drop` apart and `step` apart
 * radially: `slope·step + gap·√(1 + slope²) = drop`, within 3° … 75°.
 */
export function tierSlope(drop: number, step: number, wall: number): number {
  const gap = SPACER_TARGET + wall + 2 * SPACER_SEAT_GAP;
  const f = (k: number) => k * step + gap * Math.hypot(1, k) - drop;
  if (f(SLOPE_MIN) >= 0) return SLOPE_MIN;
  if (f(SLOPE_MAX) <= 0) return SLOPE_MAX;
  let lo = SLOPE_MIN;
  let hi = SLOPE_MAX;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The centre of the light in the shade frame (on the axis): a bulb's glass, else the light face. */
function lightCentreZ(light: LightSource): number {
  return light.kind === 'bulb' ? -(light.bulbLength - light.bulbDiameter / 2) : 0;
}

/** Height of a bottom → top (r increasing) polyline at `r`, its end segments run on beyond it. */
function curveZ(curve: readonly RZ[], r: number): number {
  const n = curve.length - 1;
  let i = 0;
  while (i < n - 1 && curve[i + 1]![0] < r) i++;
  const a = curve[i]!;
  const b = curve[i + 1]!;
  return a[1] + ((b[1] - a[1]) * (r - a[0])) / (b[0] - a[0] || 1e-9);
}

/** The radius where a polyline falling outward passes height `z`, if it does. */
function curveR(curve: readonly RZ[], z: number): number | undefined {
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i]!;
    const b = curve[i + 1]!;
    if ((a[1] - z) * (b[1] - z) <= 0 && a[1] !== b[1]) {
      return a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]);
    }
  }
  return undefined;
}

/** Where along `p(s) = m + s·a` (s from s0 to s1) `side(s)` changes sign (bisection), or undefined. */
function crossing(side: (s: number) => number, s0: number, s1: number): number | undefined {
  let f0 = side(s0);
  if (f0 === 0) return s0;
  if (f0 * side(s1) > 0) return undefined;
  let a = s0;
  let b = s1;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    const fm = side(m);
    if (f0 * fm <= 0) b = m;
    else {
      a = m;
      f0 = fm;
    }
  }
  return (a + b) / 2;
}

/** One tier, placed. */
interface PlacedTier {
  index: number;
  id: string;
  params: TierParams;
  derived: TierDerived;
  /** Shade-frame z of the tier's unflipped print frame origin (its rim's mid-surface point). */
  z: number;
  /** Its faces in the shade frame, inner edge → rim. */
  upper: RZ[];
  lower: RZ[];
  /** Its transform from its print frame into the shade frame. */
  transform: Mat4;
}

/** The spacers between tier `gap + 1` and tier `gap + 2`. */
interface PlacedGap {
  gap: number;
  /** The axis direction in the (r, z) half-plane (up and outward), and its tilt from vertical, degrees. */
  axis: RZ;
  tiltDeg: number;
  /** Where the axis crosses the upper and the lower tier's mid-surface (their socket centres). */
  upperRadius: number;
  lowerRadius: number;
  params: SpacerParams;
  /** The spacer frame's origin (the bottom pin's end) in the (r, z) half-plane of the shade frame. */
  origin: RZ;
  /** The least vertical clearance between the two tiers anywhere over the overlap, mm. */
  clearance: number;
}

interface TieredLayout {
  tiers: PlacedTier[];
  gaps: PlacedGap[];
  zCollar: number;
  zBottom: number;
}

const tierId = (ctx: Pick<ShadeCtx, 'id'>, i: number) =>
  i === 0 ? ctx.id : shadePartId(ctx.id, `tier${i + 1}`);
/** The spacers between tier `gap + 1` and tier `gap + 2`: one part, a copy per socket. */
const spacerId = (ctx: Pick<ShadeCtx, 'id'>, gap: number) =>
  shadePartId(ctx.id, `spacer${gap + 1}`);

/** The tiers and spacers of a (normalised) tiered shade. Pure, no WASM. */
function tieredLayout(ctx: ShadeCtx<'tiered'>): TieredLayout {
  const st = ctx.style;
  const n = Math.max(2, whole(st.tiers));
  const spacers = Math.min(4, Math.max(3, whole(st.spacers)));
  const rTop = st.topDiameter / 2;
  const rBot = Math.max(rTop, st.bottomDiameter / 2);
  const step = (rBot - rTop) / (n - 1);
  const o = st.overlap;
  const drop = st.tierDrop;
  const t = ctx.wallThickness;
  const slope = tierSlope(drop, step, t);
  const tolerance = ctx.joints.tolerance / 2;
  const socket = SPACER_PIN_DIAMETER + 2 * tolerance;
  const rOut = (i: number) => rTop + i * step;
  const rIn = (i: number) => (i === 0 ? ctx.collar.seatRadius : rOut(i - 1) - o);

  // The tiers' shapes (no sockets yet), each the way up it overhangs least.
  const shapes = Array.from({ length: n }, (_, i): TierParams => {
    const top = i === 0;
    const span = rOut(i) - rIn(i);
    return {
      index: i,
      count: n,
      profile: { rInner: rIn(i), rOuter: rOut(i), drop: slope * span, curve: st.curve },
      wallThickness: t,
      role: { top, bottom: i === n - 1 },
      flipped: false,
      spacerSockets: { count: spacers, diameter: socket },
      ...(top ? { collar: ctx.collar, joint: ctx.joint } : {}),
      quality: ctx.quality,
    };
  });
  for (const p of shapes) {
    const d = deriveTier(p);
    p.flipped = d.overhangDown < d.overhangUp - 1e-6;
  }

  // Hang them: tier i+1's mid-surface `drop − slope·step` below tier i's halfway across the overlap.
  const gapV = drop - slope * step;
  const zs: number[] = [-deriveTier(shapes[0]!).zCollar];
  for (let i = 0; i + 1 < n; i++) {
    const r = rOut(i) - o / 2;
    const a = tierShape(shapes[i]!);
    const b = tierShape(shapes[i + 1]!);
    zs.push(zs[i]! + tierMidZ(a, r) - gapV - tierMidZ(b, r));
  }
  const curves = shapes.map((p, i) => {
    const c = tierCurves(p);
    const shift = (pts: RZ[]) => pts.map(([r, z]): RZ => [r, z + zs[i]!]);
    return { upper: shift(c.upper), lower: shift(c.lower) };
  });

  // The spacers of each gap.
  const gaps: PlacedGap[] = [];
  for (let g = 0; g + 1 < n; g++) {
    const A = tierShape(shapes[g]!);
    const B = tierShape(shapes[g + 1]!);
    const za = zs[g]!;
    const zb = zs[g + 1]!;
    const lowerFace = curves[g]!.lower;
    const upperFace = curves[g + 1]!.upper;
    const rs = rOut(g) - o / 2;
    const midA = (r: number) => za + tierMidZ(A, r);
    const midB = (r: number) => zb + tierMidZ(B, r);
    // Square to both shells: the bisector of their upward normals halfway across the overlap.
    const ka = tierMidSlope(A, rs);
    const kb = tierMidSlope(B, rs);
    const na: RZ = [ka / Math.hypot(ka, 1), 1 / Math.hypot(ka, 1)];
    const nb: RZ = [kb / Math.hypot(kb, 1), 1 / Math.hypot(kb, 1)];
    const lean = (na[0] + nb[0]) / (na[1] + nb[1]);
    // The axis meets tier A `shift` outside and tier B `shift` inside the middle of the overlap;
    // their sockets must stay inside it (steep shells far apart get a more upright axis).
    const room = Math.max(0, o / 2 - socket / 2 - SOCKET_EDGE);
    // (The axis through both crossings leans `lean`: solve for the shift; it grows with it.)
    const off = (d: number) => d - (lean * (midA(rs + d) - midB(rs - d))) / 2;
    const shift =
      off(room) <= 0 ? room : off(-room) >= 0 ? -room : (crossing(off, -room, room) ?? 0);
    const pa: RZ = [rs + shift, midA(rs + shift)];
    const pb: RZ = [rs - shift, midB(rs - shift)];
    const half = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / 2;
    const axis: RZ = [(pa[0] - pb[0]) / (2 * half), (pa[1] - pb[1]) / (2 * half)];
    const ex: RZ = [axis[1], -axis[0]];
    const m: RZ = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    const at = (s: number): RZ => [m[0] + s * axis[0], m[1] + s * axis[1]];
    const reach = half + 2 * t;
    const sTop = crossing((s) => at(s)[1] - curveZ(lowerFace, at(s)[0]), 0, reach) ?? half;
    const sBot = crossing((s) => at(s)[1] - curveZ(upperFace, at(s)[0]), 0, -reach) ?? -half;
    // The end faces: tangent to the tiers' faces where the axis meets them, moved back along
    // the axis until no point of the rod's end (its rim, half way in, the axis) reaches into
    // the tier's face (its facets included).
    const endFace = (shape: TierShape, face: readonly RZ[], sFace: number, dir: 1 | -1) => {
      const k = tierMidSlope(shape, at(sFace)[0]);
      const nrm: RZ = [k / Math.hypot(k, 1), 1 / Math.hypot(k, 1)];
      const slope = (nrm[0] * ex[0] + nrm[1] * ex[1]) / (nrm[0] * axis[0] + nrm[1] * axis[1]);
      const reaches = (gap: number) =>
        END_SAMPLES.some(([x, y]) => {
          const c = at(sFace - dir * gap);
          const r = Math.hypot(c[0] + x * (ex[0] - slope * axis[0]), y);
          const z = c[1] + x * (ex[1] - slope * axis[1]);
          const margin = 0.05 + r * FACET_SAG * tierMidSlope(shape, r);
          return dir * (z - curveZ(face, r)) > -margin;
        });
      let lo = SPACER_SEAT_GAP;
      let hi = lo;
      while (reaches(hi) && hi < 50) hi = 2 * hi + 1;
      if (reaches(lo)) {
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          if (reaches(mid)) lo = mid;
          else hi = mid;
        }
        lo = hi;
      }
      return { slope, s: sFace - dir * lo };
    };
    const topFace = endFace(A, lowerFace, sTop, 1);
    const bottomFace = endFace(B, upperFace, sBot, -1);
    const sRodTop = topFace.s;
    const sRodBottom = bottomFace.s;
    const params: SpacerParams = {
      diameter: SPACER_ROD_DIAMETER,
      length: sRodTop - sRodBottom,
      pin: { diameter: SPACER_PIN_DIAMETER, length: SPACER_PIN_LENGTH },
      quality: ctx.quality,
      endSlopes: { top: topFace.slope, bottom: bottomFace.slope },
    };
    const origin = at(sRodBottom - deriveSpacer(params).pinBottom);

    // The least vertical clearance over the overlap (and under the upper tier's rim).
    const da = deriveTier(shapes[g]!);
    let clearance = Infinity;
    const r0 = rIn(g + 1);
    for (let j = 0; j <= 40; j++) {
      const r = r0 + ((da.rMax - r0) * j) / 40;
      const bottomOfA = Math.max(curveZ(lowerFace, r), za + da.zMin);
      clearance = Math.min(clearance, bottomOfA - curveZ(upperFace, r));
    }
    gaps.push({
      gap: g,
      axis,
      tiltDeg: Math.atan2(axis[0], axis[1]) / DEG,
      upperRadius: pa[0],
      lowerRadius: pb[0],
      params,
      origin,
      clearance,
    });
  }

  // The sockets, and every tier's transform into the shade frame.
  const tiers = shapes.map((p, i): PlacedTier => {
    const above = gaps[i - 1];
    const below = gaps[i];
    const params: TierParams = {
      ...p,
      spacerSockets: {
        count: spacers,
        diameter: socket,
        ...(above ? { above: { radius: above.lowerRadius } } : {}),
        ...(below ? { below: { radius: below.upperRadius } } : {}),
      },
      spacerTiltDeg: {
        ...(above ? { above: above.tiltDeg } : {}),
        ...(below ? { below: below.tiltDeg } : {}),
      },
    };
    const derived = deriveTier(params);
    const z = zs[i]!;
    const transform =
      params.flipped && i > 0
        ? compose(translation(0, 0, z + derived.drop), flipX())
        : translation(0, 0, z);
    return {
      index: i,
      id: tierId(ctx, i),
      params,
      derived,
      z,
      upper: curves[i]!.upper,
      lower: curves[i]!.lower,
      transform,
    };
  });
  const zBottom = Math.min(
    ...tiers.map((tier) => tier.z + tier.derived.zMin),
    ...gaps.map((g) => g.origin[1]),
  );
  return { tiers, gaps, zCollar: tiers[0]!.derived.zCollar, zBottom };
}

/** A spacer's transform: its axis along the gap's, turned to `phi` about the lamp's axis. */
function spacerTransform(g: PlacedGap, phiDeg: number): Mat4 {
  const c = Math.cos(phiDeg * DEG);
  const s = Math.sin(phiDeg * DEG);
  const [ar, az] = g.axis;
  // The spacer's x: square to its axis, outward and down; its y: around the lamp's axis.
  const xr = az;
  const xz = -ar;
  const [or, oz] = g.origin;
  return [xr * c, xr * s, xz, 0, -s, c, 0, 0, ar * c, ar * s, az, 0, or * c, or * s, oz, 1];
}

/** Where the light can be seen directly: the uncovered ranges of angles below the horizontal. */
function lineOfSight(
  layout: TieredLayout,
  light: LightSource,
): { from: number; to: number; above: number; below: number }[] {
  const zs = lightCentreZ(light);
  const angle = ([r, z]: RZ) => Math.atan2(zs - z, Math.max(r, 1e-9)) / DEG;
  const intervals = layout.tiers.map((tier, i) => {
    const pts = [...tier.upper, ...tier.lower];
    if (i === 0) {
      const d = tier.derived;
      const zc = tier.z + d.zCollar;
      pts.push([d.rCollarBore, zc], [d.rSeat, zc], [d.rCollarBore, zc - CROWN_AT_BORE]);
    }
    const as = pts.map(angle);
    return { tier: i, lo: Math.min(...as), hi: Math.max(...as) };
  });
  // Rays steeper than the bottom tier's steepest point leave through the open bottom.
  const open = intervals[intervals.length - 1]!.hi;
  if (open <= 0) return [];
  const sorted = [...intervals].sort((a, b) => a.lo - b.lo);
  const gaps: { from: number; to: number; above: number; below: number }[] = [];
  let reach = 0;
  let reachTier = -1;
  for (const iv of sorted) {
    if (iv.hi <= reach) continue;
    if (iv.lo > reach + SIGHT_EPS && reach < open) {
      gaps.push({ from: reach, to: Math.min(iv.lo, open), above: reachTier, below: iv.tier });
    }
    if (iv.hi > reach) {
      reach = iv.hi;
      reachTier = iv.tier;
    }
  }
  if (reach < open - SIGHT_EPS) gaps.push({ from: reach, to: open, above: reachTier, below: -1 });
  return gaps.filter((g) => g.to - g.from > SIGHT_EPS);
}

/** How a tier prints: the way up, and whether it needs supports. */
function tierPrintNotes(tier: PlacedTier): string[] {
  const way =
    tier.index === 0
      ? 'rim on the bed, collar up'
      : tier.params.flipped
        ? 'turned over, inner edge on the bed, rim up (it overhangs less that way)'
        : 'rim on the bed, inner edge up';
  const supports =
    tier.derived.overhang > MAX_TIER_OVERHANG
      ? `It is flatter than ${90 - MAX_TIER_OVERHANG}° and needs supports under it (a larger tier drop or more tiers make it steeper).`
      : 'No supports needed.';
  return [`Print as exported: ${way}. ${supports}`, SHADE_PRINT_NOTES[1]!];
}

const tierName = (ctx: Pick<ShadeCtx, 'role'>, i: number) =>
  `${ctx.role === 'inner' ? 'Inner tier' : 'Tier'} ${i + 1}`;
/** "Spacer 1 ×3": the gap's number and how many copies print (as the stem's segments). */
const spacerName = (ctx: Pick<ShadeCtx, 'role'>, gap: number, count: number) =>
  `${ctx.role === 'inner' ? 'Inner spacer' : 'Spacer'} ${gap + 1} ×${count}`;

export const tieredShade: ShadeModule<'tiered'> = {
  family: 'tiered',
  partKinds: ['tier', 'spacer'],

  normalize(ctx) {
    const clamped = clampShadeStyle(ctx);
    const warnings = clamped.warnings;
    const style: TieredStyle = {
      ...clamped.style,
      tiers: Math.max(2, whole(clamped.style.tiers)),
      spacers: Math.min(4, Math.max(3, whole(clamped.style.spacers))),
    };
    const adjusted = (field: string, message: string) =>
      warnings.push({
        severity: 'warning',
        code: 'adjusted',
        partId: ctx.id,
        paramPath: stylePath(ctx, field),
        message,
      });

    // Room for the spacer sockets where two tiers overlap.
    const least = minTierOverlap(ctx.joints.tolerance);
    if (style.overlap < least) {
      adjusted(
        'overlap',
        `overlap raised to ${mm(least)} mm so the spacer sockets fit where the tiers overlap`,
      );
      style.overlap = least;
    }
    // The top tier (as wide as the collar's ring will make it) must reach out past the overlap.
    const top = Math.max(style.topDiameter, ctx.minTopDiameter);
    const most = Math.floor((top / 2 - ctx.collar.seatRadius - SEAT_CLEARANCE) * 2) / 2;
    if (style.overlap > most) {
      if (most >= least) {
        adjusted(
          'overlap',
          `overlap reduced to ${mm(most)} mm so tier 2 stays outside the top tier's collar`,
        );
        style.overlap = most;
      } else {
        const wider = Math.ceil(2 * (ctx.collar.seatRadius + SEAT_CLEARANCE + least));
        if (style.overlap > least) {
          adjusted(
            'overlap',
            `overlap reduced to ${mm(least)} mm so tier 2 stays outside the top tier's collar`,
          );
          style.overlap = least;
        }
        adjusted(
          'topDiameter',
          `topDiameter raised to ${wider} mm so the top tier reaches out past its collar far enough for the spacers`,
        );
        style.topDiameter = wider;
      }
    }
    const topNow = Math.max(style.topDiameter, ctx.minTopDiameter);
    if (style.bottomDiameter < topNow) {
      adjusted(
        'bottomDiameter',
        `bottomDiameter raised to ${mm(topNow)} mm: the tiers widen downward`,
      );
      style.bottomDiameter = topNow;
    }
    return { style, wallThickness: clamped.wallThickness, warnings };
  },

  validate(ctx) {
    const layout = tieredLayout(ctx);
    const warnings: Warning[] = [];

    for (const g of layout.gaps) {
      if (g.clearance < MIN_TIER_CLEARANCE || g.params.length < MIN_ROD_LENGTH) {
        warnings.push({
          severity: 'error',
          code: 'tier-collision',
          partId: tierId(ctx, g.gap + 1),
          paramPath: stylePath(ctx, 'tierDrop'),
          message: `Tier ${g.gap + 1} and tier ${g.gap + 2} are too close where they overlap to hold spacers between them (they touch, or leave no room for a rod): a larger tier drop or less curve.`,
        });
      } else if (g.params.length < MIN_SPACER_LENGTH) {
        warnings.push({
          severity: 'warning',
          code: 'spacer-length',
          partId: spacerId(ctx, g.gap),
          paramPath: stylePath(ctx, 'tierDrop'),
          message: `The spacers between tier ${g.gap + 1} and tier ${g.gap + 2} are only ${mm(g.params.length)} mm long (at least ${MIN_SPACER_LENGTH} mm hold well): a larger tier drop.`,
        });
      }
    }

    const flat = layout.tiers.filter(
      (tier) => Math.min(tier.derived.overhangUp, tier.derived.overhangDown) > MAX_TIER_OVERHANG,
    );
    if (flat.length > 0) {
      const worst = Math.max(...flat.map((tier) => tier.derived.overhang));
      const names = flat.map((tier) => tier.index + 1);
      const which =
        names.length === 1
          ? `Tier ${names[0]} is`
          : `Tiers ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are`;
      warnings.push({
        severity: 'warning',
        code: 'flat-tier',
        partId: flat[0]!.id,
        paramPath: stylePath(ctx, 'tierDrop'),
        message: `${which} too flat to print without supports (up to ${deg(worst)}° from vertical whichever way up, more than ${MAX_TIER_OVERHANG}°): make the tiers steeper with a larger tier drop, more tiers or less curve.`,
      });
    }

    const sight = lineOfSight(layout, ctx.light);
    if (sight.length > 0) {
      const g = sight[0]!;
      const between =
        g.above >= 0 && g.below >= 0
          ? `between tier ${Math.min(g.above, g.below) + 1} and tier ${Math.max(g.above, g.below) + 1}`
          : g.above >= 0
            ? `under the rim of tier ${g.above + 1}`
            : g.below >= 0
              ? `above tier ${g.below + 1}`
              : 'between the tiers';
      warnings.push({
        severity: 'warning',
        code: 'line-of-sight',
        partId: tierId(ctx, Math.max(0, g.above)),
        paramPath: stylePath(ctx, 'overlap'),
        message: `The light can be seen directly ${between} (${deg(g.from)}° to ${deg(g.to)}° below the horizontal): more overlap or a smaller tier drop hides it.`,
      });
    }
    return warnings;
  },

  collarTop: (ctx) => ctx.style.topDiameter,

  parts(ctx) {
    const layout = tieredLayout(ctx);
    const parts: ShadePart[] = layout.tiers.map((tier) => {
      const count = tier.params.spacerSockets.count;
      const hangs =
        tier.index === 0
          ? []
          : [
              `Assembly: hang it from tier ${tier.index} on its ${count} spacers (${spacerName(ctx, tier.index - 1, count)}), their pins through both tiers' sockets.`,
            ];
      return {
        draft: {
          id: tier.id,
          kind: 'tier',
          displayName: tierName(ctx, tier.index),
          params: tier.params,
          colour: shadePartColour(ctx, tier.id, 'tier'),
          footprint: tierFootprint(tier.params),
          printNotes: [...tierPrintNotes(tier), ...hangs],
        },
        transform: tier.transform,
      };
    });
    const interfaces: JointInterface[] = [];
    const tolerance = ctx.joints.tolerance / 2;
    for (const g of layout.gaps) {
      // The gap's spacers: one part, a copy in each socket around the lamp's axis.
      const count = layout.tiers[g.gap]!.params.spacerSockets.count;
      const id = spacerId(ctx, g.gap);
      const copies = Array.from({ length: count }, (_, j) =>
        spacerTransform(g, spacerAngleDeg(g.gap, j, count)),
      );
      parts.push({
        draft: {
          id,
          kind: 'spacer',
          displayName: spacerName(ctx, g.gap, count),
          params: g.params,
          colour: shadePartColour(ctx, id, 'spacer'),
          footprint: spacerFootprint(g.params),
          printNotes: [
            'Print as exported: standing on its lower pin. No supports needed.',
            `Assembly: their pins go through the sockets of tier ${g.gap + 1} (top) and tier ${g.gap + 2} (bottom); a drop of glue holds them.`,
          ],
          instances: count,
        },
        transform: copies[0]!,
        instanceTransforms: copies,
      });
      for (const [end, tier] of [
        ['top', g.gap],
        ['bottom', g.gap + 1],
      ] as const) {
        interfaces.push({
          id: `${id}-${end}`,
          type: 'snap',
          nominalDiameter: SPACER_PIN_DIAMETER,
          length: SPACER_PIN_LENGTH,
          tolerance,
          male: id,
          female: tierId(ctx, tier),
        });
      }
    }
    return { parts, interfaces, zCollar: layout.zCollar, zBottom: layout.zBottom };
  },

  profile(ctx): ShadeProfile {
    const layout = tieredLayout(ctx);
    const top = layout.tiers[0]!;
    const d0 = top.derived;
    const zNeck = top.z + d0.zNeck;
    // The crown under the seat: its 45° underside from the seat radius in to the collar's bore.
    const zCrown = top.z + d0.crownK - d0.rSeat;
    // Each tier's band at height z: from where its lower face passes z out to its upper face
    // (run on to the flat rim cut below the upper face's last point).
    const spans = (z: number): [number, number][] =>
      layout.tiers.flatMap((tier): [number, number][] => {
        const zMin = tier.z + tier.derived.zMin;
        const zMax = tier.z + (tier.index === 0 ? d0.zNeck : tier.derived.zMax);
        if (z < zMin || z > zMax) return [];
        const last = tier.upper[tier.upper.length - 1]!;
        const inner = curveR(tier.lower, z) ?? tier.lower[0]![0];
        const outer =
          curveR(tier.upper, z) ??
          (z < last[1] ? last[0] + (last[1] - z) / Math.max(tier.derived.slopeRim, 1e-6) : last[0]);
        return [[Math.min(inner, outer), Math.max(inner, outer)]];
      });
    return {
      depth: -layout.zBottom,
      outerAt(z) {
        let r = z >= zNeck ? d0.rSeat : 0;
        for (const [, b] of spans(z)) r = Math.max(r, b);
        return r;
      },
      innerAt(z) {
        let r =
          z >= zCrown
            ? Math.min(d0.rSeat, Math.max(d0.rCollarBore, top.z + d0.crownK - z))
            : Infinity;
        for (const [a] of spans(z)) r = Math.min(r, a);
        return r;
      },
    };
  },
};
