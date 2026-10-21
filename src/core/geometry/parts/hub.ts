/**
 * The hub: holds the light and hangs from the mount; the shade hangs from it.
 * Printed light-face-down (the collar ring on the bed), as the classic shade's
 * housing was:
 *
 *   mount face  ╔═╤═══════╤═╗  zTop: strap tunnels on ±Y (strap mount)
 *               ║ │ puck  │ ║  pocket, open to the mount face; cable slot on +X
 *               ║ └─┐   ┌─┘ ║  zFloor: ledge with the light opening
 *              ╱    │   │    ╲ the hub's own shoulder cone (≥ 45°)
 *             ╱             ╲
 *            ║ ring        ║   0 … L: the female ring of the shade joint
 *   z 0 ─────╨─────────────╨── collar plane: the shade's seat touches it
 *
 * Revolve of the profile (2D booleans, so no special cases), union of the mount
 * face's features, difference of the light insert's cutters and of the joint's
 * female cutters. Part kind `hub`.
 *
 * Every mount face but the strap's is *closed*: the housing then carries a 45°
 * roof (dome) with the mount's feature on its apex (a cord boss, a threaded
 * stub or a threaded bore, see mountFaces.ts), and the puck is pressed into
 * its pocket from the light face, held by crush ribs (lightInserts.ts).
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { ClosedMountFace, HubParams, StrapMountFace } from '../../model/parts.ts';
import { collarJoint } from '../joints/index.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';
import {
  lightInsertCutters,
  pressFitPuckZ,
  puckCrushRibs,
  puckDims,
  puckPressFitCutters,
} from './lightInserts.ts';
import {
  closedTopCutters,
  closedTopFeatures,
  closedTopLayout,
  closedTopOutline,
  mountFaceFeatures,
  mountFaceHeight,
  strapExtent,
} from './mountFaces.ts';

const DEG = Math.PI / 180;
/** Free space above the shade collar inside the hub, mm. */
export const HUB_COLLAR_HEADROOM = 0.5;
/** Large enough to stand in for infinity in the profile booleans, mm. */
const FAR = 1e4;

/** Derived dimensions of the hub, in its print frame (= world for hanging lamps). */
export type HubDerived = {
  rPocket: number;
  rBoss: number;
  rHole: number;
  pocketDepth: number;
  /** The ring's bore and outer radius. */
  collarInnerRadius: number;
  ringOuterRadius: number;
  /** Height of the ring (the joint length). */
  ringHeight: number;
  /** Shoulder cone slope dz/dr; outer cone z = kOuter − m·r, inner z = kInner − m·r. */
  m: number;
  kOuter: number;
  kInner: number;
  /** Where the outer cone meets the housing. */
  zBossStart: number;
  /** The inner cone meets the light opening here. */
  zHoleBottom: number;
  /** The puck rests here (under an open mount face; the bottom of the pocket otherwise). */
  zFloor: number;
  /** Top of the housing: the mount face of the strap, the base of the roof of a closed face. */
  zTop: number;
  /** The underside of the puck in its pocket. */
  zPuck: number;
  /** The mount face: where the mount (strap, cord, the mating part) meets the hub. */
  zFace: number;
  /** The top of the hub. */
  hubHeight: number;
  /** Closed faces (else `zTop` / 0): the roof's apex inside, where the outer roof starts, the feature's boss. */
  zApex: number;
  zRoofBase: number;
  rFeature: number;
  zFeatureBase: number;
};

export interface HubStats extends GeometryStats {
  derived: HubDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveHub(p: HubParams): HubDerived {
  const { rPocket, rHole, pocketDepth } = puckDims(p.insert);
  const rBoss = p.envelope.rCore;
  const L = p.joint.length;
  const rRingOut = p.collar.seatRadius;
  const m = Math.tan(p.shoulderAngle * DEG);
  // Outer cone from the top of the ring up to the housing; the inner cone is
  // the parallel line one wall thickness inside it.
  const kOuter = L + m * rRingOut;
  const kInner = kOuter - p.wallThickness * Math.sqrt(1 + m * m);
  const zBossStart = kOuter - m * rBoss;
  const zHoleBottom = kInner - m * rHole;
  // The housing must stand tall enough above the cone for the mount face (the
  // strap's tunnels must open above it); if not, the ledge grows thicker.
  const zTopMin = zBossStart + Math.max(1, mountFaceHeight(p.mountFace));
  const zFloor = Math.max(zHoleBottom + p.insert.ledgeThickness, zTopMin - pocketDepth);
  const zTop = zFloor + pocketDepth;
  const face = p.mountFace;
  const top =
    face.kind === 'strap'
      ? {
          zApex: zTop,
          zRoofBase: zTop,
          rFeature: 0,
          zFeatureBase: zTop,
          zFace: zTop,
          hubHeight: zTop,
        }
      : closedTopLayout(face, { rPocket, rBoss, zTop, zBossStart, wall: p.wallThickness });
  return {
    rPocket,
    rBoss,
    rHole,
    pocketDepth,
    collarInnerRadius: p.collar.ringInnerRadius,
    ringOuterRadius: rRingOut,
    ringHeight: L,
    m,
    kOuter,
    kInner,
    zBossStart,
    zHoleBottom,
    zFloor,
    zTop,
    zPuck: face.kind === 'strap' ? zFloor : pressFitPuckZ(p.insert, zTop),
    zFace: top.zFace,
    hubHeight: top.hubHeight,
    zApex: top.zApex,
    zRoofBase: top.zRoofBase,
    rFeature: top.rFeature,
    zFeatureBase: top.zFeatureBase,
  };
}

/** Bed footprint of the hub (its bounding box), without building it. Pure, no WASM. */
export function hubFootprint(p: HubParams): Footprint {
  const d = deriveHub(p);
  let x = d.ringOuterRadius;
  let y = d.ringOuterRadius;
  if (p.mountFace.kind === 'strap') {
    const loops = strapExtent(p.mountFace, d.rBoss);
    x = Math.max(x, loops.x);
    y = Math.max(y, loops.y);
  }
  return { x: 2 * x, y: 2 * y, z: d.hubHeight };
}

/**
 * The hub's revolve profile in the (r, z) plane (housing solid, the light
 * insert is cut later) and its cavity, which the mount face's features must
 * stay out of too. `top` is the outline above the housing wall, from
 * `(rBoss, …)` to the axis: the flat top of an open face, the roof of a closed one.
 */
function hubProfile(
  k: Kernel,
  d: HubDerived,
  inset: number,
  top: readonly Vec2[],
): { body: Vec2[][]; cavity: Vec2[][] } {
  return scoped(k, (s) => {
    const { CrossSection } = k;
    const L = d.ringHeight;
    const outer = s.add(
      new CrossSection([
        [[0, 0], [d.ringOuterRadius, 0], [d.ringOuterRadius, L], [d.rBoss, d.zBossStart], ...top],
      ]),
    );
    const rBore = d.collarInnerRadius - inset;
    // The cavity: inside the ring's bore and below the inner cone, plus the
    // room the shade collar needs (in case the cone dips below its top).
    const bore = s.add(s.add(CrossSection.square([rBore + 1, FAR], false)).translate([-1, -1]));
    const underCone = s.add(
      new CrossSection([
        [
          [-1, -FAR],
          [rBore + 1, -FAR],
          [rBore + 1, d.kInner - d.m * (rBore + 1)],
          [-1, d.kInner + d.m],
        ],
      ]),
    );
    const collarRoom = s.add(
      s
        .add(CrossSection.square([rBore + 1, L + HUB_COLLAR_HEADROOM + 1], false))
        .translate([-1, -1]),
    );
    const cavity = s.add(
      CrossSection.union(s.add(CrossSection.intersection(bore, underCone)), collarRoom),
    );
    return {
      body: s.add(CrossSection.difference(outer, cavity)).toPolygons(),
      cavity: cavity.toPolygons(),
    };
  });
}

/**
 * Build the hub.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildHub(
  k: Kernel,
  params: HubParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: HubStats } {
  return scoped(k, (s) => {
    const p = params;
    const d = deriveHub(p);
    const segs = QUALITY[quality].segments;
    const face = p.mountFace;
    const result = s.add(
      face.kind === 'strap'
        ? openHub(k, p, face, d, segs, quality)
        : closedHub(k, p, face, d, segs, quality),
    );

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: HubStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // Belt-loop chamfers, the bayonet groove, the roof, the knot cavity's
      // ceiling and the crush ribs are 45°; the cone is 90° − angle.
      maxOverhangDeg: Math.max(45, 90 - p.shoulderAngle),
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}

/** The female cutters of the shade joint in the hub's ring. The caller owns the results. */
function ringCutters(
  k: Kernel,
  p: HubParams,
  d: HubDerived,
  segs: number,
  quality: Quality,
): Manifold[] {
  const jointCtx = {
    rCollar: p.collar.radius,
    z: [0, d.ringHeight] as const,
    segs,
    quality,
  };
  return collarJoint(p.joint.type).femaleCutters(k, p.joint, jointCtx);
}

/** The hub under the strap: flat top, belt loops, the puck drops in from the top. The caller owns the result. */
function openHub(
  k: Kernel,
  p: HubParams,
  face: StrapMountFace,
  d: HubDerived,
  segs: number,
  quality: Quality,
): Manifold {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const joint = collarJoint(p.joint.type);
    const profile = hubProfile(k, d, joint.bodyInset, [
      [d.rBoss, d.zTop],
      [0, d.zTop],
    ]);
    const body = s.add(Manifold.revolve(profile.body, segs));
    // The mount face's features (belt loops) are trimmed by the whole cavity,
    // so they never reach into the room the shade collar needs.
    const cavity = s.add(Manifold.revolve(profile.cavity, segs));
    const features = mountFaceFeatures(k, face, d, segs).map((m) =>
      s.add(Manifold.difference(s.add(m), cavity)),
    );
    const solid = s.add(Manifold.union([body, ...features]));

    const insert = lightInsertCutters(k, p.insert, d, segs).map((m) => s.add(m));
    const female = ringCutters(k, p, d, segs, quality).map((m) => s.add(m));
    return s.keep(s.add(Manifold.difference([solid, ...insert, ...female])));
  });
}

/**
 * The hub under a closed face: the roof with the face's feature on its apex,
 * the press-fit pocket open to the light face, crush ribs. The caller owns
 * the result.
 */
function closedHub(
  k: Kernel,
  p: HubParams,
  face: ClosedMountFace,
  d: HubDerived,
  segs: number,
  quality: Quality,
): Manifold {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const joint = collarJoint(p.joint.type);
    const profile = hubProfile(k, d, joint.bodyInset, closedTopOutline(d, d.rBoss));
    const body = s.add(Manifold.revolve(profile.body, segs));
    const features = closedTopFeatures(k, face, d, segs, quality).map((m) => s.add(m));
    const solid = s.add(Manifold.union([body, ...features]));

    const insert = puckPressFitCutters(k, d, p.insert.cableWidth, segs).map((m) => s.add(m));
    const roof = closedTopCutters(k, face, d, d, segs, quality).map((m) => s.add(m));
    const female = ringCutters(k, p, d, segs, quality).map((m) => s.add(m));
    const cut = s.add(Manifold.difference([solid, ...insert, ...roof, ...female]));
    const ribs = puckCrushRibs(k, p.insert, d).map((m) => s.add(m));
    return s.keep(ribs.length > 0 ? s.add(Manifold.union([cut, ...ribs])) : cut);
  });
}
