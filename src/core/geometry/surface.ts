/**
 * Surface patterns applied to a revolved body as a vertex warp: ribs, facets
 * and a twist of the pattern along the height.
 */
import type { Vec3 } from 'manifold-3d';

const DEG = Math.PI / 180;

export const SURFACE_STYLES = ['smooth', 'ribbed', 'faceted'] as const;

export type SurfaceStyleName = (typeof SURFACE_STYLES)[number];

export function smoothstep(e0: number, e1: number, x: number): number {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
}

export interface RadialWarpOptions {
  readonly style: SurfaceStyleName;
  /** Ribs or facets around the circumference (rounded, at least 1). */
  readonly count: number;
  /** Peak-to-valley rib depth in mm (ribbed only). */
  readonly depth: number;
  /** Rotation of the pattern in degrees from the bottom to the top of `zRange`. */
  readonly twistDeg: number;
  /** Only vertices with `z0 <= z < z1` move, so parts above or below stay untouched. */
  readonly zRange: readonly [z0: number, z1: number];
  /** Lengths in mm over which the pattern fades in above z0 / out below z1 (smoothstep). */
  readonly fade?: { readonly bottom?: number; readonly top?: number };
}

/**
 * Vertex warp that moves vertices radially to form ribs or facets, or `null`
 * when the surface is smooth (a twist is meaningless on a smooth surface).
 * Ribs add `depth / 2 · cos(n θ)` to the radius; facets keep the flats at the
 * original radius and push the corners out.
 */
export function radialWarp(o: RadialWarpOptions): ((v: Vec3) => void) | null {
  if (o.style === 'smooth') return null;
  const n = Math.max(1, Math.round(o.count));
  const twist = o.twistDeg * DEG;
  const [z0, z1] = o.zRange;
  const span = z1 - z0;
  const fadeTop = o.fade?.top ?? 0;
  const fadeBottom = o.fade?.bottom ?? 0;
  const style = o.style;
  const halfDepth = o.depth / 2;
  return (v: Vec3) => {
    const z = v[2];
    if (z >= z1 || z < z0) return;
    let a = z > z1 - fadeTop ? 1 - smoothstep(z1 - fadeTop, z1, z) : 1;
    if (fadeBottom > 0 && z < z0 + fadeBottom) a *= smoothstep(z0, z0 + fadeBottom, z);
    if (a <= 0) return;
    const r = Math.hypot(v[0], v[1]);
    if (r < 1e-6) return;
    const theta = Math.atan2(v[1], v[0]) + twist * ((z - z0) / span);
    let newR: number;
    if (style === 'ribbed') {
      newR = r + a * halfDepth * Math.cos(n * theta);
    } else {
      const sector = (2 * Math.PI) / n;
      let th = theta % sector;
      if (th < 0) th += sector;
      const f = 1 / Math.cos(th - sector / 2); // flats stay at r, corners move out
      newR = r * (1 + a * (f - 1));
    }
    const s = newR / r;
    v[0] *= s;
    v[1] *= s;
  };
}
