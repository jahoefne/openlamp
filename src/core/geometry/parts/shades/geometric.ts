/**
 * The geometric shade family (M3b): three forms between a bottom and a top Ø,
 * each ending, like the slatted shade, in a 45° roof up to the collar the hub
 * holds. Printed open end down, collar up:
 *
 *              ┃ ┃ collar (joint male side: lugs / ribs / thread)
 *            ══╋═╋══ zCollar: flat seat out to the hub ring's outer radius
 *            ▐▒▒▒▒▒▌  neck: solid crown under the seat, 45° underside
 *           ╱       ╲ 45° roof (round, or the top polygon's pyramid)
 *          ╱  wall   ╲ polyhedral / pleated / lattice, `height` tall
 *         ╵───────────╵ open end on the bed
 *
 * - `polyhedral`: `Manifold.extrude` of a regular `sides`-gon (circumradius
 *   `bottomDiameter / 2`) with `twist` and `scaleTop` = top / bottom, minus
 *   the polygon offset inward by the wall (its miter offset) extruded with
 *   the same twist (its own scale, so the wall stays `t` thick at the top
 *   too); the twist is split into divisions by quality (each turn small
 *   enough that a side bulges less than the quality's chord), so the sides
 *   fold as twisted ruled facets and every division plane cuts the exact
 *   polygon. Each side is split into a few straight pieces, so the viewport's
 *   smooth normals keep it flat. The roof is the top polygon's own 45° pyramid
 *   (its faces at 45° whatever the corners do) up to the round neck: the
 *   polygon presents its inscribed Ø to the collar (`collarTop`).
 * - `pleated`: a Yoshimura (diamond) pleat. At every band boundary the wall's
 *   radius is a triangle wave around the cone (`pleatCount` periods, ±
 *   `pleatDepth / 2`) whose phase alternates from boundary to boundary;
 *   between two boundaries the mountain folds run diagonally from the crests
 *   below to the crests above, so the wall is a lattice of sunken diamonds of
 *   flat triangles. Built directly as a mesh (2·pleatCount nodes per boundary,
 *   the quads split along the mountain folds, every fold exact, each flat
 *   triangle split into flat pieces so the viewport's smooth normals keep the
 *   facets flat), the inner face moved in radially so the facets keep the
 *   wall's thickness. The top band folds out into the round top (as many
 *   nodes as the roof's segments, a multiple of 2·pleatCount, as
 *   `circularSegments` makes them), which the revolved roof stands on.
 * - `lattice`: the smooth cone wall (revolved) minus hole prisms along the
 *   wall's normal on a staggered (θ, z) grid (`holePitch` apart, rows
 *   `holePitch·√3/2` apart along the wall: a honeycomb), hexagons vertex-up
 *   (`holeSize` across flats; their tops are 60° roofs, no bridges) or round
 *   holes (8 segments in draft); at least `LATTICE_MARGIN` from the bed and the
 *   roof, at most `MAX_LATTICE_HOLES` (the grid is thinned out beyond); the
 *   cutters are `Manifold.compose`d (disjoint) and subtracted in **one**
 *   `difference`.
 *
 * `collar.ts` adds the collar tube and the joint. Part kind `shade`
 * (`variant: 'geometric'`).
 */
import type { Footprint, GeometryStats } from '../../../model/assembly.ts';
import type { GeometricShadeParams } from '../../../model/parts.ts';
import {
  scoped,
  type Kernel,
  type Manifold,
  type Mesh,
  type Scope,
  type Vec2,
  type Vec3,
} from '../../kernel.ts';
import { offsetProfile, type RZ } from '../../profile.ts';
import { QUALITY, type Quality } from '../../quality.ts';
import { addCollar } from './collar.ts';

const DEG = Math.PI / 180;
/** Large enough to stand in for infinity in the profile booleans, mm. */
const FAR = 1e4;
/** Slope of the roof from the top of the wall to the seat (dz/dr = 1: 45°). */
const ROOF_SLOPE = 1;
/** The crown's underside starts this far below the roof's inner face at the seat radius, mm. */
const CROWN_LIP = 0.3;
/** Thickness of the crown at the collar's bore, mm. */
const CROWN_MIN = 1;
/** Shortest neck between the roof and the seat, mm. */
const NECK_MIN = 1;
/** The polyhedral roof reaches this far up the neck (and the neck this far down into it), mm. */
const NECK_OVERLAP = 0.5;
/** The steepest facet, pleat or wall lean from vertical that prints without support, degrees. */
export const GEOMETRIC_MAX_LEAN = 50;
/** The most twist a polyhedral shade is built with, degrees (either way). */
export const MAX_POLYHEDRAL_TWIST = 90;
/** The most twist per division of a polyhedral shade's sides, by quality, degrees. */
const TWIST_STEP: Readonly<Record<Quality, number>> = { draft: 6, normal: 3, fine: 1.5 };
/**
 * How far a twisted side may bulge from its two triangles per division, by
 * quality, mm: a side `e` long turned by Δτ between two divisions folds by
 * about `e·sin(Δτ)/4` along its diagonal.
 */
const TWIST_CHORD: Readonly<Record<Quality, number>> = { draft: 0.25, normal: 0.1, fine: 0.04 };
/** The most slices a polyhedral shade's extrusion is cut into. */
const MAX_TWIST_SLICES = 720;
/** Flat pieces per pleat facet edge, by quality (see `pleatedMesh`). */
const PLEAT_SUBDIVISIONS: Readonly<Record<Quality, number>> = { draft: 2, normal: 4, fine: 6 };
/** Straight pieces per polygon side, by quality (see `regularPolygon`). */
const SIDE_SEGMENTS: Readonly<Record<Quality, number>> = { draft: 4, normal: 8, fine: 12 };
/** The most quads (slices × sides × pieces) a polyhedral face gets, by quality: fewer pieces beyond. */
const SIDE_QUADS: Readonly<Record<Quality, number>> = { draft: 3000, normal: 8000, fine: 20000 };
/** The least distance of a lattice hole from the bed and from the roof, mm. */
export const LATTICE_MARGIN = 6;
/** The most holes a lattice shade gets; the grid is thinned out beyond. */
export const MAX_LATTICE_HOLES = 600;
/** Holes larger than this (mm) have tops that may sag (an info). */
export const LATTICE_MAX_ROOF = 10;
/** How far a hole's cutter reaches past either face of the wall, mm. */
const HOLE_REACH = 1.5;
/** Segments of a round hole, by quality (multiples of 4: a corner at the top). */
const ROUND_HOLE_SEGMENTS: Readonly<Record<Quality, number>> = { draft: 8, normal: 16, fine: 24 };

/** The bounds the builder keeps whatever its params say (they come clamped from `assemble()`). */
const SIDES = [3, 24] as const;
const PLEATS = [3, 96] as const;
const BANDS = [1, 24] as const;

/** A pattern's fields when the params leave them out (the schema's defaults). */
const FALLBACK = {
  sides: 8,
  twist: 20,
  pleatCount: 16,
  pleatDepth: 6,
  bands: 5,
  holeShape: 'hex',
  holeSize: 6,
  holePitch: 11,
} as const;

const clampInt = (v: number, [lo, hi]: readonly [number, number]) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo;

/** The polyhedral form's fields, bounded. */
export function polyhedralFields(p: GeometricShadeParams): { sides: number; twist: number } {
  const twist = p.twist ?? FALLBACK.twist;
  return {
    sides: clampInt(p.sides ?? FALLBACK.sides, SIDES),
    twist: Number.isFinite(twist)
      ? Math.min(MAX_POLYHEDRAL_TWIST, Math.max(-MAX_POLYHEDRAL_TWIST, twist))
      : 0,
  };
}

/** The pleated form's fields, bounded. */
export function pleatedFields(p: GeometricShadeParams): {
  pleatCount: number;
  pleatDepth: number;
  bands: number;
} {
  return {
    pleatCount: clampInt(p.pleatCount ?? FALLBACK.pleatCount, PLEATS),
    pleatDepth: Math.max(0, p.pleatDepth ?? FALLBACK.pleatDepth),
    bands: clampInt(p.bands ?? FALLBACK.bands, BANDS),
  };
}

/** The lattice's fields; the pitch is at least the hole plus two walls, so the holes never touch. */
export function latticeFields(p: GeometricShadeParams): {
  holeShape: 'hex' | 'round';
  holeSize: number;
  holePitch: number;
} {
  const holeSize = Math.max(0.5, p.holeSize ?? FALLBACK.holeSize);
  return {
    holeShape: p.holeShape ?? FALLBACK.holeShape,
    holeSize,
    holePitch: Math.max(p.holePitch ?? FALLBACK.holePitch, minHolePitch(holeSize, p.wallThickness)),
  };
}

/** The narrowest pitch for holes of `holeSize` in a wall `t` thick: bridges of two walls. */
export function minHolePitch(holeSize: number, t: number): number {
  return holeSize + 2 * t;
}

/** Derived dimensions of the shade, in its print frame. */
export type GeometricShadeDerived = {
  /** Bottom and top radius of the wall (a polygon's circumradius). */
  rBot: number;
  rTop: number;
  H: number;
  t: number;
  /** Where the 45° roof starts: the top polygon's inradius (polyhedral) or `rTop`. */
  rShoulder: number;
  /** Roof: outer z = kOuter − r, inner z = kInner − r (r the inradius of a polyhedral roof). */
  kOuter: number;
  kInner: number;
  rCollar: number;
  rCollarBore: number;
  rSeat: number;
  /** The outer roof reaches the seat radius here; the neck rises from it. */
  zNeck: number;
  neckHeight: number;
  /** The collar plane: the seat the hub ring stands on (world z 0 when assembled). */
  zCollar: number;
  /** Top of the collar. */
  zTop: number;
  /** The crown's 45° underside: z = crownK − r (for r ≤ rSeat). */
  crownK: number;
  /** The steepest lean of the wall from vertical (its facets, pleats or cone), degrees. */
  wallLeanDeg: number;
};

export interface GeometricShadeStats extends GeometryStats {
  derived: GeometricShadeDerived;
}

/** The roof, neck and crown above a wall whose top presents `rShoulder` to the roof. */
function roofDims(p: GeometricShadeParams, rShoulder: number) {
  const H = p.height;
  const t = p.wallThickness;
  const m = ROOF_SLOPE;
  const rCollar = p.collar.radius;
  const rCollarBore = rCollar - p.collar.wall;
  const rSeat = p.collar.seatRadius;
  const kOuter = H + m * rShoulder;
  const shellRise = t * Math.sqrt(1 + m * m); // vertical thickness of the roof's shell
  const kInner = kOuter - shellRise;
  const zNeck = kOuter - m * rSeat;
  // As the revolved shade: the crown's underside rises at 45° from just below
  // the roof's inner face at the seat radius and stays CROWN_MIN below the seat
  // at the collar's bore.
  const lip = shellRise + CROWN_LIP;
  const neckHeight = Math.max(NECK_MIN, rSeat - rCollarBore - lip + CROWN_MIN);
  const zCollar = zNeck + neckHeight;
  return {
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

/** All derived dimensions. Pure, no WASM. */
export function deriveGeometricShade(
  p: GeometricShadeParams,
  quality: Quality = p.quality,
): GeometricShadeDerived {
  const rBot = p.bottomDiameter / 2;
  const rTop = p.topDiameter / 2;
  const rShoulder =
    p.pattern === 'polyhedral' ? rTop * Math.cos(Math.PI / polyhedralFields(p).sides) : rTop;
  let wallLeanDeg: number;
  switch (p.pattern) {
    case 'polyhedral':
      wallLeanDeg = polyhedralLeanDeg(p, quality);
      break;
    case 'pleated':
      wallLeanDeg = pleatedSurface(p, quality).leanDeg;
      break;
    case 'lattice':
      wallLeanDeg = Math.atan(Math.abs(rBot - rTop) / p.height) / DEG;
      break;
  }
  return {
    rBot,
    rTop,
    H: p.height,
    t: p.wallThickness,
    rShoulder,
    ...roofDims(p, rShoulder),
    wallLeanDeg,
  };
}

/** Lean of a triangle from vertical, degrees (0 = a vertical face, 90 = a flat one). */
function leanDeg(a: Vec3, b: Vec3, c: Vec3): number {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  const nx = u[1] * v[2] - u[2] * v[1];
  const ny = u[2] * v[0] - u[0] * v[2];
  const nz = u[0] * v[1] - u[1] * v[0];
  const len = Math.hypot(nx, ny, nz);
  return len < 1e-12 ? 0 : Math.asin(Math.min(1, Math.abs(nz) / len)) / DEG;
}

// ---------------------------------------------------------------- polyhedral

/**
 * Extra copies of the cross-section in a polyhedral shade's extrusion: none
 * without twist (the sides are flat), else enough that every division turns
 * the polygon by at most the quality's step and folds its widest side by at
 * most the quality's chord. Every division plane cuts the exact polygon.
 */
export function polyhedralDivisions(p: GeometricShadeParams, quality: Quality): number {
  const { sides, twist } = polyhedralFields(p);
  if (Math.abs(twist) < 1e-9) return 0;
  const side = 2 * Math.max(p.bottomDiameter, p.topDiameter) * 0.5 * Math.sin(Math.PI / sides);
  const chordStep = Math.asin(Math.min(1, (4 * TWIST_CHORD[quality]) / side)) / DEG;
  const step = Math.min(TWIST_STEP[quality], chordStep);
  const slices = Math.min(MAX_TWIST_SLICES, Math.ceil(Math.abs(twist) / step - 1e-9));
  return Math.max(0, slices - 1);
}

/**
 * A regular `n`-gon of circumradius `r`, its first corner at `rotDeg`, each
 * side split into `segments` straight pieces (collinear points: the viewport's
 * smooth normals then blend only next to the corners, so the sides look flat).
 */
function regularPolygon(r: number, n: number, rotDeg = 0, segments = 1): Vec2[] {
  const pts: Vec2[] = [];
  const corner = (i: number): Vec2 => {
    const a = rotDeg * DEG + (2 * Math.PI * i) / n;
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  for (let i = 0; i < n; i++) {
    const [ax, ay] = corner(i);
    const [bx, by] = corner(i + 1);
    for (let j = 0; j < segments; j++) {
      const f = j / segments;
      pts.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
    }
  }
  return pts;
}

/**
 * The steepest lean of a polyhedral shade's sides (outer and inner face, both
 * ways a twisted quad may be split), degrees. Pure, no WASM.
 */
function polyhedralLeanDeg(p: GeometricShadeParams, quality: Quality): number {
  const { sides: n, twist } = polyhedralFields(p);
  const slices = polyhedralDivisions(p, quality) + 1;
  const H = p.height;
  const t = p.wallThickness;
  const c = Math.cos(Math.PI / n);
  const rBot = p.bottomDiameter / 2;
  const rTop = p.topDiameter / 2;
  // Each face: its bottom circumradius and its top / bottom scale.
  const faces: [r0: number, k: number][] = [
    [rBot, rTop / rBot],
    [rBot - t / c, (rTop * c - t) / (rBot * c - t)],
  ];
  let worst = 0;
  for (const [r0, k] of faces) {
    const corner = (i: number, j: number): Vec3 => {
      const s = 1 + ((k - 1) * j) / slices;
      const a = (2 * Math.PI * i) / n + (twist * DEG * j) / slices;
      return [r0 * s * Math.cos(a), r0 * s * Math.sin(a), (H * j) / slices];
    };
    for (let j = 0; j < slices; j++) {
      const a = corner(0, j);
      const b = corner(1, j);
      const cc = corner(1, j + 1);
      const d = corner(0, j + 1);
      worst = Math.max(
        worst,
        leanDeg(a, b, cc),
        leanDeg(a, cc, d),
        leanDeg(a, b, d),
        leanDeg(b, cc, d),
      );
    }
  }
  return worst;
}

/** The polyhedral body (without the collar tube): twisted prism shell, 45° pyramid roof, neck, crown. */
function polyhedralBody(
  k: Kernel,
  s: Scope,
  p: GeometricShadeParams,
  d: GeometricShadeDerived,
  quality: Quality,
  segs: number,
): Manifold {
  const { Manifold, CrossSection } = k;
  const { sides: n, twist } = polyhedralFields(p);
  const { H, t } = d;
  const divisions = polyhedralDivisions(p, quality);
  const pieces = Math.max(
    1,
    Math.min(SIDE_SEGMENTS[quality], Math.floor(SIDE_QUADS[quality] / ((divisions + 1) * n))),
  );
  const ngon = (r: number, rotDeg = 0, split = pieces) =>
    s.add(new CrossSection([regularPolygon(r, n, rotDeg, split)]));
  const c = Math.cos(Math.PI / n);

  // The outer prism: bottom polygon → top polygon (scaled, turned by the twist).
  const kOut = d.rTop / d.rBot;
  const outerPrism = s.add(Manifold.extrude(ngon(d.rBot), H, divisions, twist, [kOut, kOut]));

  // The inner prism: the polygon offset inward by the wall (its miter offset,
  // circumradius r − t / cos(π/n), built directly: `CrossSection.offset` would
  // drop the sides' extra points), its top inradius `rShoulder − t` (so the
  // wall is `t` at both ends), from 1 mm below the bed (no coplanar faces) to
  // the top of the wall, twisting at the same rate.
  const inradiusBot = d.rBot * c;
  const kIn = (d.rShoulder - t) / (inradiusBot - t);
  const s0 = 1 - (kIn - 1) / H; // its scale at z = −1
  const start = s.add(s.add(ngon(d.rBot - t / c, -twist / H)).scale([s0, s0]));
  const innerSlices = Math.max(1, Math.round(((divisions + 1) * (H + 1)) / H));
  const innerPrism = s.add(
    s
      .add(
        Manifold.extrude(start, H + 1, innerSlices - 1, (twist * (H + 1)) / H, [
          kIn / s0,
          kIn / s0,
        ]),
      )
      .translate([0, 0, -1]),
  );

  // The roof: the top polygon's own 45° pyramid (inradius rShoulder at H,
  // shrinking 1 mm per mm) a little past the seat radius; the round neck
  // rises out of it to the seat. Its sides stay whole: they end on the neck's
  // circle, where split sides only fan out into slivers.
  const roofHeight = d.zNeck - H + NECK_OVERLAP;
  const roofScale = (d.rShoulder - roofHeight) / d.rShoulder;
  const roof = s.add(
    s
      .add(Manifold.extrude(ngon(d.rTop, twist, 1), roofHeight, 0, 0, [roofScale, roofScale]))
      .translate([0, 0, H]),
  );
  const neckZ0 = d.zNeck - 2 * NECK_OVERLAP;
  const neck = s.add(
    s.add(Manifold.cylinder(d.zCollar - neckZ0, d.rSeat, d.rSeat, segs)).translate([0, 0, neckZ0]),
  );

  // The roof's inside: the same pyramid a wall in (inradius rShoulder − t·√2 at
  // H), from just inside the inner prism's top up to its apex.
  const eps = 0.1 * t;
  const innerRoofIn = d.rShoulder - t * Math.SQRT2 + eps;
  const innerRoof = s.add(
    s
      .add(Manifold.extrude(ngon(innerRoofIn / c, twist, 1), innerRoofIn, 0, 0, [0, 0]))
      .translate([0, 0, H - eps]),
  );

  // The crown's 45° underside (round) and the collar's bore above the wall.
  const zLo = -2;
  const zHi = d.zTop + 2;
  const R = Math.max(d.rBot, d.rTop, d.rSeat) + 10;
  const belowCrown = s.add(
    Manifold.revolve(
      [
        [
          [0, zLo],
          [R, zLo],
          [R, zHi],
          [d.rSeat, zHi],
          [d.rSeat, d.crownK - d.rSeat],
          [0, d.crownK],
        ],
      ],
      segs,
    ),
  );
  const bore = s.add(
    s.add(Manifold.cylinder(zHi - H, d.rCollarBore, d.rCollarBore, segs)).translate([0, 0, H]),
  );

  const outer = s.add(Manifold.union([outerPrism, roof, neck]));
  const hollow = s.add(
    Manifold.intersection(s.add(Manifold.union(innerPrism, innerRoof)), belowCrown),
  );
  const cavity = s.add(Manifold.union(hollow, bore));
  return s.add(Manifold.difference(outer, cavity));
}

// ---------------------------------------------------------------- the round roof (pleated, lattice)

/**
 * The revolve profile of the smooth cone wall (`rBot` on the bed → `rTop` at
 * `H`, its inner face `t` in along the normal), the 45° roof, the neck and the
 * crown, from `zFrom` up (0: the lattice's whole shell; `H`: the pleated
 * wall's roof alone), as polygons in the (r, z) plane.
 */
function roundShellProfile(k: Kernel, d: GeometricShadeDerived, zFrom: number): Vec2[][] {
  const m = ROOF_SLOPE;
  const outer: RZ[] = [
    [d.rBot, 0],
    [d.rTop, d.H],
  ];
  const { inner } = offsetProfile(outer, d.t);
  const first = inner[0]!;
  const last = inner[inner.length - 1]!;
  const R = 2 * (d.rBot + d.rTop) + 100; // right of everything
  return scoped(k, (s) => {
    const { CrossSection } = k;
    const poly = (pts: readonly RZ[]) =>
      s.add(new CrossSection([pts.map((q): Vec2 => [q[0], q[1]])]));
    const top: RZ[] = [
      [d.rSeat, d.zNeck],
      [d.rSeat, d.zCollar],
      [0, d.zCollar],
    ];
    const envelope = poly(
      zFrom <= 0 ? [[0, 0], [d.rBot, 0], [d.rTop, d.H], ...top] : [[0, d.H], [d.rTop, d.H], ...top],
    );
    const insideWall = poly([[-1, -1], [first[0], -1], ...inner, [last[0], FAR], [-1, FAR]]);
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
    // The collar's bore, above the wall only (a narrow bottom keeps its wall).
    const bore = poly([
      [-1, d.H],
      [d.rCollarBore, d.H],
      [d.rCollarBore, FAR],
      [-1, FAR],
    ]);
    const hollow = s.add(CrossSection.intersection([insideWall, belowCone, belowCrown]));
    const cavity = s.add(CrossSection.union(hollow, bore));
    return s.add(CrossSection.difference(envelope, cavity)).toPolygons();
  });
}

// ---------------------------------------------------------------- pleated

/** The pleated wall as a closed mesh, plus what the checks need. */
export interface PleatedSurface {
  /** Vertex positions, xyz: the outer face's nodes, then the inner face's. */
  positions: Float64Array;
  /** Triangles (CCW seen from outside the material). */
  triangles: Uint32Array;
  /** Triangles of the outer face (the first ones in `triangles`). */
  outerTriangles: number;
  /** Nodes of the round top row: the roof's (and the collar's) circular segments. */
  segments: number;
  /** Half the pleat depth. */
  amplitude: number;
  /** Heights of the band boundaries (bottom → top; the last one is the round top). */
  boundaries: number[];
  /** How far the inner face sits in from the outer one at each boundary (radially). */
  insets: number[];
  /** The steepest lean of the outer facets from vertical, degrees. */
  leanDeg: number;
}

/**
 * Circular segments of a pleated shade's round top, roof and collar: a
 * multiple of 2·`pleatCount` (two nodes per pleat), at least the quality's.
 */
export function pleatedSegments(pleatCount: number, quality: Quality): number {
  const nodes = 2 * pleatCount;
  return nodes * Math.max(1, Math.ceil(QUALITY[quality].segments / nodes));
}

/**
 * The pleated wall (Yoshimura diamonds, see the file comment) from the bed to
 * `height`. Boundary `b` (z = b·height/bands, b < bands) has 2·pleatCount
 * nodes at θ = jπ/pleatCount, on the cone's radius ± the amplitude
 * (crest where j + b is even): the triangle wave whose phase alternates per
 * band. The top (z = height) is round. Pure, no WASM.
 */
export function pleatedSurface(p: GeometricShadeParams, quality: Quality): PleatedSurface {
  const { pleatCount: n, pleatDepth, bands: B } = pleatedFields(p);
  const H = p.height;
  const t = p.wallThickness;
  const rBot = p.bottomDiameter / 2;
  const rTop = p.topDiameter / 2;
  const A = pleatDepth / 2;
  const S = pleatedSegments(n, quality);
  const m = S / (2 * n); // top nodes per half pleat
  const h = H / B;
  const dR = Math.abs(rBot - rTop) / B;
  const rAt = (z: number) => rBot + ((rTop - rBot) * z) / H;

  // Rows of nodes: [radius, angle, z] and the inner face's radial inset.
  const rows: { r: number; a: number; z: number }[][] = [];
  const insets: number[] = [];
  const boundaries: number[] = [];
  for (let b = 0; b < B; b++) {
    const z = b * h;
    const r = rAt(z);
    const c = (Math.PI * r) / n; // half a pleat, along the circle
    // The facets' normal is (2Ah, c·(2A + dR), c·h) in (around, up, out):
    // move the inner face in far enough to keep the wall `t` thick across them.
    insets.push((t * Math.hypot(2 * A * h, c * (2 * A + dR), c * h)) / (c * h));
    boundaries.push(z);
    const row = [];
    for (let j = 0; j < 2 * n; j++) {
      row.push({ r: r + ((j + b) % 2 === 0 ? A : -A), a: (j * Math.PI) / n, z });
    }
    rows.push(row);
  }
  insets.push(t * Math.hypot(1, dR / h));
  boundaries.push(H);
  const topRow = [];
  for (let i = 0; i < S; i++) topRow.push({ r: rTop, a: (2 * Math.PI * i) / S, z: H });
  rows.push(topRow);

  const offsets: number[] = [];
  let count = 0;
  for (const row of rows) {
    offsets.push(count);
    count += row.length;
  }
  const positions = new Float64Array(2 * count * 3);
  rows.forEach((row, b) =>
    row.forEach((node, j) => {
      const o = (offsets[b]! + j) * 3;
      const i = (count + offsets[b]! + j) * 3;
      const ri = node.r - insets[b]!;
      positions[o] = node.r * Math.cos(node.a);
      positions[o + 1] = node.r * Math.sin(node.a);
      positions[o + 2] = node.z;
      positions[i] = ri * Math.cos(node.a);
      positions[i + 1] = ri * Math.sin(node.a);
      positions[i + 2] = node.z;
    }),
  );
  /** Index of node `j` (wrapping) of row `b` on the outer face. */
  const at = (b: number, j: number) => {
    const len = rows[b]!.length;
    return offsets[b]! + (((j % len) + len) % len);
  };

  const tris: number[] = [];
  const face = (inner: boolean) => {
    const off = inner ? count : 0;
    const tri = (a: number, b: number, c: number) =>
      inner ? tris.push(a + off, c + off, b + off) : tris.push(a, b, c);
    // Full bands: each quad split along its mountain fold (crest to crest).
    for (let b = 0; b < B - 1; b++) {
      for (let j = 0; j < 2 * n; j++) {
        const bl = at(b, j);
        const br = at(b, j + 1);
        const tl = at(b + 1, j);
        const tr = at(b + 1, j + 1);
        if ((j + b) % 2 === 0) {
          tri(bl, br, tr);
          tri(bl, tr, tl);
        } else {
          tri(bl, br, tl);
          tri(br, tr, tl);
        }
      }
    }
    // The top band: each node of the last boundary fans out to its arc of the round top.
    const b = B - 1;
    const q = Math.floor(m / 2);
    for (let j = 0; j < 2 * n; j++) {
      const bl = at(b, j);
      const br = at(b, j + 1);
      for (let i = j * m; i < j * m + q; i++) tri(bl, at(B, i + 1), at(B, i));
      tri(bl, br, at(B, j * m + q));
      for (let i = j * m + q; i < (j + 1) * m; i++) tri(br, at(B, i + 1), at(B, i));
    }
  };
  face(false);
  const outerTriangles = tris.length / 3;
  face(true);
  // The bottom on the bed and the round top (the roof stands on it).
  for (let j = 0; j < 2 * n; j++) {
    const o0 = at(0, j);
    const o1 = at(0, j + 1);
    tris.push(o0, o0 + count, o1, o1, o0 + count, o1 + count);
  }
  for (let i = 0; i < S; i++) {
    const o0 = at(B, i);
    const o1 = at(B, i + 1);
    tris.push(o0, o1, o0 + count, o1, o1 + count, o0 + count);
  }

  let lean = 0;
  const vertex = (v: number): Vec3 => [
    positions[v * 3]!,
    positions[v * 3 + 1]!,
    positions[v * 3 + 2]!,
  ];
  for (let i = 0; i < outerTriangles; i++) {
    lean = Math.max(
      lean,
      leanDeg(vertex(tris[3 * i]!), vertex(tris[3 * i + 1]!), vertex(tris[3 * i + 2]!)),
    );
  }
  return {
    positions,
    triangles: Uint32Array.from(tris),
    outerTriangles,
    segments: S,
    amplitude: A,
    boundaries,
    insets,
    leanDeg: lean,
  };
}

/**
 * The pleated wall's mesh with every (flat) triangle split into `n²` flat
 * ones, so the viewport's smooth normals blend only next to the folds and the
 * facets look flat. A shared edge is split at the same points from both sides
 * (each the same weighted sum of its two ends), and `merge` welds them.
 */
function pleatedMesh(k: Kernel, surface: PleatedSurface, n: number): Mesh {
  const { positions: P, triangles: T } = surface;
  const out = new Float32Array((T.length / 3) * n * n * 9);
  let o = 0;
  /** Corner (u, v) of the sub-grid of triangle (a, b, c): ((n − u − v)·a + u·b + v·c) / n. */
  const push = (a: number, b: number, c: number, u: number, v: number) => {
    const w = n - u - v;
    for (let axis = 0; axis < 3; axis++) {
      out[o++] = (w * P[a * 3 + axis]! + u * P[b * 3 + axis]! + v * P[c * 3 + axis]!) / n;
    }
  };
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t]!;
    const b = T[t + 1]!;
    const c = T[t + 2]!;
    for (let u = 0; u < n; u++) {
      for (let v = 0; v < n - u; v++) {
        push(a, b, c, u, v);
        push(a, b, c, u + 1, v);
        push(a, b, c, u, v + 1);
        if (u + v < n - 1) {
          push(a, b, c, u + 1, v);
          push(a, b, c, u + 1, v + 1);
          push(a, b, c, u, v + 1);
        }
      }
    }
  }
  const triVerts = new Uint32Array(o / 3);
  for (let i = 0; i < triVerts.length; i++) triVerts[i] = i;
  const mesh = new k.Mesh({ numProp: 3, vertProperties: out, triVerts });
  mesh.merge();
  return mesh;
}

// ---------------------------------------------------------------- lattice

/** One row of lattice holes, centred on the wall at height `z` of the outer face. */
export interface LatticeRow {
  z: number;
  /** Holes around the row. */
  count: number;
  /** Angle of the row's first hole, radians (odd rows are offset by half a hole). */
  phase: number;
}

export interface LatticeGrid {
  rows: LatticeRow[];
  /** The pitch actually used (wider than asked when the grid was thinned out). */
  pitch: number;
  holes: number;
  /** Holes the asked-for pitch would have made. */
  requested: number;
  /** Whether the grid was thinned out to `MAX_LATTICE_HOLES`. */
  capped: boolean;
  /** Half the hole's height along the wall (a hexagon's corner, a circle's radius). */
  halfHeight: number;
}

/** The staggered (θ, z) grid of a lattice shade's holes. Pure, no WASM. */
export function latticeGrid(p: GeometricShadeParams): LatticeGrid {
  const { holeShape, holeSize, holePitch } = latticeFields(p);
  const H = p.height;
  const t = p.wallThickness;
  const rBot = p.bottomDiameter / 2;
  const rTop = p.topDiameter / 2;
  const slant = Math.hypot(H, rBot - rTop);
  const halfHeight = holeShape === 'hex' ? holeSize / Math.sqrt(3) : holeSize / 2;
  const zMin = LATTICE_MARGIN + halfHeight;
  const zMax = H - LATTICE_MARGIN - halfHeight;
  const layout = (pitch: number): LatticeRow[] => {
    if (zMax < zMin) return [];
    const dz = ((pitch * Math.sqrt(3)) / 2) * (H / slant);
    const nRows = Math.floor((zMax - zMin) / dz + 1e-9) + 1;
    const z0 = (zMin + zMax) / 2 - ((nRows - 1) * dz) / 2;
    const rows: LatticeRow[] = [];
    for (let i = 0; i < nRows; i++) {
      const z = z0 + i * dz;
      const r = rBot + ((rTop - rBot) * z) / H - t / 2;
      const count = Math.floor((2 * Math.PI * r) / pitch + 1e-9);
      if (count < 3) continue;
      rows.push({ z, count, phase: i % 2 === 0 ? 0 : Math.PI / count });
    }
    return rows;
  };
  const total = (rows: LatticeRow[]) => rows.reduce((sum, r) => sum + r.count, 0);
  let rows = layout(holePitch);
  const requested = total(rows);
  let pitch = holePitch;
  if (requested > MAX_LATTICE_HOLES) {
    pitch = holePitch * Math.sqrt(requested / MAX_LATTICE_HOLES);
    rows = layout(pitch);
    while (total(rows) > MAX_LATTICE_HOLES) {
      pitch *= 1.02;
      rows = layout(pitch);
    }
  }
  return {
    rows,
    pitch,
    holes: total(rows),
    requested,
    capped: requested > MAX_LATTICE_HOLES,
    halfHeight,
  };
}

/** The lattice's hole cutters, composed into one manifold (they never touch). */
function latticeCutters(
  k: Kernel,
  s: Scope,
  p: GeometricShadeParams,
  d: GeometricShadeDerived,
  quality: Quality,
): Manifold | undefined {
  const { Manifold, CrossSection } = k;
  const { holeShape, holeSize } = latticeFields(p);
  const grid = latticeGrid(p);
  if (grid.holes === 0) return undefined;
  // One prism along its z axis, centred: a vertex-up hexagon (holeSize across
  // flats) or a circle with a corner at the top.
  const section =
    holeShape === 'hex'
      ? s.add(new CrossSection([regularPolygon(holeSize / Math.sqrt(3), 6, 90)]))
      : s.add(CrossSection.circle(holeSize / 2, ROUND_HOLE_SEGMENTS[quality]));
  const prism = s.add(Manifold.extrude(section, d.t + 2 * HOLE_REACH, 0, 0, [1, 1], true));
  // The wall's outward normal leans up by α on a narrowing cone.
  const alpha = Math.atan2(d.rBot - d.rTop, d.H);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const cutters: Manifold[] = [];
  for (const row of grid.rows) {
    const r = d.rBot + ((d.rTop - d.rBot) * row.z) / d.H;
    for (let i = 0; i < row.count; i++) {
      const th = row.phase + (2 * Math.PI * i) / row.count;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      // Prism x → around the wall, y → up the wall, z → the outward normal.
      const tangent: Vec3 = [-sn, c, 0];
      const up: Vec3 = [-sa * c, -sa * sn, ca];
      const normal: Vec3 = [c * ca, sn * ca, sa];
      // Centred in the wall: half a wall in from the outer face at the row's height.
      const centre: Vec3 = [
        r * c - (d.t / 2) * normal[0],
        r * sn - (d.t / 2) * normal[1],
        row.z - (d.t / 2) * normal[2],
      ];
      const matrix = [...tangent, 0, ...up, 0, ...normal, 0, ...centre, 1] as Parameters<
        Manifold['transform']
      >[0];
      cutters.push(s.add(prism.transform(matrix)));
    }
  }
  // Disjoint by construction (the pitch leaves two walls between holes): a
  // purely topological batch, then the caller's one difference.
  return s.add(Manifold.compose(cutters));
}

// ---------------------------------------------------------------- radii, footprint, build

/**
 * The shade's radii at a height of its print frame, for checks that need no
 * mesh (the clearance between an inner and an outer shade, the bulb's heat
 * zone), as the revolved shade's (`revolvedShadeRadii`). Pure, no WASM. Below
 * the collar plane only (`0 ≤ z < zCollar`): `outerAt` the outermost surface
 * (a polygon's corners, the pleats' crests), `innerAt` where the material
 * starts seen from the axis (a polygon's flats, the pleats' troughs).
 */
export function geometricShadeRadii(p: GeometricShadeParams): {
  derived: GeometricShadeDerived;
  outerAt(z: number): number;
  innerAt(z: number): number;
} {
  const d = deriveGeometricShade(p);
  const lerp = (a: number, b: number, z: number) =>
    a + ((b - a) * Math.min(d.H, Math.max(0, z))) / d.H;
  const n = p.pattern === 'polyhedral' ? polyhedralFields(p).sides : 0;
  const c = n > 0 ? Math.cos(Math.PI / n) : 1;
  let crest = (z: number) => lerp(d.rBot, d.rTop, z);
  let trough = (z: number) => lerp(d.rBot, d.rTop, z) - d.t;
  if (p.pattern === 'polyhedral') {
    trough = (z) => lerp(d.rBot * c, d.rShoulder, z) - d.t;
  } else if (p.pattern === 'pleated') {
    const pleats = pleatedSurface(p, p.quality);
    const A = pleats.amplitude;
    const lastBoundary = pleats.boundaries[pleats.boundaries.length - 2]!;
    const inset = Math.max(...pleats.insets);
    // A facet's chord between two nodes half a pleat apart dips below them.
    const sag = 1 - Math.cos(Math.PI / pleatedFields(p).pleatCount);
    // Full pleats up to the last boundary, folding out into the round top.
    const amp = (z: number) =>
      z <= lastBoundary ? A : (A * (d.H - z)) / Math.max(1e-9, d.H - lastBoundary);
    crest = (z) => lerp(d.rBot, d.rTop, z) + amp(z);
    trough = (z) => lerp(d.rBot, d.rTop, z) * (1 - sag) - amp(z) - inset;
  }
  return {
    derived: d,
    outerAt(z) {
      if (z <= d.H) return crest(z);
      // The roof (a polygon's corners stand out of it by 1/cos), then the neck.
      const roof = (d.kOuter - z) / ROOF_SLOPE / c;
      return z <= d.zNeck + NECK_OVERLAP ? Math.max(roof, d.rSeat) : d.rSeat;
    },
    innerAt(z) {
      let r = z <= d.H ? trough(z) : Infinity;
      r = Math.min(r, (d.kInner - z) / ROOF_SLOPE);
      const crown = d.crownK - z;
      if (crown < d.rSeat) r = Math.min(r, crown);
      return z > d.H ? Math.max(r, d.rCollarBore) : r;
    },
  };
}

/** Bed footprint (an upper bound of the bounding box) without building it. Pure, no WASM. */
export function geometricShadeFootprint(p: GeometricShadeParams): Footprint {
  const rBot = p.bottomDiameter / 2;
  const rTop = p.topDiameter / 2;
  const d = roofDims(
    p,
    p.pattern === 'polyhedral' ? rTop * Math.cos(Math.PI / polyhedralFields(p).sides) : rTop,
  );
  const pleat = p.pattern === 'pleated' ? pleatedFields(p).pleatDepth / 2 : 0;
  const r = Math.max(rBot + pleat, rTop, d.rSeat);
  return { x: 2 * r, y: 2 * r, z: d.zTop };
}

/**
 * Build the shade.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildGeometricShade(
  k: Kernel,
  params: GeometricShadeParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: GeometricShadeStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const d = deriveGeometricShade(p, quality);
    let segs: number = QUALITY[quality].segments;
    let body: Manifold;
    switch (p.pattern) {
      case 'polyhedral':
        body = polyhedralBody(k, s, p, d, quality, segs);
        break;
      case 'pleated': {
        const pleats = pleatedSurface(p, quality);
        segs = pleats.segments;
        const wall = s.add(new Manifold(pleatedMesh(k, pleats, PLEAT_SUBDIVISIONS[quality])));
        const roof = s.add(Manifold.revolve(roundShellProfile(k, d, d.H), segs));
        body = s.add(Manifold.union(wall, roof));
        break;
      }
      case 'lattice': {
        const shell = s.add(Manifold.revolve(roundShellProfile(k, d, 0), segs));
        const holes = latticeCutters(k, s, p, d, quality);
        body = holes ? s.add(Manifold.difference(shell, holes)) : shell;
        break;
      }
    }
    const result = s.add(
      addCollar(k, body, p.joint, { collar: p.collar, z0: d.zCollar, segs, quality }),
    );

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: GeometricShadeStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The roof, the crown's underside and the lugs are 45°; the wall leans
      // (a lattice's hole tops are short 60° roofs or arcs, like the slatted
      // shade's bridges not counted here).
      maxOverhangDeg: Math.max(d.wallLeanDeg, 45),
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
