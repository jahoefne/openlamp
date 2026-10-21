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
 *
 * The light decides the core (see assembly/lights):
 * - a puck: the pocket in the housing (above);
 * - a bulb: the housing is the lampholder's skirt, standing on the light face
 *   inside the shade collar's bore with an air annulus around it; the plate
 *   with the lampholder's hole sits on the skirt (its inside rises at 45° to
 *   the hole), the chamber above it (the cable, the M10 nut's recess) under
 *   the mount face, Ø6 vents through the shoulder above the annulus;
 * - a strip: a wide flat disc inside the collar's bore with the ring channel
 *   opening on the light face, a rim and a flange over the collar's slot to
 *   the ring, and a boss in the middle for the mount face.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type {
  BulbInsert,
  ClosedMountFace,
  HubMountFace,
  HubParams,
  PuckInsert,
  StrapMountFace,
  StripInsert,
} from '../../model/parts.ts';
import { collarJoint } from '../joints/index.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';
import {
  M10_NUT_RECESS,
  VENT_DIAMETER,
  bulbVentCutters,
  lightInsertCutters,
  nutRecessCutter,
  pressFitPuckZ,
  puckCrushRibs,
  puckDims,
  puckPressFitCutters,
  STRIP_DISC_GAP,
  stripBossSlotHeight,
  stripCableCutters,
} from './lightInserts.ts';
import {
  closedFeatureRadius,
  closedTopCutters,
  closedTopFeatures,
  closedTopLayout,
  closedTopOutline,
  cordBossDims,
  mountFaceFeatures,
  mountFaceHeight,
  strapExtent,
  type ClosedTopDims,
} from './mountFaces.ts';

const DEG = Math.PI / 180;
/** Free space above the shade collar inside the hub, mm. */
export const HUB_COLLAR_HEADROOM = 0.5;
/** Large enough to stand in for infinity in the profile booleans, mm. */
const FAR = 1e4;
/** Radius of the pocket in a strip hub's boss (the cable, the cord's knot), at least, mm. */
const STRIP_POCKET = 8;

/** Derived dimensions of the hub, in its print frame (= world for hanging lamps). */
export type HubDerived = {
  /** The pocket (puck), the chamber above the plate (bulb), the boss's pocket (strip). */
  rPocket: number;
  /** The housing around it: the puck boss, the bulb's skirt, the strip's boss. */
  rBoss: number;
  /** The light opening (puck), the lampholder's hole (bulb), the pocket's opening (strip). */
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
  /** Where the outer cone meets the housing (a strip: where the boss leaves the disc). */
  zBossStart: number;
  /** The inner cone meets the light opening here (a bulb: the plate's underside; a strip: 0). */
  zHoleBottom: number;
  /** The puck rests here (under an open mount face; the bottom of the pocket otherwise); a bulb's chamber floor (the plate's top). */
  zFloor: number;
  /** Top of the housing: the mount face of the strap, the base of the roof of a closed face. */
  zTop: number;
  /** The underside of the light: the puck in its pocket, the bulb's tip (below the light face), the strip in its channel. */
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
  /** Bulb hubs: the plate's underside, the skirt (outside; inside at the bed), the vents' circle and count. */
  zPlate?: number;
  rSkirt?: number;
  rSkirtInner?: number;
  rVent?: number;
  ventCount?: number;
  /** Strip hubs: the disc (radius, thickness over the channel and inside it), the channel, the rim's top. */
  rDisc?: number;
  discThickness?: number;
  innerThickness?: number;
  rChannelInner?: number;
  rChannelOuter?: number;
  zChannel?: number;
  zRimTop?: number;
};

export interface HubStats extends GeometryStats {
  derived: HubDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveHub(p: HubParams): HubDerived {
  const insert = p.insert;
  switch (insert.kind) {
    case 'puck':
      return derivePuckHub(p, insert);
    case 'bulb':
      return deriveBulbHub(p, insert);
    case 'strip':
      return deriveStripHub(p, insert);
  }
}

type TopLayout = Pick<
  HubDerived,
  'zApex' | 'zRoofBase' | 'rFeature' | 'zFeatureBase' | 'zFace' | 'hubHeight'
>;

/** The top of the hub: flat at `zTop` under the strap, else the closed face's roof and feature. */
function topLayout(face: HubMountFace, dims: ClosedTopDims): TopLayout {
  if (face.kind !== 'strap') return closedTopLayout(face, dims);
  const { zTop } = dims;
  return {
    zApex: zTop,
    zRoofBase: zTop,
    rFeature: 0,
    zFeatureBase: zTop,
    zFace: zTop,
    hubHeight: zTop,
  };
}

function derivePuckHub(p: HubParams, insert: PuckInsert): HubDerived {
  const { rPocket, rHole, pocketDepth } = puckDims(insert);
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
  const zFloor = Math.max(zHoleBottom + insert.ledgeThickness, zTopMin - pocketDepth);
  const zTop = zFloor + pocketDepth;
  const face = p.mountFace;
  const top = topLayout(face, { rPocket, rBoss, zTop, zBossStart, wall: p.wallThickness });
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
    zPuck: face.kind === 'strap' ? zFloor : pressFitPuckZ(insert, zTop),
    zFace: top.zFace,
    hubHeight: top.hubHeight,
    zApex: top.zApex,
    zRoofBase: top.zRoofBase,
    rFeature: top.rFeature,
    zFeatureBase: top.zFeatureBase,
  };
}

/**
 * A bulb's hub: the skirt is the housing (the shoulder cone climbs from the
 * ring all the way in to it), the plate on top of the skirt at `skirtHeight`,
 * the chamber above it up to the housing's top. The bulb hangs from the
 * light face (z 0) by its length.
 */
function deriveBulbHub(p: HubParams, insert: BulbInsert): HubDerived {
  const rBoss = insert.skirtDiameter / 2;
  const rPocket = rBoss - insert.wall;
  const rHole = insert.holeDiameter / 2;
  const L = p.joint.length;
  const rRingOut = p.collar.seatRadius;
  const m = Math.tan(p.shoulderAngle * DEG);
  const kOuter = L + m * rRingOut;
  const kInner = kOuter - p.wallThickness * Math.sqrt(1 + m * m);
  const zBossStart = kOuter - m * rBoss;
  const zPlate = insert.skirtHeight;
  const zFloor = zPlate + insert.plateThickness;
  const nut = insert.fitting === 'm10Nipple' ? M10_NUT_RECESS.depth : 0;
  const zTop = Math.max(zBossStart + Math.max(1, mountFaceHeight(p.mountFace)), zFloor + nut + 1);
  const top = topLayout(p.mountFace, { rPocket, rBoss, zTop, zBossStart, wall: p.wallThickness });
  const collarInnerRadius = p.collar.ringInnerRadius;
  return {
    rPocket,
    rBoss,
    rHole,
    pocketDepth: zTop - zFloor,
    collarInnerRadius,
    ringOuterRadius: rRingOut,
    ringHeight: L,
    m,
    kOuter,
    kInner,
    zBossStart,
    zHoleBottom: zPlate,
    zFloor,
    zTop,
    zPuck: -insert.height,
    ...top,
    zPlate,
    rSkirt: rBoss,
    // The skirt's inside rises at 45° to the hole; it starts at the bed when the hole is small.
    rSkirtInner: Math.min(rPocket, rHole + zPlate),
    // Midway between the skirt and the ring's bore, inside the air annulus.
    rVent: (rBoss + collarInnerRadius) / 2,
    ventCount: insert.vents,
  };
}

/**
 * A strip's hub: the disc inside the shade collar's bore (thick over the
 * channel, thin inside it), its rim up to a flange over the collar's slot,
 * the boss in the middle with a pocket open to the light face.
 */
function deriveStripHub(p: HubParams, insert: StripInsert): HubDerived {
  const face = p.mountFace;
  const t = insert.wall;
  const L = p.joint.length;
  const rRingOut = p.collar.seatRadius;
  const m = Math.tan(p.shoulderAngle * DEG);
  const kOuter = L + m * rRingOut;
  const kInner = kOuter - p.wallThickness * Math.sqrt(1 + m * m);
  const rDisc = p.collar.radius - p.collar.wall - STRIP_DISC_GAP;
  const rChannelInner = insert.ringDiameter / 2;
  const zChannel = insert.channelDepth;
  const discThickness = zChannel + t;
  const innerThickness = t;
  const rPocket =
    face.kind === 'cordBoss' ? Math.max(STRIP_POCKET, cordBossDims(face).rKnot + 1) : STRIP_POCKET;
  const rBoss = Math.max(
    rPocket + t,
    face.kind === 'strap' ? strapExtent(face, 0).x + 2 : closedFeatureRadius(face) + 1,
  );
  const zRimTop = Math.max(L + HUB_COLLAR_HEADROOM + t, discThickness);
  const zTop =
    face.kind === 'strap'
      ? Math.max(innerThickness + mountFaceHeight(face), zRimTop)
      : Math.max(zRimTop, innerThickness + stripBossSlotHeight(insert) + 1);
  const top = topLayout(face, {
    rPocket,
    rBoss,
    zTop,
    zBossStart: innerThickness,
    wall: t,
  });
  return {
    rPocket,
    rBoss,
    rHole: rPocket,
    pocketDepth: zTop,
    collarInnerRadius: p.collar.ringInnerRadius,
    ringOuterRadius: rRingOut,
    ringHeight: L,
    m,
    kOuter,
    kInner,
    zBossStart: innerThickness,
    zHoleBottom: 0,
    zFloor: 0,
    zTop,
    // The strip is stuck to the channel's ceiling.
    zPuck: zChannel - insert.height,
    ...top,
    rDisc,
    discThickness,
    innerThickness,
    rChannelInner,
    rChannelOuter: rChannelInner + insert.channelWidth,
    zChannel,
    zRimTop,
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
    const insert = p.insert;
    let built: Manifold;
    switch (insert.kind) {
      case 'puck':
        built =
          face.kind === 'strap'
            ? openHub(k, p, insert, face, d, segs, quality)
            : closedHub(k, p, insert, face, d, segs, quality);
        break;
      case 'bulb':
        built = bulbHub(k, p, insert, d, segs, quality);
        break;
      case 'strip':
        built = stripHub(k, p, insert, d, segs, quality);
        break;
    }
    const result = s.add(built);

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
      // ceiling, the crush ribs, a bulb skirt's inside and the cable slots'
      // gables are 45°; the cone is 90° − angle. (A strip hub's channel
      // ceiling and collar slot are bridges, not overhangs.)
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
  insert: PuckInsert,
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

    const cutters = lightInsertCutters(k, insert, d, segs).map((m) => s.add(m));
    const female = ringCutters(k, p, d, segs, quality).map((m) => s.add(m));
    return s.keep(s.add(Manifold.difference([solid, ...cutters, ...female])));
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
  insert: PuckInsert,
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

    const pocket = puckPressFitCutters(k, d, insert.cableWidth, segs).map((m) => s.add(m));
    const roof = closedTopCutters(k, face, d, d, segs, quality).map((m) => s.add(m));
    const female = ringCutters(k, p, d, segs, quality).map((m) => s.add(m));
    const cut = s.add(Manifold.difference([solid, ...pocket, ...roof, ...female]));
    const ribs = puckCrushRibs(k, insert, d).map((m) => s.add(m));
    return s.keep(ribs.length > 0 ? s.add(Manifold.union([cut, ...ribs])) : cut);
  });
}

// ---------------------------------------------------------------- bulb

/**
 * The bulb hub's revolve profile: the hub's envelope (ring, shoulder cone up
 * to the skirt, housing, top) minus the air annulus around the skirt (the
 * hub's cavity outside the skirt) and the lampholder: the skirt's inside
 * (rising at 45° to the hole), the hole through the plate, the chamber above
 * it (leaving the M10 nut's boss). `cavity` is the annulus, for the strap's
 * belt loops.
 */
function bulbProfile(
  k: Kernel,
  d: HubDerived,
  insert: BulbInsert,
  inset: number,
  top: readonly Vec2[],
  closed: boolean,
): { body: Vec2[][]; cavity: Vec2[][] } {
  return scoped(k, (s) => {
    const { CrossSection } = k;
    const L = d.ringHeight;
    const rect = (r0: number, r1: number, z0: number, z1: number) =>
      s.add(s.add(CrossSection.square([r1 - r0, z1 - z0], false)).translate([r0, z0]));
    const outer = s.add(
      new CrossSection([
        [[0, 0], [d.ringOuterRadius, 0], [d.ringOuterRadius, L], [d.rBoss, d.zBossStart], ...top],
      ]),
    );
    // The hub's cavity (inside the ring's bore, under the inner cone, the
    // collar's room), outside the skirt: the air annulus.
    const rBore = d.collarInnerRadius - inset;
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
    const bore = rect(-1, rBore, -1, FAR);
    const collarRoom = rect(-1, rBore, -1, L + HUB_COLLAR_HEADROOM);
    const cavity = s.add(
      CrossSection.union(s.add(CrossSection.intersection(bore, underCone)), collarRoom),
    );
    const annulus = s.add(CrossSection.difference(cavity, rect(-1, d.rBoss, -2, FAR)));
    // The lampholder: the skirt's inside (vertical, then 45° in to the hole), the hole, the chamber.
    const zPlate = d.zPlate ?? 0;
    const rIn = d.rSkirtInner ?? d.rPocket;
    const zCone = zPlate - (rIn - d.rHole);
    const skirtInside = s.add(
      new CrossSection([
        [
          [-1, -1],
          [rIn, -1],
          [rIn, zCone],
          [d.rHole, zPlate],
          [-1, zPlate],
        ],
      ]),
    );
    const hole = rect(-1, d.rHole, zPlate - 1, d.zFloor + 1);
    let chamber = rect(-1, d.rPocket, d.zFloor, closed ? d.zTop - 0.25 : d.zTop + 1);
    if (insert.fitting === 'm10Nipple') {
      const rNutBoss = M10_NUT_RECESS.diameter / 2 + M10_NUT_RECESS.wall;
      chamber = s.add(
        CrossSection.difference(
          chamber,
          rect(-1, rNutBoss, d.zFloor - 1, d.zFloor + M10_NUT_RECESS.depth),
        ),
      );
    }
    const cut = s.add(CrossSection.union([annulus, skirtInside, hole, chamber]));
    return {
      body: s.add(CrossSection.difference(outer, cut)).toPolygons(),
      cavity: annulus.toPolygons(),
    };
  });
}

/**
 * The hub around a bulb's lampholder: the revolved profile, the mount face's
 * features, the roof's cutters (closed faces), the vents, the M10 nut's
 * recess and the shade joint's female cutters. The caller owns the result.
 */
function bulbHub(
  k: Kernel,
  p: HubParams,
  insert: BulbInsert,
  d: HubDerived,
  segs: number,
  quality: Quality,
): Manifold {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const face = p.mountFace;
    const joint = collarJoint(p.joint.type);
    const top: Vec2[] =
      face.kind === 'strap'
        ? [
            [d.rBoss, d.zTop],
            [0, d.zTop],
          ]
        : closedTopOutline(d, d.rBoss);
    const profile = bulbProfile(k, d, insert, joint.bodyInset, top, face.kind !== 'strap');
    const body = s.add(Manifold.revolve(profile.body, segs));
    let features: Manifold[];
    if (face.kind === 'strap') {
      const cavity = s.add(Manifold.revolve(profile.cavity, segs));
      features = mountFaceFeatures(k, face, d, segs).map((m) =>
        s.add(Manifold.difference(s.add(m), cavity)),
      );
    } else {
      features = closedTopFeatures(k, face, d, segs, quality).map((m) => s.add(m));
    }
    const solid = s.add(Manifold.union([body, ...features]));

    const r = VENT_DIAMETER / 2;
    const vents = bulbVentCutters(
      k,
      insert,
      {
        rVent: d.rVent ?? d.rBoss,
        z0: d.ringHeight + HUB_COLLAR_HEADROOM,
        // Out above the shoulder's outer cone over the vent's inner edge.
        z1: d.kOuter - d.m * ((d.rVent ?? d.rBoss) - r) + 1,
      },
      segs,
    );
    const cutters = [
      ...(face.kind === 'strap' ? [] : closedTopCutters(k, face, d, d, segs, quality)),
      ...vents,
      ...(insert.fitting === 'm10Nipple' ? [nutRecessCutter(k, d.zFloor)] : []),
      ...ringCutters(k, p, d, segs, quality),
    ].map((m) => s.add(m));
    return s.keep(s.add(Manifold.difference([solid, ...cutters])));
  });
}

// ---------------------------------------------------------------- strip

/**
 * The strip hub's revolve profile: the ring, a short shoulder up to the
 * rim's top (a flange over the collar's slot), down the rim to the disc
 * (thick over the channel, thin inside it), up the boss to its top; minus the
 * collar's slot and the ring channel, both opening on the light face.
 */
function stripProfile(k: Kernel, d: HubDerived, inset: number, top: readonly Vec2[]): Vec2[][] {
  return scoped(k, (s) => {
    const { CrossSection } = k;
    const L = d.ringHeight;
    const rect = (r0: number, r1: number, z0: number, z1: number) =>
      s.add(s.add(CrossSection.square([r1 - r0, z1 - z0], false)).translate([r0, z0]));
    const t = d.innerThickness ?? 0;
    const rDisc = d.rDisc ?? d.rBoss;
    const zRim = d.zRimTop ?? d.zTop;
    const discT = d.discThickness ?? t;
    const rimInner = rDisc - t;
    const rStep = Math.min(rimInner - 0.5, Math.max((d.rChannelInner ?? rDisc) - t, d.rBoss + 0.5));
    const rShoulder = Math.max(d.ringOuterRadius - (zRim - L) / d.m, rimInner + 0.5);
    const outer = s.add(
      new CrossSection([
        [
          [0, 0],
          [d.ringOuterRadius, 0],
          [d.ringOuterRadius, L],
          [rShoulder, zRim],
          [rimInner, zRim],
          [rimInner, discT],
          [rStep, discT],
          [rStep, t],
          [d.rBoss, t],
          ...top,
        ],
      ]),
    );
    const slot = rect(rDisc, d.collarInnerRadius - inset, -1, L + HUB_COLLAR_HEADROOM);
    const channel = rect(d.rChannelInner ?? 0, d.rChannelOuter ?? 0, -1, d.zChannel ?? 0);
    const cut = s.add(CrossSection.union(slot, channel));
    return s.add(CrossSection.difference(outer, cut)).toPolygons();
  });
}

/**
 * The hub around a strip ring: the revolved profile, the mount face's
 * features, the boss's pocket (open to the light face) and roof, the cable's
 * slots and the shade joint's female cutters. The caller owns the result.
 */
function stripHub(
  k: Kernel,
  p: HubParams,
  insert: StripInsert,
  d: HubDerived,
  segs: number,
  quality: Quality,
): Manifold {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const face = p.mountFace;
    const joint = collarJoint(p.joint.type);
    const closed = face.kind !== 'strap';
    const top: Vec2[] =
      face.kind === 'strap'
        ? [
            [d.rBoss, d.zTop],
            [0, d.zTop],
          ]
        : closedTopOutline(d, d.rBoss);
    const body = s.add(Manifold.revolve(stripProfile(k, d, joint.bodyInset, top), segs));
    const t = d.innerThickness ?? 0;
    // The strap's belt loops stand on the disc: trim them along a 45° line through the boss's foot.
    const features =
      face.kind === 'strap'
        ? mountFaceFeatures(
            k,
            face,
            { rBoss: d.rBoss, zTop: d.zTop, kInner: t + d.rBoss, m: 1 },
            segs,
          )
        : closedTopFeatures(k, face, d, segs, quality);
    const solid = s.add(Manifold.union([body, ...features.map((m) => s.add(m))]));

    const top0 = closed ? d.zTop - 0.25 : d.zTop + 1;
    const pocket = s.add(
      s.add(Manifold.cylinder(top0 + 1, d.rPocket, d.rPocket, segs)).translate([0, 0, -1]),
    );
    const cutters = [
      ...(face.kind === 'strap' ? [] : closedTopCutters(k, face, d, d, segs, quality)),
      ...stripCableCutters(
        k,
        insert,
        {
          rChannel: d.rChannelInner ?? 0,
          zChannel: d.zChannel ?? 0,
          discThickness: d.discThickness ?? t,
          innerThickness: t,
          rPocket: d.rPocket,
          rBoss: d.rBoss,
        },
        closed,
      ),
      ...ringCutters(k, p, d, segs, quality),
    ].map((m) => s.add(m));
    return s.keep(s.add(Manifold.difference([solid, pocket, ...cutters])));
  });
}
