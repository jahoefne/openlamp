/**
 * Printed threads by twist-extrusion: a 2D cam
 *
 *   r(θ) = rRoot + depth · tooth(θ / 2π)
 *
 * extruded along z while it turns by 360° per pitch. `tooth(u)` is a trapezoid
 * with flanks of `depth / pitch` of a turn each (45° flanks in the axial
 * section) and crest = root = `(1 − 2·depth/pitch) / 2`. The female cutter is
 * the same cam with `tolerance` added to both radii (not `CrossSection.offset`,
 * which adds vertices), extruded with the same twist and aligned divisions, so
 * the two sides match vertex for vertex.
 *
 * Right-hand thread: the crest follows the helix (r cos θ, r sin θ, pitch·θ/2π),
 * i.e. the section turns counter-clockwise (seen from +z) as z grows. The sign
 * of `twistDegrees` that gives this is settled by the handedness unit test.
 */
import type { JointInterface, ThreadSpec } from '../../model/assembly.ts';
import { scoped, type Kernel, type Manifold, type Vec2 } from '../kernel.ts';
import type { Quality } from '../quality.ts';
import type { JointBuilder, JointCtx } from './types.ts';

/**
 * `twistDegrees` per mm of thread, divided by 360 / pitch: +1 means manifold's
 * positive twist (counter-clockwise from +z) makes a right-hand thread.
 */
export const RIGHT_HAND_TWIST = 1;

/** Vertices of the cam (one turn). */
const CAM_VERTICES: Readonly<Record<Quality, number>> = { draft: 96, normal: 128, fine: 192 };
/** Degrees the section turns per extrusion division. */
const DEG_PER_DIVISION: Readonly<Record<Quality, number>> = { draft: 15, normal: 10, fine: 6 };

/** Radial inset of the collar tube / ring bore under the thread (see `JointBuilder.bodyInset`). */
const BODY_INSET = 0.3;
/** How far the male thread ring reaches into the collar tube below it. */
const TUBE_OVERLAP = 0.5;
/** Extra divisions the female cutter reaches past each end of the thread. */
const CUTTER_OVERRUN = 2;

function threadOf(iface: JointInterface): ThreadSpec {
  if (!iface.thread) throw new Error(`Joint ${iface.id} has no thread parameters`);
  return iface.thread;
}

/** tooth(u) for u in [0, 1): 0 on the root, 1 on the crest. */
function toothProfile(depth: number, pitch: number): { corners: number[]; at(u: number): number } {
  const f = Math.min(depth / pitch, 0.49);
  const flat = (1 - 2 * f) / 2;
  const corners = [0, flat, flat + f, 2 * flat + f];
  return {
    corners,
    at(u) {
      if (u < flat) return 0;
      if (u < flat + f) return (u - flat) / f;
      if (u < 2 * flat + f) return 1;
      return 1 - (u - 2 * flat - f) / f;
    },
  };
}

/**
 * The cam polygon, counter-clockwise, unrotated: the root starts at θ = 0, the
 * rising flank follows, then the crest and the falling flank. The vertices sit
 * on `n` even steps plus the four corners of the tooth, so male and female
 * (same `n`, other radius) share every vertex angle.
 */
export function threadCam(rRoot: number, depth: number, pitch: number, n: number): Vec2[] {
  const tooth = toothProfile(depth, pitch);
  const us = [...tooth.corners];
  for (let i = 0; i < n; i++) us.push(i / n);
  us.sort((a, b) => a - b);
  const unique = us.filter((u, i) => i === 0 || u - us[i - 1]! > 1e-9);
  return unique.map((u): Vec2 => {
    const r = rRoot + depth * tooth.at(u);
    const a = 2 * Math.PI * u;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
}

/** Extrusion divisions of a thread of `length`: their count and height. */
export function threadDivisions(
  iface: JointInterface,
  quality: Quality,
): { count: number; dz: number } {
  const { pitch } = threadOf(iface);
  const twist = (360 * iface.length) / pitch;
  const count = Math.max(1, Math.ceil(twist / DEG_PER_DIVISION[quality]));
  return { count, dz: iface.length / count };
}

/**
 * The twist-extruded cam between joint heights `z0` and `z1` (a whole number
 * of `dz` divisions): its section at joint height z is the cam turned by
 * `RIGHT_HAND_TWIST · 360 · z / pitch` degrees, so pieces extruded over
 * different ranges line up.
 */
export function threadSolid(
  k: Kernel,
  rRoot: number,
  thread: Pick<ThreadSpec, 'pitch' | 'depth'>,
  z0: number,
  divisions: number,
  dz: number,
  quality: Quality,
): Manifold {
  return scoped(k, (s) => {
    const { pitch, depth } = thread;
    const degPerMm = (RIGHT_HAND_TWIST * 360) / pitch;
    const height = divisions * dz;
    const cam = s.add(
      new k.CrossSection([threadCam(rRoot, depth, pitch, CAM_VERTICES[quality])]).rotate(
        degPerMm * z0,
      ),
    );
    const solid = s.add(cam.extrude(height, divisions - 1, degPerMm * height));
    return s.keep(s.add(solid.translate([0, 0, z0])));
  });
}

export const threadJoint: JointBuilder = {
  bodyInset: BODY_INSET,

  /**
   * The threaded ring on the collar (root at `rCollar`), its top end tapered at
   * 45° so the thread leads in.
   */
  male(k, iface, ctx: JointCtx) {
    return scoped(k, (s) => {
      const { Manifold } = k;
      const t = threadOf(iface);
      const { count, dz } = threadDivisions(iface, ctx.quality);
      const L = iface.length;
      const r = ctx.rCollar;
      const ring = s.add(threadSolid(k, r, t, 0, count, dz, ctx.quality));
      const bore = s.add(
        s
          .add(Manifold.cylinder(L + 2, r - BODY_INSET - TUBE_OVERLAP, undefined, ctx.segs))
          .translate([0, 0, -1]),
      );
      // Lead-in: a frustum whose wall meets the root at the top of the thread.
      const R = r + t.depth + 0.5;
      const leadIn = s.add(
        Manifold.revolve(
          [
            [
              [0, -1],
              [R, -1],
              [R, L - (R - r)],
              [r, L],
              [0, L],
            ],
          ],
          ctx.segs,
        ),
      );
      const male = s.add(Manifold.intersection(s.add(Manifold.difference(ring, bore)), leadIn));
      return s.keep(s.add(male.translate([0, 0, ctx.z[0]])));
    });
  },

  /** The cam + tolerance, a little longer than the thread, and a 45° countersink at the mouth. */
  femaleCutters(k, iface, ctx: JointCtx) {
    return scoped(k, (s) => {
      const { Manifold } = k;
      const t = threadOf(iface);
      const { count, dz } = threadDivisions(iface, ctx.quality);
      const rBore = ctx.rCollar + iface.tolerance;
      const cutter = s.add(
        threadSolid(k, rBore, t, -CUTTER_OVERRUN * dz, count + 2 * CUTTER_OVERRUN, dz, ctx.quality),
      );
      // 45° countersink: radius rBore + depth + 0.5 at the mouth.
      const rLow = rBore + t.depth + 1.5;
      const rHigh = rBore - 1;
      const sink = s.add(
        s.add(Manifold.cylinder(rLow - rHigh, rLow, rHigh, ctx.segs)).translate([0, 0, -1]),
      );
      return [cutter, sink].map((m) => s.keep(s.add(m.translate([0, 0, ctx.z[0]]))));
    });
  },
};
