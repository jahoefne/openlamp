/**
 * Mount faces: what a mount adds to the top of the hub (or of the fused
 * classic shade). The velcro strap first: two belt-loop tunnels on the ±Y
 * sides of the housing. Cord bosses and thread stubs join in M2.2.
 */
import type { MountFace, StrapMountFace } from '../../model/parts.ts';
import { scoped, type Kernel, type Manifold, type Vec3 } from '../kernel.ts';

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
  }
}

/** What a mount face unions onto the hub. The caller owns the results. */
export function mountFaceFeatures(
  k: Kernel,
  face: MountFace,
  d: HousingDims,
  segs: number,
): Manifold[] {
  return scoped(k, (s) => {
    switch (face.kind) {
      case 'strap':
        return [
          s.keep(s.add(beltLoop(k, face, d, segs, +1))),
          s.keep(s.add(beltLoop(k, face, d, segs, -1))),
        ];
    }
  });
}
