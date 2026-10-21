/**
 * The wall plate of the wall lamp (part kind `wallPlate`), printed
 * back-face-down (the wall side on the bed, the room's "up" along +y):
 *
 *        ╭───────────────╮
 *        │       ⊙       │   keyhole: the wall screw sits at the slot's top end,
 *        │       │       │   its head in a channel on the back (45° roof up to the slot)
 *        │       ○       │   head hole Ø9
 *        │   ·   ◎   ·   │   centre: the arm's flange (4 heat-set pockets on its bolt
 *        │   ·  ╱    ·   │   circle) and the cable hole, from which a through slot …
 *        │      │⊙       │   … runs past the lower keyhole …
 *        │      │○       │
 *        ╰──────┘ └──────╯   … and out of the bottom edge (the cable notch)
 *
 * An extruded rounded rectangle with a 45° chamfer round its front face. The
 * plate's centre (x 0, y 0) is the flange's; keyholes sit on the vertical
 * centre line, `keyholes.spacing` apart (between the screws' final places, the
 * slots' top ends). The cable slot goes through the plate (so the cable lies
 * flush on the wall); `cableNotch.depth` is that cut from the back face, so it
 * equals the plate's thickness. Every cut is vertical or a 45° roof: no supports.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { WallPlateParams } from '../../model/parts.ts';
import { screwPattern } from '../joints/screw.ts';
import { scoped, type Kernel, type Manifold } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';

/** Material between the cable slot and a keyhole's channel (or the cable hole and a keyhole), mm. */
const CABLE_SLOT_WALL = 1.6;
/** Material between a keyhole and the plate's edge, mm. */
const EDGE_WALL = 3;
/** Material left in front of a keyhole channel's 45° roof, at the slot's edge, mm. */
const CHANNEL_FRONT = 1.2;
/** Straight part of a keyhole channel's wall, at most, mm (room for the screw head). */
const CHANNEL_MAX_DEPTH = 3.5;
/** Chamfer round the front face, mm. */
const FRONT_CHAMFER = 1;

type Keyholes = WallPlateParams['keyholes'];

/**
 * The keyhole spacings a plate of `height` allows: the upper keyhole's head
 * hole clear of the cable hole, the lower one's inside the plate. Pure, no WASM.
 */
export function keyholeSpacingLimits(
  height: number,
  keyholes: Omit<Keyholes, 'spacing'>,
  cableWidth: number,
): { min: number; max: number } {
  const below = keyholes.length + keyholes.headDiameter / 2;
  return {
    min: 2 * (below + cableWidth / 2 + CABLE_SLOT_WALL),
    max: height - 2 * (below + EDGE_WALL),
  };
}

/** Where the cable slot runs: from the centre hole at 45° to (xSlot, −xSlot), then straight down. */
export function cableSlotX(keyholes: Pick<Keyholes, 'headDiameter'>, cableWidth: number): number {
  return keyholes.headDiameter / 2 + CABLE_SLOT_WALL + cableWidth / 2;
}

/** Derived dimensions of the plate, in its print frame (back face at z 0). */
export type WallPlateDerived = {
  cornerRadius: number;
  chamfer: number;
  /** The keyholes' head hole centres and slot ends (the screws' places), upper and lower. */
  keyholeTop: number;
  keyholeTopHead: number;
  keyholeBottom: number;
  keyholeBottomHead: number;
  /** Straight wall of the keyhole channels; their 45° roof meets the slot at `channelTop`. */
  channelDepth: number;
  channelTop: number;
  /** The cable slot's vertical leg. */
  cableSlotX: number;
};

export interface WallPlateStats extends GeometryStats {
  derived: WallPlateDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveWallPlate(p: WallPlateParams): WallPlateDerived {
  const kh = p.keyholes;
  const roof = (kh.headDiameter - kh.slotWidth) / 2;
  const channelDepth = Math.max(0, Math.min(CHANNEL_MAX_DEPTH, p.thickness - roof - CHANNEL_FRONT));
  return {
    cornerRadius: Math.max(0.5, Math.min(p.cornerRadius, p.width / 2 - 0.5, p.height / 2 - 0.5)),
    chamfer: Math.min(FRONT_CHAMFER, p.thickness / 4),
    keyholeTop: kh.spacing / 2,
    keyholeTopHead: kh.spacing / 2 - kh.length,
    keyholeBottom: -kh.spacing / 2,
    keyholeBottomHead: -kh.spacing / 2 - kh.length,
    channelDepth,
    channelTop: channelDepth + roof,
    cableSlotX: cableSlotX(kh, p.cableNotch.width),
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function wallPlateFootprint(p: WallPlateParams): Footprint {
  return { x: p.width, y: p.height, z: p.thickness };
}

/**
 * Build the wall plate.
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildWallPlate(
  k: Kernel,
  params: WallPlateParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: WallPlateStats } {
  return scoped(k, (s) => {
    const { Manifold, CrossSection } = k;
    const p = params;
    const d = deriveWallPlate(p);
    const segs = QUALITY[quality].segments;
    const small = Math.max(32, segs / 4);
    const t = p.thickness;

    /** A rounded rectangle w × h with corner radius r, centred. */
    const roundedRect = (w: number, h: number, r: number) => {
      const c = s.add(CrossSection.circle(r, small));
      const corners = [-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => s.add(c.translate([sx * (w / 2 - r), sy * (h / 2 - r)]))),
      );
      return s.add(CrossSection.hull(corners));
    };
    /** A stadium of `width` from (x0, y0) to (x1, y1). */
    const stadium = (width: number, x0: number, y0: number, x1: number, y1: number) => {
      const c = s.add(CrossSection.circle(width / 2, small));
      return s.add(CrossSection.hull([s.add(c.translate([x0, y0])), s.add(c.translate([x1, y1]))]));
    };
    /** A prism of `section` from z0 to z1. */
    const prism = (section: ReturnType<typeof stadium>, z0: number, z1: number) =>
      s.add(s.add(section.extrude(z1 - z0)).translate([0, 0, z0]));

    // The plate, its front edge chamfered at 45°.
    const c = d.chamfer;
    const back = prism(roundedRect(p.width, p.height, d.cornerRadius), 0, t - c);
    const front = prism(
      roundedRect(p.width - 2 * c, p.height - 2 * c, Math.max(0.25, d.cornerRadius - c)),
      t - c,
      t,
    );
    const plate = s.add(Manifold.hull([back, front]));

    const cutters: Manifold[] = [];
    const kh = p.keyholes;
    for (const [end, head] of [
      [d.keyholeTop, d.keyholeTopHead],
      [d.keyholeBottom, d.keyholeBottomHead],
    ] as const) {
      // Through: the head hole and the slot above it.
      cutters.push(
        prism(stadium(kh.headDiameter, 0, head, 0, head), -1, t + 1),
        prism(stadium(kh.slotWidth, 0, head, 0, end), -1, t + 1),
      );
      // The head's channel on the back, its 45° roof rising to the slot's edges.
      const wide = prism(stadium(kh.headDiameter, 0, head, 0, end), -1, d.channelDepth);
      const narrow = prism(
        stadium(kh.slotWidth, 0, head, 0, end),
        d.channelTop - 0.01,
        d.channelTop,
      );
      cutters.push(s.add(Manifold.hull([wide, narrow])));
    }
    // The cable: a hole at the centre, at 45° past the lower keyhole, down and out.
    const w = p.cableNotch.width;
    const x = d.cableSlotX;
    const slot = s.add(
      CrossSection.union(stadium(w, 0, 0, x, -x), stadium(w, x, -x, x, -p.height / 2 - w)),
    );
    cutters.push(prism(slot, -1, Math.max(t, p.cableNotch.depth) + 1));
    // The arm's screws: heat-set pockets (or tapping holes) from the front.
    for (const m of screwPattern(k, p.armScrews, 'female', {
      z: [0, t],
      face: 'top',
      segs: small,
    })) {
      cutters.push(s.add(m));
    }
    const result = s.add(Manifold.difference([plate, ...cutters]));

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: WallPlateStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The keyhole channels' roofs are 45°; every other cut is vertical.
      maxOverhangDeg: 45,
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
