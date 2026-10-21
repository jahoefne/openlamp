/**
 * Revolve profiles: an outer wall sampled from a radius function and its
 * inward offset by the wall thickness, both as [r, z] points bottom → top.
 */

const DEG = Math.PI / 180;

/** A point of a revolve profile: radius and height in mm. */
export type RZ = [r: number, z: number];

/** Number of wall intervals for a wall `height` mm tall sampled every `step` mm. */
export function profileSteps(height: number, step: number, min = 8): number {
  return Math.max(min, Math.ceil(height / step));
}

/** `n + 1` evenly spaced normalised heights 0, 1/n, …, 1. */
export function uniformSamples(n: number): number[] {
  const us: number[] = [];
  for (let i = 0; i <= n; i++) us.push(i / n);
  return us;
}

/**
 * Sample a wall `height` mm tall whose radius is `rOfU(u)` at the normalised
 * heights `us` (0 = bottom, 1 = top), bottom → top as [r, z].
 */
export function sampleProfile(
  rOfU: (u: number) => number,
  height: number,
  us: readonly number[],
): RZ[] {
  return us.map((u): RZ => [rOfU(u), u * height]);
}

/**
 * Offset a wall inwards along its normal by `t`, trimmed or extended so it
 * starts exactly on the bed (z = 0). Also returns the steepest overhang of the
 * wall, in degrees from vertical.
 */
export function offsetProfile(
  outer: readonly RZ[],
  t: number,
): { inner: RZ[]; maxOverhangDeg: number } {
  const n = outer.length - 1;
  // Indices into outer/inner below stay within 0..n, hence the non-null assertions.
  const inner: RZ[] = [];
  let maxSlope = 0;
  for (let i = 0; i <= n; i++) {
    const a = outer[Math.max(0, i - 1)]!;
    const b = outer[Math.min(n, i + 1)]!;
    const o = outer[i]!;
    let tr = b[0] - a[0];
    let tz = b[1] - a[1];
    const len = Math.hypot(tr, tz) || 1;
    tr /= len;
    tz /= len;
    if (tz > 1e-9) maxSlope = Math.max(maxSlope, Math.abs(tr / tz));
    // Outward normal of a curve travelling upwards is (dz, -dr).
    const nr = tz;
    const nz = -tr;
    inner.push([o[0] - t * nr, o[1] - t * nz]);
  }
  // Trim / extend the inner curve so it starts exactly on the bed (z = 0).
  const k = inner.findIndex((pt) => pt[1] >= 0);
  if (k <= 0) {
    const a = inner[0]!;
    const b = inner[1]!;
    const s = (0 - a[1]) / (b[1] - a[1] || 1e-9);
    inner[0] = [a[0] + (b[0] - a[0]) * s, 0];
  } else {
    const a = inner[k - 1]!;
    const b = inner[k]!;
    const s = (0 - a[1]) / (b[1] - a[1] || 1e-9);
    inner.splice(0, k, [a[0] + (b[0] - a[0]) * s, 0]);
  }
  return { inner, maxOverhangDeg: Math.atan(maxSlope) / DEG };
}
