/**
 * Lamp shade geometry for the Bambu Lab LED Lamp Kit-001.
 *
 * The shade is one printable part, printed open end down:
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
 * All functions take the manifold-3d toplevel module as their first argument so
 * the same code runs in a web worker and in the Node CLI.
 */

import { QUALITY } from './params.js';

const DEG = Math.PI / 180;

/** Derived dimensions shared by the builder, the UI overlay and the README. */
export function derive(p) {
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

  return { rBot, rTop, H, t, m, rPocket, rBoss, rHole, pocketDepth, kOuter, kInner, zHoleBottom, zFloor, zTop, zShoulderOuter };
}

/** Outer wall radius as a function of u in [0,1] (0 = bottom, 1 = shoulder). */
function wallRadius(p, d, u) {
  const bulge = p.curve * 0.3 * d.rBot;
  return d.rBot + (d.rTop - d.rBot) * u + bulge * Math.sin(Math.PI * u);
}

/** Sample the outer wall and its inward offset, both bottom → top as [r, z]. */
function wallProfiles(p, d, wallStep) {
  const n = Math.max(8, Math.ceil(d.H / wallStep));
  const outer = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    outer.push([wallRadius(p, d, u), u * d.H]);
  }
  // Inward normal offset by wall thickness.
  const inner = [];
  let maxSlope = 0;
  for (let i = 0; i <= n; i++) {
    const a = outer[Math.max(0, i - 1)];
    const b = outer[Math.min(n, i + 1)];
    let tr = b[0] - a[0];
    let tz = b[1] - a[1];
    const len = Math.hypot(tr, tz) || 1;
    tr /= len; tz /= len;
    if (tz > 1e-9) maxSlope = Math.max(maxSlope, Math.abs(tr / tz));
    // Outward normal of a curve travelling upwards is (dz, -dr).
    const nr = tz, nz = -tr;
    inner.push([outer[i][0] - d.t * nr, outer[i][1] - d.t * nz]);
  }
  // Trim / extend the inner curve so it starts exactly on the bed (z = 0).
  let k = inner.findIndex((pt) => pt[1] >= 0);
  if (k <= 0) {
    const [a, b] = [inner[0], inner[1]];
    const s = (0 - a[1]) / ((b[1] - a[1]) || 1e-9);
    inner[0] = [a[0] + (b[0] - a[0]) * s, 0];
  } else {
    const a = inner[k - 1], b = inner[k];
    const s = (0 - a[1]) / ((b[1] - a[1]) || 1e-9);
    inner.splice(0, k, [a[0] + (b[0] - a[0]) * s, 0]);
  }
  return { outer, inner, maxOverhangDeg: Math.atan(maxSlope) / DEG };
}

/**
 * Build the revolve profile polygon as [x = r, y = z] points, counter-clockwise.
 * The housing is left solid here; the pocket and light opening are cut later
 * with cylinders so the belt loops can fuse into it first.
 */
function buildProfile(p, d, wallStep) {
  const { outer, inner, maxOverhangDeg } = wallProfiles(p, d, wallStep);
  const { m, kInner, rTop, H, rBoss, zTop, zShoulderOuter } = d;

  // Where does the inner shoulder cone (z + m r = kInner) meet the inner wall?
  // Scan from the top down for the first point below the line.
  let cut = -1;
  for (let i = inner.length - 1; i >= 0; i--) {
    if (inner[i][1] + m * inner[i][0] < kInner) { cut = i; break; }
  }
  let innerKept, kUsed = kInner;
  if (cut >= 0 && cut < inner.length - 1) {
    const a = inner[cut], b = inner[cut + 1];
    const fa = a[1] + m * a[0] - kInner;
    const fb = b[1] + m * b[0] - kInner;
    const s = fa / (fa - fb);
    innerKept = inner.slice(0, cut + 1);
    innerKept.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]);
  } else {
    // Very flat shade: start the roof cone at the lowest point of the inner wall.
    let best = 0, bestV = Infinity;
    inner.forEach((pt, i) => { const v = pt[1] + m * pt[0]; if (v < bestV) { bestV = v; best = i; } });
    innerKept = inner.slice(0, best + 1);
    kUsed = bestV;
  }
  const apexZ = kUsed; // inner cone reaches the axis here (removed by the light opening cut)

  const pts = [];
  for (const pt of outer) pts.push(pt);
  pts.push([rBoss, zShoulderOuter]);
  pts.push([rBoss, zTop]);
  pts.push([0, zTop]);
  pts.push([0, apexZ]);
  for (let i = innerKept.length - 1; i >= 0; i--) pts.push(innerKept[i]);
  return { polygon: pts, maxOverhangDeg, kUsed };
}

function smoothstep(e0, e1, x) {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
}

/** Vertex warp that applies ribs / facets / twist to the wall only. */
function makeWarp(p, d) {
  const n = Math.max(1, Math.round(p.patternCount));
  const twist = p.twist * DEG;
  const fade = Math.min(15, d.H * 0.25);
  const style = p.style;
  if (style === 'smooth' && Math.abs(twist) < 1e-9) return null;
  if (style === 'smooth') return null; // twist is meaningless on a smooth surface
  return (v) => {
    const z = v[2];
    if (z >= d.H) return;
    const a = z > d.H - fade ? 1 - smoothstep(d.H - fade, d.H, z) : 1;
    if (a <= 0) return;
    const r = Math.hypot(v[0], v[1]);
    if (r < 1e-6) return;
    const theta = Math.atan2(v[1], v[0]) + twist * (z / d.H);
    let newR = r;
    if (style === 'ribbed') {
      newR = r + a * (p.ribDepth / 2) * Math.cos(n * theta);
    } else if (style === 'faceted') {
      const sector = (2 * Math.PI) / n;
      let th = theta % sector; if (th < 0) th += sector;
      const f = 1 / Math.cos(th - sector / 2); // flats stay at r, corners move out
      newR = r * (1 + a * (f - 1));
    }
    const s = newR / r;
    v[0] *= s; v[1] *= s;
  };
}

function circularSegments(p) {
  const base = QUALITY[p.quality].segments;
  if (p.style === 'smooth') return base;
  const n = Math.max(1, Math.round(p.patternCount));
  const perPattern = p.style === 'ribbed' ? 8 : 6;
  return Math.ceil(Math.max(base, n * perPattern) / n) * n;
}

/**
 * Build one belt-loop tunnel bracket on the ±Y side of the housing, with its
 * strap channel already cut, ready to be unioned onto the body.
 */
function beltLoop(wasm, p, d, segs, sign) {
  const { Manifold } = wasm;
  const { rBoss, zTop, kInner, m } = d;
  const wx = p.strapWidth / 2 + p.loopWall;
  const crescent = rBoss - Math.sqrt(Math.max(0, rBoss * rBoss - wx * wx)) + 0.6;
  const yIn = rBoss - crescent;
  const yOut = rBoss + p.strapThickness + p.loopWall;
  const zLoopBottom = zTop - p.loopLength;
  const zChamfer = zLoopBottom - (yOut - yIn); // 45° chamfer under the loop
  const pts = [];
  for (const x of [-wx, wx]) {
    pts.push([x, yIn, zTop], [x, yOut, zTop], [x, yOut, zLoopBottom], [x, yIn, zChamfer]);
  }
  let bracket = Manifold.hull(pts);
  // Remove anything that would poke through the roof into the shade cavity.
  const rc = rBoss + 40;
  const cavity = Manifold.cylinder(m * rc, rc, 0, segs).translate([0, 0, kInner - m * rc]);
  // The strap channel is cut from the bracket only, so it can never nick the
  // thin shoulder shell below the tunnel.
  const slot = Manifold.cube([p.strapWidth, p.strapThickness, p.loopLength + (yOut - yIn) + 2], false)
    .translate([-p.strapWidth / 2, rBoss, zChamfer - 1]);
  const cut = Manifold.difference([bracket, cavity, slot]);
  bracket.delete(); cavity.delete(); slot.delete();
  if (sign < 0) { const m2 = cut.mirror([0, 1, 0]); cut.delete(); return m2; }
  return cut;
}

/**
 * Build the complete shade.
 * @param wasm  manifold-3d toplevel (after `setup()`)
 * @param params  normalized parameters (see params.js)
 * @returns {{manifold: Manifold, stats: object}}
 */
export function buildShade(wasm, params) {
  const { Manifold } = wasm;
  const p = params;
  const d = derive(p);
  const q = QUALITY[p.quality];
  const segs = circularSegments(p);

  const { polygon, maxOverhangDeg } = buildProfile(p, d, q.wallStep);
  let body = Manifold.revolve(polygon, segs);

  const warp = makeWarp(p, d);
  if (warp) { const w = body.warp(warp); body.delete(); body = w; }

  // Belt-loop tunnels on ±Y.
  const loops = [beltLoop(wasm, p, d, segs, +1), beltLoop(wasm, p, d, segs, -1)];
  let solid = Manifold.union([body, ...loops]);
  body.delete(); loops.forEach((l) => l.delete());

  // Puck pocket (open to the ceiling side) and the light opening through the ledge.
  const pocket = Manifold.cylinder(d.pocketDepth + 1, d.rPocket, d.rPocket, segs).translate([0, 0, d.zFloor]);
  const hole = Manifold.cylinder(d.zTop - d.zHoleBottom + 2, d.rHole, d.rHole, segs).translate([0, 0, d.zHoleBottom - 1]);
  // Cable slot through the housing wall on +X, from the pocket floor to the top.
  const cable = Manifold.cube([d.rBoss - d.rPocket + 4, p.cableSlotWidth, d.pocketDepth + 1], false)
    .translate([d.rPocket - 2, -p.cableSlotWidth / 2, d.zFloor]);

  let result = Manifold.difference([solid, pocket, hole, cable]);
  [solid, pocket, hole, cable].forEach((x) => x.delete());

  // Fit-test mode: keep only the housing ring, cut where the ledge has grown into
  // a solid annulus so it stands on the bed by itself, and drop it to z = 0.
  let zOffset = 0;
  if (p.fitTest === 'yes') {
    const zCut = d.zFloor - p.ledgeThickness - 3;
    const keep = Manifold.cube([400, 400, d.zTop - zCut + 2], true).translate([0, 0, zCut + (d.zTop - zCut + 2) / 2]);
    const ring = result.intersect(keep);
    result.delete(); keep.delete();
    result = ring.translate([0, 0, -zCut]);
    ring.delete();
    zOffset = -zCut;
  }

  const bb = result.boundingBox();
  const volume = result.volume();
  const stats = {
    status: result.status(),
    triangles: result.numTri(),
    vertices: result.numVert(),
    volumeMm3: volume,
    estGramsPla: (volume / 1000) * 1.24,
    size: { x: bb.max[0] - bb.min[0], y: bb.max[1] - bb.min[1], z: bb.max[2] - bb.min[2] },
    maxOverhangDeg: Math.max(maxOverhangDeg, 90 - p.shoulderAngle, 45),
    housingDiameter: 2 * d.rBoss,
    totalHeight: d.zTop,
    pocketDiameter: 2 * d.rPocket,
    pocketDepth: d.pocketDepth,
    zOffset,
    derived: d,
  };
  return { manifold: result, stats };
}
