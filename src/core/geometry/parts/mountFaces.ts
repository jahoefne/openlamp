/**
 * Mount faces: what a mount adds to the top of the hub (or of the fused
 * classic shade).
 *
 * - `strap` (open): two belt-loop tunnels on the ±Y sides of the housing; the
 *   puck drops into its pocket from the top and the strap holds it in.
 * - closed faces: a 45° roof (dome) over the pocket, printable without
 *   support, with the mount's feature on its apex; the puck is pressed into
 *   its pocket from the light face instead (lightInserts.ts):
 *
 *            ┌─┐ ┌─┐  zFace     cord boss: hole Ø cord + 1 …
 *            │ └─┘ │
 *            │ ╱‾╲ │            … over the knot cavity (45° ceiling), open below
 *          ╱ │     │ ╲          threadMale: a hollow threaded stub on a shoulder at zFace
 *        ╱  ╱       ╲  ╲        threadFemale: a threaded bore down from zFace
 *      ╱  ╱   dome    ╲  ╲      the roof: 45° outside and inside
 *   ══╪══╧════════════╧══╪══ zTop (housing): the pocket below, puck pressed up against the dome
 */
import type {
  ClosedMountFace,
  CordBossMountFace,
  MountFace,
  StrapMountFace,
} from '../../model/parts.ts';
import { threadJoint } from '../joints/thread.ts';
import { scoped, type Kernel, type Manifold, type Vec2, type Vec3 } from '../kernel.ts';
import type { Quality } from '../quality.ts';

/** The housing the mount face sits on; the fused shade's `derive()` has the same fields. */
export interface HousingDims {
  /** Outer radius of the housing (the puck boss). */
  rBoss: number;
  /** The mount face. */
  zTop: number;
  /** The inner shoulder cone below the housing: z + m·r = kInner. */
  kInner: number;
  m: number;
}

type StrapDims = Pick<StrapMountFace, 'strapWidth' | 'strapThickness' | 'loopLength' | 'loopWall'>;

/**
 * One belt-loop tunnel bracket on the ±Y side of the housing, with its strap
 * channel already cut, ready to be unioned onto the body. The caller owns it.
 */
export function beltLoop(
  k: Kernel,
  p: StrapDims,
  d: HousingDims,
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
    // Remove anything that would poke through the roof into the cavity below.
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

/** Half-extents of the strap's belt loops around the axis: along X, and along Y from the axis. */
export function strapExtent(p: StrapDims, rBoss: number): { x: number; y: number } {
  return { x: p.strapWidth / 2 + p.loopWall, y: rBoss + p.strapThickness + p.loopWall };
}

/** How far above the strap's tunnels must open over the hub's cone, mm. */
const STRAP_EXIT_CLEARANCE = 1;

/**
 * How tall the housing must stand above the point where the hub's shoulder
 * cone meets it, for this mount face: the strap's tunnels must open (their
 * lowest point on the housing wall is `loopLength + strapThickness +
 * loopWall` below the top) clear of the cone. Pure, no WASM.
 */
export function mountFaceHeight(face: MountFace): number {
  switch (face.kind) {
    case 'strap':
      return face.loopLength + face.strapThickness + face.loopWall + STRAP_EXIT_CLEARANCE;
    case 'cordBoss':
    case 'threadMale':
    case 'threadFemale':
      return 0; // the roof sits on top of the housing
  }
}

/** What the strap's mount face unions onto the hub (the belt loops). The caller owns the results. */
export function mountFaceFeatures(
  k: Kernel,
  face: StrapMountFace,
  d: HousingDims,
  segs: number,
): Manifold[] {
  return scoped(k, (s) => [
    s.keep(s.add(beltLoop(k, face, d, segs, +1))),
    s.keep(s.add(beltLoop(k, face, d, segs, -1))),
  ]);
}

// ---------------------------------------------------------------- closed faces

/** Knot cavity of the cord boss: Ø = this × cord, height = `KNOT_CAVITY_HEIGHT` × cord. */
export const KNOT_CAVITY_DIAMETER = 3.5;
export const KNOT_CAVITY_HEIGHT = 1.5;
/** Wall of the cord boss around the knot cavity, mm. */
const CORD_BOSS_WALL = 2.4;
/** Material above the knot cavity's ceiling (the hole's length), mm. */
const CORD_BOSS_TOP = 3;
/** The male stub's shoulder reaches this far beyond the thread's crest, mm. */
const STUB_SHOULDER = 3.5;
/** Wall of the female bore's boss beyond its countersink, mm. */
const BORE_BOSS_WALL = 2.4;
/** The female countersink reaches this far beyond the thread's crest (see joints/thread.ts). */
const COUNTERSINK_EXTRA = 1.5;
/** Material between the female bore's bottom and the dome below it, mm. */
const BORE_FLOOR = 2.5;
/** Thinnest wall a cable bore may leave in the male stub, mm. */
const STUB_MIN_WALL = 1.6;
/** Radial inset of a thread's body under its teeth (as joints/thread.ts). */
const THREAD_BODY_INSET = 0.3;

/** What a closed top is built on: the light pocket and the housing around it, in the hub's frame. */
export interface ClosedTopDims {
  rPocket: number;
  rBoss: number;
  /** Top of the housing (and of the pocket). */
  zTop: number;
  /** Where the hub's shoulder cone meets the housing. */
  zBossStart: number;
  /** Wall of the roof (the hub's wall thickness). */
  wall: number;
}

/** Heights and radii of a closed top. Pure, no WASM. */
export interface ClosedTopLayout {
  /** The inner roof (a 45° cone up from the pocket's rim) ends in this apex on the axis. */
  zApex: number;
  /** The outer roof leaves the housing wall here and rises at 45° … */
  zRoofBase: number;
  /** … to the feature's boss (radius `rFeature`), which starts at `zFeatureBase` … */
  rFeature: number;
  zFeatureBase: number;
  /** … and ends at the mount face: the boss top (cord boss, female bore's mouth) or the stub's shoulder. */
  zFace: number;
  /** The top of the hub (the male stub's end, else `zFace`). */
  hubHeight: number;
}

function threadOf(face: ClosedMountFace) {
  if (face.kind === 'cordBoss') return undefined;
  const t = face.joint.thread;
  if (!t) throw new Error(`Mount face joint ${face.joint.id} has no thread parameters`);
  return t;
}

/** The cord boss's hole and knot cavity. */
export function cordBossDims(face: CordBossMountFace): {
  rHole: number;
  rKnot: number;
  knotHeight: number;
} {
  const c = face.cordDiameter;
  return {
    rHole: (c + 1) / 2,
    rKnot: (KNOT_CAVITY_DIAMETER * c) / 2,
    knotHeight: KNOT_CAVITY_HEIGHT * c,
  };
}

/** The cable bore of a threaded face, kept clear of the male stub's wall. */
function cableBoreRadius(face: ClosedMountFace): number {
  if (face.kind === 'cordBoss') return cordBossDims(face).rHole;
  const r = (face.cableDiameter + 1) / 2;
  if (face.kind === 'threadMale') {
    return Math.min(r, face.joint.nominalDiameter / 2 - THREAD_BODY_INSET - STUB_MIN_WALL);
  }
  return r;
}

/** Ø of the hole a cable takes through a closed mount face (the cord hole, the stub's or the bore's cable bore). Pure. */
export function cableBoreDiameter(face: ClosedMountFace): number {
  return 2 * cableBoreRadius(face);
}

/**
 * The radius of a closed face's feature (the cord boss, the stub's shoulder,
 * the female bore's boss) before it is fitted to the housing: a housing
 * should be at least 1 mm wider. Pure, no WASM.
 */
export function closedFeatureRadius(face: ClosedMountFace): number {
  switch (face.kind) {
    case 'cordBoss':
      return cordBossDims(face).rKnot + CORD_BOSS_WALL;
    case 'threadMale':
      return face.joint.nominalDiameter / 2 + threadOf(face)!.depth + STUB_SHOULDER;
    case 'threadFemale': {
      const rBore = face.joint.nominalDiameter / 2 + face.joint.tolerance;
      return rBore + threadOf(face)!.depth + COUNTERSINK_EXTRA + BORE_BOSS_WALL;
    }
  }
}

/** The layout of a closed top. Pure, no WASM. */
export function closedTopLayout(face: ClosedMountFace, d: ClosedTopDims): ClosedTopLayout {
  const zApex = d.zTop + d.rPocket;
  // The outer roof stays one wall (perpendicular) above the inner one.
  const zRoofBase = Math.max(d.zBossStart + 0.5, zApex - d.rBoss + d.wall * Math.SQRT2);
  const roofAt = (r: number) => zRoofBase + (d.rBoss - r);
  let rFeature = closedFeatureRadius(face);
  let zFace: number;
  let stub = 0;
  switch (face.kind) {
    case 'cordBoss': {
      const { rHole, rKnot, knotHeight } = cordBossDims(face);
      // The cavity starts where the dome is as wide as it, its 45° ceiling narrows to the hole.
      const zCeiling = zApex - rKnot + knotHeight + (rKnot - rHole);
      zFace = zCeiling + CORD_BOSS_TOP;
      break;
    }
    case 'threadMale': {
      zFace = zApex + d.wall;
      stub = face.joint.length;
      break;
    }
    case 'threadFemale': {
      const t = threadOf(face)!;
      const rBore = face.joint.nominalDiameter / 2 + face.joint.tolerance;
      // The bore's bottom (plus the cutter's overrun) stays BORE_FLOOR above the dome.
      zFace = zApex - (rBore + t.depth) + face.joint.length + 0.5 + BORE_FLOOR;
      break;
    }
  }
  rFeature = Math.min(rFeature, d.rBoss - 1);
  const zFeatureBase = roofAt(rFeature);
  zFace = Math.max(zFace, zFeatureBase + 1);
  return { zApex, zRoofBase, rFeature, zFeatureBase, zFace, hubHeight: zFace + stub };
}

/** The hub profile's outline above the housing wall (after `(rBoss, zBossStart)`), to the axis. */
export function closedTopOutline(l: ClosedTopLayout, rBoss: number): Vec2[] {
  return [
    [rBoss, l.zRoofBase],
    [l.rFeature, l.zFeatureBase],
    [l.rFeature, l.zFace],
    [0, l.zFace],
  ];
}

/** The joint context of a threaded mount face. */
function faceJointCtx(face: ClosedMountFace, segs: number, quality: Quality) {
  const r = face.kind === 'cordBoss' ? 0 : face.joint.nominalDiameter / 2;
  const L = face.kind === 'cordBoss' ? 0 : face.joint.length;
  return { rCollar: r, z: [0, L] as const, segs, quality };
}

/**
 * What a closed face unions onto the hub's body: the male stub (its tube and
 * the threaded ring, from the shoulder at `zFace`). The caller owns the results.
 */
export function closedTopFeatures(
  k: Kernel,
  face: ClosedMountFace,
  l: ClosedTopLayout,
  segs: number,
  quality: Quality,
): Manifold[] {
  if (face.kind !== 'threadMale') return [];
  return scoped(k, (s) => {
    const { Manifold } = k;
    const ctx = faceJointCtx(face, segs, quality);
    const L = face.joint.length;
    const rTube = ctx.rCollar - THREAD_BODY_INSET;
    // The tube reaches 0.5 mm down into the boss for a clean union.
    const tube = s.add(
      s.add(Manifold.cylinder(L + 0.5, rTube, rTube, segs)).translate([0, 0, l.zFace - 0.5]),
    );
    const ring = s.add(threadJoint.male(k, face.joint, ctx));
    return [s.keep(tube), s.keep(s.add(ring.translate([0, 0, l.zFace])))];
  });
}

/**
 * What a closed top cuts: the dome over the pocket (a 45° cone from just
 * outside the pocket's rim to the apex) and the face's own cutters (the knot
 * cavity and the cord hole; the cable bore and the female thread). The caller
 * owns the results.
 */
export function closedTopCutters(
  k: Kernel,
  face: ClosedMountFace,
  l: ClosedTopLayout,
  d: Pick<ClosedTopDims, 'rPocket' | 'zTop'>,
  segs: number,
  quality: Quality,
): Manifold[] {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const out: Manifold[] = [];
    const cyl = (h: number, r0: number, r1: number, z: number) =>
      s.add(s.add(Manifold.cylinder(h, r0, r1, segs)).translate([0, 0, z]));
    // The dome: the 45° line through the pocket's rim at zTop, from 0.5 mm below it.
    const rDome = d.rPocket + 0.5;
    out.push(cyl(rDome, rDome, 0, d.zTop - 0.5));
    const rCable = cableBoreRadius(face);
    switch (face.kind) {
      case 'cordBoss': {
        const { rHole, rKnot, knotHeight } = cordBossDims(face);
        const z0 = l.zApex - rKnot;
        // The cavity (from inside the dome), its 45° ceiling, the hole through the top.
        out.push(cyl(knotHeight + 0.5, rKnot, rKnot, z0 - 0.5));
        const zCeiling = z0 + knotHeight;
        const rTip = rHole - 0.2;
        out.push(cyl(rKnot - rTip, rKnot, rTip, zCeiling));
        out.push(cyl(l.zFace + 1 - zCeiling, rHole, rHole, zCeiling));
        break;
      }
      case 'threadMale': {
        const z0 = l.zApex - rCable - 1;
        out.push(cyl(l.hubHeight + 1 - z0, rCable, rCable, z0));
        break;
      }
      case 'threadFemale': {
        const L = face.joint.length;
        // The female thread grows down from its mouth at zFace: the cutters are
        // built in the joint frame (mouth at 0, into the part along +z) and
        // turned half a turn about x (a rotation, so it stays right-handed).
        for (const cutter of threadJoint.femaleCutters(
          k,
          face.joint,
          faceJointCtx(face, segs, quality),
        )) {
          out.push(s.add(s.add(s.add(cutter).rotate([180, 0, 0])).translate([0, 0, l.zFace])));
        }
        // The dome may already open the bore's bottom wider than the cable needs.
        const zBottom = l.zFace - L;
        if (l.zApex - zBottom < rCable + 0.5) {
          const z0 = l.zApex - rCable - 1;
          out.push(cyl(zBottom + 0.5 - z0, rCable, rCable, z0));
        }
        break;
      }
    }
    return out.map((m) => s.keep(m));
  });
}
