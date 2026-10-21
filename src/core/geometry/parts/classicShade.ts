/**
 * The classic shade: today's one-piece lamp shade for the Bambu Lab LED Lamp
 * Kit-001, hub and shade fused into a single print, printed open end down:
 *
 *   ceiling  ═══════════════ velcro strip stuck to the ceiling
 *            ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ strap running across the top, through two
 *          ╔═╤═══════════╤═╗  belt-loop tunnels on the housing sides
 *          ║ │   puck    │ ║  puck pocket, open towards the ceiling
 *          ║ └──┐     ┌──┘ ║  ledge with the light opening
 *         ╱                 ╲ shoulder (≥ 45° so it prints without support)
 *        ╱                   ╲
 *       ╱       shade         ╲
 *      ╱                       ╲
 *     ╵─────────────────────────╵ open bottom (on the print bed)
 *
 * Part kind `classicShade`. In M2 it is dissolved into a hub and a revolved
 * shade, and `hub.fused` reproduces this print.
 */

import type { Kernel, Manifold, Vec3 } from '../kernel.ts';
import { scoped } from '../kernel.ts';
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { ClassicShadeParams } from '../../schema/defs.ts';
import { offsetProfile, profileSteps, sampleProfile, uniformSamples, type RZ } from '../profile.ts';
import { circularSegments, QUALITY, type Quality } from '../quality.ts';
import { radialWarp } from '../surface.ts';

export type { ClassicShadeParams } from '../../schema/defs.ts';

const DEG = Math.PI / 180;

/** Derived dimensions shared by the builder, the assembler, the UI overlay and the README. */
export type Derived = {
  rBot: number;
  rTop: number;
  H: number;
  t: number;
  /** Shoulder slope dz/dr. */
  m: number;
  rPocket: number;
  rBoss: number;
  rHole: number;
  pocketDepth: number;
  kOuter: number;
  kInner: number;
  zHoleBottom: number;
  zFloor: number;
  zTop: number;
  zShoulderOuter: number;
};

export type ClassicShadeDerived = Derived & {
  /** z shift applied to the result (non-zero in fit-test mode). */
  zOffset: number;
};

export interface ClassicShadeStats extends GeometryStats {
  derived: ClassicShadeDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function derive(p: ClassicShadeParams): Derived {
  const rBot = p.bottomDiameter / 2;
  const rTop = p.topDiameter / 2;
  const H = p.height;
  const t = p.wallThickness;
  const m = Math.tan(p.shoulderAngle * DEG); // shoulder slope dz/dr
  const rPocket = p.puckDiameter / 2 + p.puckClearance;
  const rBoss = rPocket + p.bossWall;
  const rHole = p.lightHoleDiameter / 2;
  const pocketDepth = p.puckHeight + p.pocketExtraDepth;

  // Outer shoulder cone: z = H + m (rTop - r). Inner cone is the parallel line
  // offset by the wall thickness: z + m r = kInner.
  const kOuter = H + m * rTop;
  const kInner = kOuter - t * Math.sqrt(1 + m * m);
  const zHoleBottom = kInner - m * rHole; // inner cone meets the light opening
  const zFloor = zHoleBottom + p.ledgeThickness; // puck rests here
  const zTop = zFloor + pocketDepth; // top of the housing = ceiling side
  const zShoulderOuter = H + m * (rTop - rBoss); // outer cone meets housing wall

  return {
    rBot,
    rTop,
    H,
    t,
    m,
    rPocket,
    rBoss,
    rHole,
    pocketDepth,
    kOuter,
    kInner,
    zHoleBottom,
    zFloor,
    zTop,
    zShoulderOuter,
  };
}

/** Outer wall radius as a function of u in [0,1] (0 = bottom, 1 = shoulder). */
function wallRadius(p: ClassicShadeParams, d: Derived, u: number): number {
  const bulge = p.curve * 0.3 * d.rBot;
  return d.rBot + (d.rTop - d.rBot) * u + bulge * Math.sin(Math.PI * u);
}

/** The z of the cut that keeps only the housing ring in fit-test mode. */
function fitTestCut(p: ClassicShadeParams, d: Derived): number {
  return d.zFloor - p.ledgeThickness - 3;
}

/**
 * Bed footprint of the printed part (an upper bound of its bounding box), without
 * building it: the widest point of the wall including the bulge and the surface
 * pattern, or the housing with its belt loops, whichever is larger. In fit-test
 * mode just the housing ring. Pure, no WASM.
 */
export function classicShadeFootprint(p: ClassicShadeParams): Footprint {
  const d = derive(p);
  const loopHalfWidth = p.strapWidth / 2 + p.loopWall;
  const housingX = 2 * Math.max(d.rBoss, loopHalfWidth);
  const housingY = 2 * (d.rBoss + p.strapThickness + p.loopWall);
  if (p.fitTest === 'yes') return { x: housingX, y: housingY, z: d.zTop - fitTestCut(p, d) };
  let rMax = 0;
  for (const u of uniformSamples(128)) rMax = Math.max(rMax, wallRadius(p, d, u));
  if (p.style === 'ribbed') rMax += p.ribDepth / 2;
  else if (p.style === 'faceted')
    rMax /= Math.cos(Math.PI / Math.max(1, Math.round(p.patternCount)));
  return { x: Math.max(2 * rMax, housingX), y: Math.max(2 * rMax, housingY), z: d.zTop };
}

/**
 * Build the revolve profile polygon as [x = r, y = z] points, counter-clockwise.
 * The housing is left solid here; the pocket and light opening are cut later
 * with cylinders so the belt loops can fuse into it first.
 */
function buildProfile(
  p: ClassicShadeParams,
  d: Derived,
  wallStep: number,
): { polygon: RZ[]; maxOverhangDeg: number; kUsed: number } {
  const us = uniformSamples(profileSteps(d.H, wallStep));
  const outer = sampleProfile((u) => wallRadius(p, d, u), d.H, us);
  const { inner, maxOverhangDeg } = offsetProfile(outer, d.t);
  const { m, kInner, rBoss, zTop, zShoulderOuter } = d;

  // Where does the inner shoulder cone (z + m r = kInner) meet the inner wall?
  // Scan from the top down for the first point below the line.
  let cut = -1;
  for (let i = inner.length - 1; i >= 0; i--) {
    const pt = inner[i]!;
    if (pt[1] + m * pt[0] < kInner) {
      cut = i;
      break;
    }
  }
  let innerKept: RZ[];
  let kUsed = kInner;
  if (cut >= 0 && cut < inner.length - 1) {
    const a = inner[cut]!;
    const b = inner[cut + 1]!;
    const fa = a[1] + m * a[0] - kInner;
    const fb = b[1] + m * b[0] - kInner;
    const s = fa / (fa - fb);
    innerKept = inner.slice(0, cut + 1);
    innerKept.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]);
  } else {
    // Very flat shade: start the roof cone at the lowest point of the inner wall.
    let best = 0;
    let bestV = Infinity;
    inner.forEach((pt, i) => {
      const v = pt[1] + m * pt[0];
      if (v < bestV) {
        bestV = v;
        best = i;
      }
    });
    innerKept = inner.slice(0, best + 1);
    kUsed = bestV;
  }
  const apexZ = kUsed; // inner cone reaches the axis here (removed by the light opening cut)

  const pts: RZ[] = [];
  for (const pt of outer) pts.push(pt);
  pts.push([rBoss, zShoulderOuter]);
  pts.push([rBoss, zTop]);
  pts.push([0, zTop]);
  pts.push([0, apexZ]);
  for (let i = innerKept.length - 1; i >= 0; i--) pts.push(innerKept[i]!);
  return { polygon: pts, maxOverhangDeg, kUsed };
}

/**
 * Build one belt-loop tunnel bracket on the ±Y side of the housing, with its
 * strap channel already cut, ready to be unioned onto the body.
 */
function beltLoop(
  k: Kernel,
  p: ClassicShadeParams,
  d: Derived,
  segs: number,
  sign: 1 | -1,
): Manifold {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const { rBoss, zTop, kInner, m } = d;
    const wx = p.strapWidth / 2 + p.loopWall;
    const crescent = rBoss - Math.sqrt(Math.max(0, rBoss * rBoss - wx * wx)) + 0.6;
    const yIn = rBoss - crescent;
    const yOut = rBoss + p.strapThickness + p.loopWall;
    const zLoopBottom = zTop - p.loopLength;
    const zChamfer = zLoopBottom - (yOut - yIn); // 45° chamfer under the loop
    const pts: Vec3[] = [];
    for (const x of [-wx, wx]) {
      pts.push([x, yIn, zTop], [x, yOut, zTop], [x, yOut, zLoopBottom], [x, yIn, zChamfer]);
    }
    const bracket = s.add(Manifold.hull(pts));
    // Remove anything that would poke through the roof into the shade cavity.
    const rc = rBoss + 40;
    const cavity = s.add(
      s.add(Manifold.cylinder(m * rc, rc, 0, segs)).translate([0, 0, kInner - m * rc]),
    );
    // The strap channel is cut from the bracket only, so it can never nick the
    // thin shoulder shell below the tunnel.
    const slot = s.add(
      s
        .add(
          Manifold.cube([p.strapWidth, p.strapThickness, p.loopLength + (yOut - yIn) + 2], false),
        )
        .translate([-p.strapWidth / 2, rBoss, zChamfer - 1]),
    );
    const cut = s.add(Manifold.difference([bracket, cavity, slot]));
    return s.keep(sign < 0 ? s.add(cut.mirror([0, 1, 0])) : cut);
  });
}

/**
 * Build the complete shade.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  normalised parameters (see `normalizeClassicShade`)
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildClassicShade(
  k: Kernel,
  params: ClassicShadeParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: ClassicShadeStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const d = derive(p);
    const q = QUALITY[quality];
    const segs = circularSegments(quality, p);

    const { polygon, maxOverhangDeg } = buildProfile(p, d, q.wallStep);
    let body = s.add(Manifold.revolve(polygon, segs));

    const warp = radialWarp({
      style: p.style,
      count: p.patternCount,
      depth: p.ribDepth,
      twistDeg: p.twist,
      zRange: [0, d.H],
      fade: { top: Math.min(15, d.H * 0.25) },
    });
    if (warp) body = s.swap(body, body.warp(warp));

    // Belt-loop tunnels on ±Y.
    const loops = [s.add(beltLoop(k, p, d, segs, +1)), s.add(beltLoop(k, p, d, segs, -1))];
    const solid = s.add(Manifold.union([body, ...loops]));

    // Puck pocket (open to the ceiling side) and the light opening through the ledge.
    const pocket = s.add(
      s
        .add(Manifold.cylinder(d.pocketDepth + 1, d.rPocket, d.rPocket, segs))
        .translate([0, 0, d.zFloor]),
    );
    const hole = s.add(
      s
        .add(Manifold.cylinder(d.zTop - d.zHoleBottom + 2, d.rHole, d.rHole, segs))
        .translate([0, 0, d.zHoleBottom - 1]),
    );
    // Cable slot through the housing wall on +X, from the pocket floor to the top.
    const cable = s.add(
      s
        .add(Manifold.cube([d.rBoss - d.rPocket + 4, p.cableSlotWidth, d.pocketDepth + 1], false))
        .translate([d.rPocket - 2, -p.cableSlotWidth / 2, d.zFloor]),
    );

    let result = s.add(Manifold.difference([solid, pocket, hole, cable]));

    // Fit-test mode: keep only the housing ring, cut where the ledge has grown into
    // a solid annulus so it stands on the bed by itself, and drop it to z = 0.
    let zOffset = 0;
    if (p.fitTest === 'yes') {
      const zCut = fitTestCut(p, d);
      const keep = s.add(
        s
          .add(Manifold.cube([400, 400, d.zTop - zCut + 2], true))
          .translate([0, 0, zCut + (d.zTop - zCut + 2) / 2]),
      );
      const ring = s.add(result.intersect(keep));
      result = s.add(ring.translate([0, 0, -zCut]));
      zOffset = -zCut;
    }

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: ClassicShadeStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      maxOverhangDeg: Math.max(maxOverhangDeg, 90 - p.shoulderAngle, 45),
      derived: { ...d, zOffset },
    };
    return { manifold: s.keep(result), stats };
  });
}
