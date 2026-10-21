/**
 * The weighted base of the standing lamp (part kind `base`), shown as it
 * stands (it prints top face down, so the pocket and the groove face up):
 *
 *          ▼ screw pockets for the stem's flange      ▼ cable bore
 *      ╭───┸──────────────────┬─────┬──────────────────┸───╮  top face, 45° chamfer
 *      │      ┌──────────────┐│     │┌──────────────┐      │
 *      │      │ weight pocket││ ┃ ┃ ││    pocket     │      │
 *      │      │   ═══lid═══  ││ ┃ ┃ ││   ═══lid═══   │      │
 *   ═══╧══════╧══════════════╧┘ ┗━┛ └╧═══════════════╧══════╧═══ floor
 *                      cable groove ─────────────────────► rim notch (+x)
 *
 * A revolve of the disc (flat top, 45° chamfer), minus an annular weight
 * pocket open to the floor (minus a solid spoke along +x that carries the
 * cable groove from the central bore out through the rim, and, for a screwed
 * lid, minus tapping bosses above the lid), the groove, the bore, heat-set
 * pockets (or tapping holes) for the stem's flange with 45° drill-point ends,
 * and the lid's tapping holes. Built as it stands, then turned half a turn
 * about x onto its top face (a rotation, so the stem's screw positions and the
 * lid's bosses land where they belong in the world).
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import type { BaseParams } from '../../model/parts.ts';
import type { BASE_LIDS } from '../../schema/defs.ts';
import { M3, screwPattern, screwPositions } from '../joints/screw.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../kernel.ts';
import { QUALITY, type Quality } from '../quality.ts';

/** Width of the solid spoke through the weight pocket (the lid has a notch for it), mm. */
export const BASE_SPOKE_WIDTH = 14;
/** Material over the weight pocket (the top face), mm. */
export const BASE_TOP_SKIN = 3;
/** Outer wall around the weight pocket, mm. */
const BASE_WALL = 3;
/** Wall between the stem's screw pockets and the weight pocket, mm. */
const SCREW_WALL = 3;
/** Radius of the lid screws' tapping bosses in the pocket, mm. */
export const LID_BOSS_RADIUS = 4;
/** The snap lid's thickness, and the material a screwed lid keeps under its counterbores, mm. */
export const LID_THICKNESS = 3;
const LID_SCREW_FLOOR = 1.5;
/** Segments of the screw holes. */
const SCREW_SEGMENTS = 32;

type BaseLid = (typeof BASE_LIDS)[number];

/** Thickness of the lid of the weight pocket: 3 mm, or the screws' counterbore + 1.5 mm. Pure, no WASM. */
export function baseLidThickness(lid: BaseLid): number {
  return lid === 'screws'
    ? Math.max(LID_THICKNESS, M3.counterbore[1] + LID_SCREW_FLOOR)
    : LID_THICKNESS;
}

/** Derived dimensions of the base, in the frame it stands in (floor at z 0, top face at `H`). */
export type BaseDerived = {
  R: number;
  H: number;
  chamfer: number;
  /** The weight pocket: inner and outer radius, depth from the floor. */
  rIn: number;
  rOut: number;
  pocketDepth: number;
  /** The lid's thickness: the tapping bosses (screwed lid) end there. */
  lidThickness: number;
  rBore: number;
  /** The stem's screws: bolt circle radius, pocket radius and depth (insert or tapping hole). */
  screwRadius: number;
  screwPocketRadius: number;
  screwPocketDepth: number;
};

export interface BaseStats extends GeometryStats {
  derived: BaseDerived;
}

/**
 * The weight pocket's radii: inside, the central boss holds the stem's screw
 * pockets with a wall around them; outside, the base's wall (also under its
 * 45° chamfer). Pure, no WASM; the lid is sized from it.
 */
export function basePocketRadii(
  p: Pick<BaseParams, 'diameter' | 'height' | 'pocketDepth' | 'chamfer' | 'stemScrews'>,
): { rIn: number; rOut: number } {
  const R = p.diameter / 2;
  const screw = p.stemScrews.screw;
  const rScrew = (screw?.insertPocket?.[0] ?? M3.tapHole) / 2;
  const rIn = p.stemScrews.nominalDiameter / 2 + rScrew + SCREW_WALL;
  const rOut = Math.min(
    R - BASE_WALL,
    R + p.height - p.chamfer - p.pocketDepth - BASE_WALL * Math.SQRT2,
  );
  return { rIn, rOut };
}

/** All derived dimensions. Pure, no WASM. */
export function deriveBase(p: BaseParams): BaseDerived {
  const { rIn, rOut } = basePocketRadii(p);
  const screw = p.stemScrews.screw;
  return {
    R: p.diameter / 2,
    H: p.height,
    chamfer: p.chamfer,
    rIn,
    rOut,
    pocketDepth: p.pocketDepth,
    lidThickness: baseLidThickness(p.lid),
    rBore: p.boreDiameter / 2,
    screwRadius: p.stemScrews.nominalDiameter / 2,
    screwPocketRadius: (screw?.insertPocket?.[0] ?? M3.tapHole) / 2,
    screwPocketDepth: screw?.insertPocket?.[1] ?? M3.insertPocket[1],
  };
}

/** Bed footprint without building it. Pure, no WASM. */
export function baseFootprint(p: BaseParams): Footprint {
  return { x: p.diameter, y: p.diameter, z: p.height };
}

/**
 * Build the base in its print orientation (top face on the bed).
 * @param k  manifold-3d toplevel (after `setup()`)
 * @param params  resolved by `assemble()`
 * @param quality  mesh quality, `params.quality` unless given
 */
export function buildBase(
  k: Kernel,
  params: BaseParams,
  quality: Quality = params.quality,
): { manifold: Manifold; stats: BaseStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const p = params;
    const d = deriveBase(p);
    const segs = QUALITY[quality].segments;
    const { R, H, chamfer: c, rIn, rOut, pocketDepth: pd, lidThickness: t } = d;
    const box = (x: number, y: number, z: number, at: [number, number, number]) =>
      s.add(s.add(Manifold.cube([x, y, z], false)).translate(at));

    const outline: Vec2[] = [
      [0, 0],
      [R, 0],
      [R, H - c],
      [R - c, H],
      [0, H],
    ];
    const body = s.add(Manifold.revolve([outline], segs));

    // The weight pocket: an annulus open to the floor, minus the spoke along
    // +x, minus the screwed lid's bosses (they hang from the pocket's ceiling
    // down to the lid).
    const annulus = s.add(
      Manifold.revolve(
        [
          [
            [rIn, -1],
            [rOut, -1],
            [rOut, pd],
            [rIn, pd],
          ],
        ],
        segs,
      ),
    );
    const spokeW = p.cableGroove.spokeWidth;
    const spoke = box(R + 2, spokeW, pd + 4, [0, -spokeW / 2, -2]);
    const bosses = p.lidJoint
      ? screwPositions(p.lidJoint).map(([x, y]) =>
          s.add(
            s
              .add(Manifold.cylinder(pd - t + 1, LID_BOSS_RADIUS, LID_BOSS_RADIUS, SCREW_SEGMENTS))
              .translate([x, y, t]),
          ),
        )
      : [];
    const pocket = s.add(Manifold.difference([annulus, spoke, ...bosses]));

    const { width: gw, depth: gd } = p.cableGroove;
    const groove = box(R + 2, gw, gd + 1, [0, -gw / 2, -1]);
    const bore = s.add(
      s.add(Manifold.cylinder(H + 2, d.rBore, d.rBore, segs)).translate([0, 0, -1]),
    );

    // The stem's screw pockets, open at the top face, with 45° drill-point
    // ends (ceilings when printed top face down).
    const rp = d.screwPocketRadius;
    const drill = s.add(
      Manifold.revolve(
        [
          [
            [0, H - d.screwPocketDepth - rp],
            [rp, H - d.screwPocketDepth],
            [rp, H + 1],
            [0, H + 1],
          ],
        ],
        SCREW_SEGMENTS,
      ),
    );
    const screwPockets = screwPositions(p.stemScrews).map(([x, y]) =>
      s.add(drill.translate([x, y, 0])),
    );
    // The lid's tapping holes, up from the bosses' ends.
    const lidHoles = p.lidJoint
      ? screwPattern(k, p.lidJoint, 'female', {
          z: [t, H - BASE_TOP_SKIN],
          face: 'bottom',
          segs: SCREW_SEGMENTS,
        }).map((m) => s.add(m))
      : [];

    const standing = s.add(
      Manifold.difference([body, pocket, groove, bore, ...screwPockets, ...lidHoles]),
    );
    // Half a turn about x onto the top face.
    const result = s.add(s.add(standing.rotate([180, 0, 0])).translate([0, 0, H]));

    const bb = result.boundingBox();
    const volume = result.volume();
    const stats: BaseStats = {
      status: result.status(),
      triangles: result.numTri(),
      vertices: result.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      // The chamfer (at the bed) and the drill points are 45°; everything else
      // is vertical or faces up.
      maxOverhangDeg: 45,
      derived: d,
    };
    return { manifold: s.keep(result), stats };
  });
}
