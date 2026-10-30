/**
 * The wall arm's vertical pivot, shared by the wall plate's socket boss, the
 * knee and a swing elbow's socket boss (see `PivotSpec` in model/assembly.ts):
 *
 *      ┌──────────┐      the male's body (the caller's), over …
 *       ╲        ╱       … the 45° shoulder cone, resting on …
 *   ════╗╲      ╱╔════   seat plane (z 0): … the female's 45° seat cup
 *       ║ │    │ ║       spigot (Ø nominalDiameter) in the bore (+ tolerance)
 *       ║ │    │ ║
 *       ║ └────┘ ║       the spigot's end (z −length), 1 mm of play …
 *       ║        ║ ←──   … and the sump (the cable comes in from the side)
 *       ╚════════╝       the bore's floor (z −depth)
 *
 * Everything here is in the pivot's joint frame: origin on the axis in the
 * seat plane, z up out of the socket. The female's part prints with this
 * axis horizontal, so its bore is a teardrop pointing at the print's "up"
 * (`point`), and the lock pocket runs along that direction too (vertical in
 * print).
 */
import type { JointInterface, PivotSpec } from '../../model/assembly.ts';
import { M3, screwPattern } from '../joints/screw.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../kernel.ts';
import { teardropToward } from './teardrop.ts';

/** Wall of a socket boss around its teardrop bore: boss radius = bore radius · √2 + this. */
export const SOCKET_WALL = 2.5;

/** The pivot's radii and depths (pure, no WASM). */
export interface PivotDims {
  /** The spigot's radius (`nominalDiameter / 2`). */
  rSpigot: number;
  /** The female bore's radius: spigot + tolerance. */
  rBore: number;
  /** The seat cup's radius at the seat plane: bore + seat (the 45° cone `r = rSeat + z`). */
  rSeat: number;
  /** A socket boss around a teardrop bore: `rBore·√2 + SOCKET_WALL`. */
  rBoss: number;
  /** The spigot's length below the seat plane. */
  length: number;
  /** The female bore's depth below the seat plane. */
  depth: number;
  /** The seat cup's depth (= width). */
  seat: number;
  /** The cable's room at the bottom of the bore. */
  sump: number;
}

function pivotOf(iface: JointInterface): PivotSpec {
  if (!iface.pivot) throw new Error(`Joint ${iface.id} has no pivot parameters`);
  return iface.pivot;
}

/** The pivot's radii and depths. Pure, no WASM. */
export function pivotDims(iface: JointInterface): PivotDims {
  const p = pivotOf(iface);
  const rSpigot = iface.nominalDiameter / 2;
  const rBore = rSpigot + iface.tolerance;
  return {
    rSpigot,
    rBore,
    rSeat: rBore + p.seat,
    rBoss: rBore * Math.SQRT2 + SOCKET_WALL,
    length: iface.length,
    depth: p.depth,
    seat: p.seat,
    sump: p.sump,
  };
}

export interface SpigotOptions {
  /** Segments around a full circle. */
  segs: number;
  /**
   * The shoulder cone widens at 45° from the spigot to this radius (default
   * `rSeat`, where it meets the seat plane); it rests on the seat cup from
   * z −seat to 0.
   */
  rTop?: number;
  /** A cylinder of `rTop` continues the shoulder up to this height (default: the cone's top). */
  top?: number;
}

/**
 * The pivot's male side: the round spigot from z −`length` up to its 45°
 * shoulder cone `r = rSeat + z` (from the spigot's radius, at
 * z −(seat + tolerance), out to `rTop`), optionally continued as a cylinder
 * up to `top`. No cable bore (the caller cuts its own). The caller owns the result.
 */
export function spigot(k: Kernel, iface: JointInterface, opts: SpigotOptions): Manifold {
  const d = pivotDims(iface);
  const rTop = Math.max(d.rSpigot, opts.rTop ?? d.rSeat);
  const zShoulder = d.rSpigot - d.rSeat; // −(seat + tolerance)
  const zCone = rTop - d.rSeat;
  const top = Math.max(zCone, opts.top ?? zCone);
  const outline: Vec2[] = [
    [0, -d.length],
    [d.rSpigot, -d.length],
    [d.rSpigot, zShoulder],
    [rTop, zCone],
    ...(top > zCone + 1e-9 ? [[rTop, top] as Vec2] : []),
    [0, top],
  ];
  return k.Manifold.revolve([outline], opts.segs);
}

export interface SocketOptions {
  /** Segments around a full circle. */
  segs: number;
  /**
   * The print's "up" in the joint frame's xy-plane (a unit vector): the bore
   * becomes a teardrop pointing there. Absent: a round bore.
   */
  point?: readonly [number, number];
  /** The seat cup's cone continues this far above the seat plane, into the air (default 1). */
  above?: number;
  /**
   * An M3 grub screw's heat-set insert pocket (Ø4 × 6) from the boss's
   * surface `outerRadius` from the axis, along `point` (vertical in print),
   * at height `z`, and a Ø3.4 hole on into the bore.
   */
  lock?: { outerRadius: number; z: number };
}

/** A single M3 screw on the axis, for `screwPattern`. */
const LOCK_SCREW: JointInterface = {
  id: 'pivotLock',
  type: 'screw',
  nominalDiameter: 0,
  length: 0,
  tolerance: 0,
  screw: {
    count: 1,
    hole: M3.hole,
    counterbore: [M3.hole, 0],
    insertPocket: [M3.insertPocket[0], M3.insertPocket[1]],
  },
  male: 'pivotLock',
  female: 'pivotLock',
};

/**
 * The pivot's female side, to subtract from a socket boss whose top face is
 * the seat plane: the bore (round, or a teardrop toward `point`) from the
 * floor (z −depth) up, the 45° seat cup (`r = rSeat + z` from z −seat,
 * continued `above` into the air) and the lock pocket. The caller owns the
 * results.
 */
export function socketCutters(k: Kernel, iface: JointInterface, opts: SocketOptions): Manifold[] {
  return scoped(k, (s) => {
    const { Manifold, CrossSection } = k;
    const d = pivotDims(iface);
    const point = opts.point ?? ([0, 1] as const);
    const above = opts.above ?? 1;
    const section = opts.point
      ? s.add(teardropToward(k, d.rBore, opts.segs, opts.point))
      : s.add(CrossSection.circle(d.rBore, opts.segs));
    // The bore reaches a little into the cup, so the two cutters overlap.
    const boreTop = -d.seat + 0.01;
    const bore = s.add(s.add(section.extrude(boreTop + d.depth)).translate([0, 0, -d.depth]));
    const cup = s.add(
      s
        .add(Manifold.cylinder(d.seat + above, d.rBore, d.rSeat + above, opts.segs))
        .translate([0, 0, -d.seat]),
    );
    const out = [bore, cup];
    if (opts.lock) {
      const { outerRadius, z } = opts.lock;
      const small = Math.max(32, opts.segs / 4);
      const ctx = { z: [0, outerRadius] as const, face: 'top' as const, segs: small };
      const pieces = [
        ...screwPattern(k, LOCK_SCREW, 'female', ctx),
        ...screwPattern(k, LOCK_SCREW, 'male', ctx),
      ].map((m) => s.add(m));
      // Local z (out of the axis) → the joint frame's `point`, at height z.
      const angle = (Math.atan2(point[1], point[0]) * 180) / Math.PI;
      for (const m of pieces) {
        out.push(s.add(s.add(m.rotate([0, 90, angle])).translate([0, 0, z])));
      }
    }
    return out.map((m) => s.keep(m));
  });
}
