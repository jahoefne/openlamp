/**
 * The wall plate of the wall lamp (part kind `wallPlate`): a canopy hung on
 * two screws, printed back face down (the wall on the bed, the room's "up"
 * along +y, the room along +z; see `WallPlateParams` for the frame):
 *
 *          ╭───────────╮          the front: closed, domed, its edge chamfered or rounded
 *        ╭─┤   ┌───┐   ├─╮        the socket boss on the front: the pivot's female
 *        │ │   │ ┊ │   │ │        side (teardrop bore, 45° seat cup at its top,
 *        │ ⊙   │ ┊ │   ⊙ │        `socket.seatY`), the knee's spigot turns in it
 *        │     │ ┊ │     │        two blind keyholes on the back, level, at the
 *        │     └─┴─┘     │        middle height, `keyholes.spacing` apart
 *        ╰───────┃───────╯        the cable: the socket's sump → a passage back →
 *                                 a groove in the back to the `cable.exit` edge
 *
 * The body is one hull of stacked slices of the outline (round, rounded
 * rectangle, stadium), each inset from the outline: the back slab, the edge
 * (one 45° step of `edgeSize`, or a quarter round of it), then the dome
 * rising `domeHeight` from the rim toward the middle. Every front surface
 * faces up.
 *
 * A keyhole, cut across its slot (print z up, the back face on the bed):
 *
 *              ╱╲                the head channel's 45° gable, its ridge at
 *            ╱    ╲              `keyholeTop`; the front skin above it stays ≥ 1.2
 *           │      │             the head channel (Ø9), up to `channelDepth`
 *       ────┘ ┌──┐ └────         the lip (`keyholeLip`) the screw's head hooks
 *       ══════╛  ╘══════         behind, the 4.5 slot through it, open to the wall
 *
 * Seen from the back the lip shows the head hole (Ø9, where the head goes in)
 * and the slot `keyholes.length` up from it to the screw's place (y 0); the
 * head channel above the lip runs the same way, so the plate slides down onto
 * the screws and hangs behind their heads. The back groove's ceiling is a
 * bridge (`cable.grooveWidth`); every other cut is vertical or a 45° roof:
 * the keyholes' gables, the teardrop bore, the seat cup.
 *
 * The pure functions here (`deriveWallPlate`, `wallPlateFootprint`,
 * `socketBossHeight`, the outline helpers, `plateProfile`) are frozen in the
 * fields they had at step 0: the wall arm's placement and normalisation read
 * them.
 */
import type { Footprint, GeometryStats, JointInterface } from '../../model/assembly.ts';
import type { CableExit, PlateOutline, WallPlateParams } from '../../model/parts.ts';
import { pivotDims, socketCutters } from '../features/pivot.ts';
import { scoped, type CrossSection, type Kernel, type Manifold, type Vec3 } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';

/** Material under the socket's sump, at the boss's bottom, mm. */
export const BOSS_FLOOR = 1.6;
/** Material between the back groove and the socket bore above it, mm. */
export const GROOVE_SKIN = 1.2;
/** Material between a keyhole and the plate's edge, mm. */
export const KEYHOLE_EDGE_WALL = 3;
/** The keyhole's head channel: at most this deep, mm … */
const CHANNEL_MAX_DEPTH = 3.5;
/** … leaving this skin in front of its roof and gable, mm. */
const CHANNEL_SKIN = 1.2;
/**
 * The keyhole's lip: the back skin the slot runs through, under the head
 * channel; the screw's head hooks behind it, so the plate cannot come off the
 * wall. At most half the channel's depth, mm.
 */
export const KEYHOLE_LIP = 1.6;
/** The wall exit's hole keeps this far from the bore's floor (it opens into the bore whole), mm. */
const WALL_HOLE_MARGIN = 0.5;
/** Slices of a rounded front edge (a quarter round), by quality. */
const EDGE_SLICES = { draft: 4, normal: 6, fine: 6 } as const satisfies Record<Quality, number>;
/** Slices of the dome, by quality. */
const DOME_SLICES = { draft: 8, normal: 12, fine: 16 } as const satisfies Record<Quality, number>;

/** The socket boss's height: the bore's depth plus its floor. Pure. */
export function socketBossHeight(pivot: JointInterface): number {
  return pivotDims(pivot).depth + BOSS_FLOOR;
}

/**
 * The socket axis's distance from the back face (print z): the back groove,
 * its skin, then the bore's radius. The same for every cable exit, so the
 * exit does not move the lamp. Pure.
 */
export function socketAxisZ(pivot: JointInterface, grooveDepth: number): number {
  return grooveDepth + GROOVE_SKIN + pivotDims(pivot).rBore;
}

/** The outline's half extents and corner radius (a round plate: `width` is its Ø). Pure. */
export function plateOutlineDims(
  outline: PlateOutline,
  width: number,
  height: number,
  cornerRadius: number,
): { halfWidth: number; halfHeight: number; cornerRadius: number } {
  const halfWidth = width / 2;
  const halfHeight = outline === 'round' ? width / 2 : height / 2;
  const r =
    outline === 'round'
      ? halfWidth
      : outline === 'stadium'
        ? Math.min(halfWidth, halfHeight)
        : Math.max(0.5, Math.min(cornerRadius, halfWidth - 0.5, halfHeight - 0.5));
  return { halfWidth, halfHeight, cornerRadius: r };
}

/**
 * Whether the point (x, y) of the print frame lies inside the outline inset
 * by `inset` (a rounded rectangle of half extents and corner radius; a round
 * plate and a stadium are rounded rectangles too). Pure.
 */
export function insideOutline(
  dims: { halfWidth: number; halfHeight: number; cornerRadius: number },
  x: number,
  y: number,
  inset: number,
): boolean {
  const hw = dims.halfWidth - inset;
  const hh = dims.halfHeight - inset;
  const r = Math.max(0, dims.cornerRadius - inset);
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > hw + 1e-9 || ay > hh + 1e-9) return false;
  const cx = hw - r;
  const cy = hh - r;
  if (ax <= cx || ay <= cy) return true;
  return Math.hypot(ax - cx, ay - cy) <= r + 1e-9;
}

/**
 * The widest keyhole spacing (whole mm) whose keyholes (head channels from
 * the screw's place at y 0 down to the head hole at −`length`, Ø
 * `headDiameter`) stay `KEYHOLE_EDGE_WALL` inside the outline; 0 if none fits. Pure.
 */
export function maxKeyholeSpacing(
  dims: { halfWidth: number; halfHeight: number; cornerRadius: number },
  keyholes: Pick<WallPlateParams['keyholes'], 'headDiameter' | 'length'>,
): number {
  const inset = keyholes.headDiameter / 2 + KEYHOLE_EDGE_WALL;
  const fits = (spacing: number) =>
    insideOutline(dims, spacing / 2, 0, inset) &&
    insideOutline(dims, spacing / 2, -keyholes.length, inset);
  let spacing = Math.floor(2 * dims.halfWidth);
  while (spacing > 0 && !fits(spacing)) spacing -= 1;
  return Math.max(0, spacing);
}

/** Derived dimensions of the plate, in its print frame (back face at z 0, centre at x = y = 0). */
export type WallPlateDerived = {
  halfWidth: number;
  halfHeight: number;
  cornerRadius: number;
  /** The front in the middle: `thickness + domeHeight`. */
  frontZ: number;
  /** The pivot: the bore's radius, the seat cup's rim, the boss's radius (around the teardrop bore). */
  rBore: number;
  rSeat: number;
  rBoss: number;
  /** The socket axis: x 0, z `socketZ`, along y. */
  socketZ: number;
  /** How far the bore's lowest line sinks below the rim's front face (`thickness`). */
  sink: number;
  /** The seat plane (the boss's top face), the bore's floor, the boss's bottom (print y). */
  seatY: number;
  floorY: number;
  bossBottomY: number;
  bossHeight: number;
  /** The passage's axis (print y): in the sump, from the bore back to the groove. */
  passageY: number;
  /** The keyholes: their x, the screw's place (the slot's upper end) and the head hole's centre (print y). */
  keyholeX: number;
  keyholeEndY: number;
  keyholeHeadY: number;
  /** The head channel's straight depth from the back face; its roof and gable above it. */
  channelDepth: number;
  /** The keyhole's lip under the head channel (the slot runs through it), from the back face. */
  keyholeLip: number;
  /** The ridge of the head channel's gable, from the back face. */
  keyholeTop: number;
  /** The wall exit's hole (cable exit `wall`): its centre (print y), on the socket axis's line x 0. */
  wallHoleY: number;
  /** The print height (bounding box top). */
  height: number;
};

export interface WallPlateStats extends GeometryStats {
  derived: WallPlateDerived;
}

/** All derived dimensions. Pure, no WASM. */
export function deriveWallPlate(p: WallPlateParams): WallPlateDerived {
  const outline = plateOutlineDims(p.outline, p.width, p.height, p.cornerRadius);
  const pv = pivotDims(p.socket.pivot);
  const socketZ = socketAxisZ(p.socket.pivot, p.cable.grooveDepth);
  const seatY = p.socket.seatY;
  const floorY = seatY - pv.depth;
  const bossBottomY = floorY - BOSS_FLOOR;
  const kh = p.keyholes;
  const roof = (kh.headDiameter - kh.slotWidth) / 2;
  const gable = kh.slotWidth / 2;
  const frontZ = p.thickness + p.domeHeight;
  const channelDepth = Math.max(
    0,
    Math.min(CHANNEL_MAX_DEPTH, p.thickness - roof - gable - CHANNEL_SKIN),
  );
  return {
    ...outline,
    frontZ,
    rBore: pv.rBore,
    rSeat: pv.rSeat,
    rBoss: pv.rBoss,
    socketZ,
    sink: p.thickness - (socketZ - pv.rBore),
    seatY,
    floorY,
    bossBottomY,
    bossHeight: seatY - bossBottomY,
    passageY: floorY + pv.sump / 2,
    keyholeX: kh.spacing / 2,
    keyholeEndY: 0,
    keyholeHeadY: -kh.length,
    channelDepth,
    keyholeLip: Math.min(KEYHOLE_LIP, channelDepth / 2),
    keyholeTop: channelDepth + roof + gable,
    wallHoleY: floorY + WALL_HOLE_MARGIN + p.cable.wallHole / 2,
    height: Math.max(frontZ, socketZ + pv.rBoss),
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function wallPlateFootprint(p: WallPlateParams): Footprint {
  const d = deriveWallPlate(p);
  return { x: 2 * d.halfWidth, y: 2 * d.halfHeight, z: d.height };
}

/**
 * The body's profile: the slices the hull is made of, each `[inset, z]` (how
 * far inside the outline, at which height), from the back face's rim up to
 * the dome's top. The back slab rises straight to the edge; a `chamfer` edge
 * is one 45° step of `edgeSize`, a `round` edge a quarter round of it in a
 * few slices; the dome then rises by `domeHeight` (a parabola in the inset)
 * until the outline closes in the middle. Pure.
 */
export function plateProfile(p: WallPlateParams, quality: Quality): [inset: number, z: number][] {
  const dims = plateOutlineDims(p.outline, p.width, p.height, p.cornerRadius);
  const dMax = Math.min(dims.halfWidth, dims.halfHeight);
  const t = p.thickness;
  const e = Math.max(0, Math.min(p.edgeSize, t - 0.5, dMax / 2));
  const out: [number, number][] = [[0, 0]];
  if (e <= 1e-9) {
    out.push([0, t]);
  } else if (p.edge === 'chamfer') {
    out.push([0, t - e], [e, t]);
  } else {
    const n = EDGE_SLICES[quality];
    for (let i = 0; i <= n; i++) {
      const phi = (Math.PI / 2) * (i / n);
      out.push([e - e * Math.cos(phi), t - e + e * Math.sin(phi)]);
    }
  }
  if (p.domeHeight > 1e-9) {
    const m = DOME_SLICES[quality];
    for (let j = 1; j <= m; j++) {
      const u = j / m;
      out.push([e + (dMax - e) * u, t + p.domeHeight * (1 - (1 - u) ** 2)]);
    }
  }
  return out;
}

/**
 * The outline inset by `inset`, as points around it (counter-clockwise,
 * `segs` per full circle of the corners; corners that close up repeat a
 * point, which a hull does not mind). Pure.
 */
function outlinePoints(
  dims: { halfWidth: number; halfHeight: number; cornerRadius: number },
  inset: number,
  segs: number,
): [number, number][] {
  const hw = Math.max(0, dims.halfWidth - inset);
  const hh = Math.max(0, dims.halfHeight - inset);
  const r = Math.min(Math.max(0, dims.cornerRadius - inset), hw, hh);
  const cx = hw - r;
  const cy = hh - r;
  const n = Math.max(1, Math.round(segs / 4));
  const out: [number, number][] = [];
  for (const [x0, y0, a0] of [
    [cx, cy, 0],
    [-cx, cy, 90],
    [-cx, -cy, 180],
    [cx, -cy, 270],
  ] as const) {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
      out.push([x0 + r * Math.cos(a), y0 + r * Math.sin(a)]);
    }
  }
  return out;
}

/**
 * Where the back groove ends, beyond the edge `exit` names (print frame). Left
 * and right are seen from the room: the room's +x is the print's −x, so
 * `left` runs toward −x. Pure.
 */
function grooveEnd(exit: Exclude<CableExit, 'wall'>, d: WallPlateDerived): [number, number] {
  switch (exit) {
    case 'bottom':
      return [0, -d.halfHeight - 1];
    case 'top':
      return [0, d.halfHeight + 1];
    case 'left':
      return [-d.halfWidth - 1, d.passageY];
    case 'right':
      return [d.halfWidth + 1, d.passageY];
  }
}

type Mat4 = Parameters<Manifold['transform']>[0];

/**
 * The pivot's joint frame → print: (x, y, z) ↦ (−x, z, y) at the seat point
 * (0, `seatY`, `socketZ`); the joint's +y (the teardrop's point) is the print's up.
 */
function jointToPrint(d: WallPlateDerived): Mat4 {
  return [-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, d.seatY, d.socketZ, 1];
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
    const dims = { halfWidth: d.halfWidth, halfHeight: d.halfHeight, cornerRadius: d.cornerRadius };

    /** The outline inset by `inset`, at height z, as points. */
    const slice = (inset: number, z: number): Vec3[] =>
      outlinePoints(dims, inset, segs).map(([x, y]): Vec3 => [x, y, z]);
    /** A disc of radius r centred at (x, y). */
    const disc = (r: number, x: number, y: number, n = small) =>
      s.add(s.add(CrossSection.circle(r, n)).translate([x, y]));
    /** A stadium of width 2r from (x0, y0) to (x1, y1). */
    const stadium = (r: number, x0: number, y0: number, x1: number, y1: number) =>
      s.add(CrossSection.hull([disc(r, x0, y0), disc(r, x1, y1)]));
    /** A prism of `section` from z0 to z1. */
    const prism = (section: CrossSection, z0: number, z1: number) =>
      s.add(s.add(section.extrude(z1 - z0)).translate([0, 0, z0]));

    // The body: the back slab, the edge and the dome, one hull of the slices.
    const body = s.add(
      Manifold.hull(plateProfile(p, quality).flatMap(([inset, z]) => slice(inset, z))),
    );

    // The socket boss: the socket's circle (an octagon with a flat to the
    // room, its flats on the circle) hulled with a rectangle as wide down into
    // the plate, along y from the boss's bottom to the seat plane; kept inside
    // the outline.
    const half = d.rBoss;
    const ring =
      p.profile === 'faceted'
        ? s.add(
            s
              .add(s.add(CrossSection.circle(half / Math.cos(Math.PI / 8), 8)).rotate(22.5))
              .translate([0, d.socketZ]),
          )
        : disc(half, 0, d.socketZ, segs);
    const flanks = s.add(s.add(CrossSection.square([2 * half, d.socketZ])).translate([-half, 0]));
    const section = s.add(CrossSection.hull([ring, flanks]));
    // Section (x, z) extruded along its z, turned so that runs along −y.
    const bossBar = s.add(
      s.add(s.add(section.extrude(d.bossHeight)).rotate([90, 0, 0])).translate([0, d.seatY, 0]),
    );
    const outline = s.add(Manifold.hull([...slice(0, -1), ...slice(0, d.height + 1)]));
    const boss = s.add(Manifold.intersection(bossBar, outline));

    const cutters: Manifold[] = [];

    // The keyholes, from the back only: the head hole and the slot through the
    // lip, the head channel over it with its 45° gable (a drop at each end, hulled).
    const kh = p.keyholes;
    const rHead = kh.headDiameter / 2;
    const lip = d.keyholeLip;
    const drop = s.add(
      Manifold.revolve(
        [
          [
            [0, lip],
            [rHead, lip],
            [rHead, d.channelDepth],
            [0, d.keyholeTop],
          ],
        ],
        small,
      ),
    );
    for (const x of [-d.keyholeX, d.keyholeX]) {
      cutters.push(
        prism(disc(rHead, x, d.keyholeHeadY), -1, lip + 0.01),
        prism(stadium(kh.slotWidth / 2, x, d.keyholeHeadY, x, d.keyholeEndY), -1, lip + 0.01),
        s.add(
          Manifold.hull([
            s.add(drop.translate([x, d.keyholeHeadY, 0])),
            s.add(drop.translate([x, d.keyholeEndY, 0])),
          ]),
        ),
      );
    }

    // The cable: from the sump straight back (vertical in print) into the
    // groove, or into the wall.
    const c = p.cable;
    if (c.exit === 'wall') {
      cutters.push(prism(disc(c.wallHole / 2, 0, d.wallHoleY), -1, d.socketZ));
    } else {
      const [ex, ey] = grooveEnd(c.exit, d);
      cutters.push(
        prism(stadium(c.grooveWidth / 2, 0, d.passageY, ex, ey), -1, c.grooveDepth),
        prism(disc(c.passage / 2, 0, d.passageY), -1, d.socketZ),
      );
    }

    // The socket: the teardrop bore (its point up), the seat cup, the lock.
    const pv = pivotDims(p.socket.pivot);
    const toPrint = jointToPrint(d);
    const socket = socketCutters(k, p.socket.pivot, {
      segs,
      point: [0, 1],
      ...(p.socket.lock === 'screw' ? { lock: { outerRadius: d.rBoss, z: -pv.length / 2 } } : {}),
    }).map((m) => s.add(m));
    for (const m of socket) cutters.push(s.add(m.transform(toPrint)));

    const result = s.add(Manifold.difference([s.add(Manifold.union(body, boss)), ...cutters]));
    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: WallPlateStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The keyholes' gables, the teardrop bore and the seat cup are 45°; the
      // groove's ceiling is a bridge; everything else is vertical or faces up.
      maxOverhangDeg: 45,
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
