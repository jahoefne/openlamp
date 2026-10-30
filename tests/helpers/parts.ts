/**
 * Helpers for part tests: build an assembly's parts with leak accounting,
 * measure sections and overhangs.
 */
import { expect } from 'vitest';
import { buildPart } from '../../src/core/geometry/build.ts';
import {
  dispose,
  liveObjects,
  scoped,
  type CrossSection,
  type Kernel,
  type Manifold,
} from '../../src/core/geometry/kernel.ts';
import type { Quality } from '../../src/core/geometry/quality.ts';
import type { Mat4, PartSpec, PartStats } from '../../src/core/model/assembly.ts';
import type { trackKernelObjects } from './kernel.ts';

export interface Built {
  part: PartSpec;
  manifold: Manifold;
  stats: PartStats;
}

/**
 * Build `parts`, run the checks, dispose, and assert that nothing leaked (by
 * the scope counter and by the kernel tracker).
 */
export function withBuilt(
  k: Kernel,
  tracker: ReturnType<typeof trackKernelObjects>,
  parts: readonly PartSpec[],
  quality: Quality,
  check: (built: Built[]) => void,
): void {
  const liveBefore = liveObjects();
  const kernelBefore = tracker.live();
  const built: Built[] = [];
  try {
    for (const part of parts) built.push({ part, ...buildPart(k, part, quality) });
    // Only the results themselves are still alive.
    expect(liveObjects()).toBe(liveBefore + built.length);
    expect(tracker.live()).toBe(kernelBefore + built.length);
    check(built);
  } finally {
    for (const b of built) dispose(b.manifold);
  }
  expect(liveObjects()).toBe(liveBefore);
  expect(tracker.live()).toBe(kernelBefore);
}

export function byId(built: readonly Built[], id: string): Built {
  const b = built.find((x) => x.part.id === id);
  if (!b) throw new Error(`no part ${id}`);
  return b;
}

/** A part's manifold in the assembled lamp (the caller owns it). */
export function assembled(b: Built): Manifold {
  return b.manifold.transform(b.part.assembledTransform as Parameters<Manifold['transform']>[0]);
}

/** Every copy of a part's manifold in the assembled lamp (`instanceTransforms`; the caller owns them). */
export function assembledCopies(b: Built): Manifold[] {
  return b.part.instanceTransforms.map((m) =>
    b.manifold.transform(m as Parameters<Manifold['transform']>[0]),
  );
}

/**
 * The volume two solids share once each is placed by its transform (print
 * frame → world, e.g. a part's `assembledTransform` or one of its
 * `instanceTransforms`), mm³. Nothing it makes outlives the call.
 */
export function intersectionVolume(
  k: Kernel,
  a: Manifold,
  aTransform: Mat4,
  b: Manifold,
  bTransform: Mat4,
): number {
  return scoped(k, (s) => {
    const pa = s.add(a.transform(aTransform as Parameters<Manifold['transform']>[0]));
    const pb = s.add(b.transform(bTransform as Parameters<Manifold['transform']>[0]));
    return s.add(k.Manifold.intersection(pa, pb)).volume();
  });
}

/** Smallest vertex radius of each contour of a section, sorted from the inside out. */
export function contourMinRadii(section: CrossSection): number[] {
  return section
    .toPolygons()
    .map((poly) => Math.min(...poly.map(([x, y]) => Math.hypot(x, y))))
    .sort((a, b) => a - b);
}

/** Largest vertex radius of each contour of a section, sorted. */
export function contourMaxRadii(section: CrossSection): number[] {
  return section
    .toPolygons()
    .map((poly) => Math.max(...poly.map(([x, y]) => Math.hypot(x, y))))
    .sort((a, b) => a - b);
}

type Vertex = [x: number, y: number, z: number];

export interface OverhangOptions {
  /** The bed: triangles lying on it are not overhangs. */
  bedZ?: number;
  /** Triangles smaller than this (mm², slivers where faces meet) are ignored. */
  minArea?: number;
  /**
   * Triangles to leave out. Twist-extruded threads are: their facets are
   * sheared by the twist, so a facet's normal says nothing about the printed
   * flank (45° in the axial section, settled by the thread's own tests).
   */
  ignore?: (tri: readonly [Vertex, Vertex, Vertex]) => boolean;
}

/** An `ignore` predicate for `maxOverhangDeg`. */
export type TriangleFilter = NonNullable<OverhangOptions['ignore']>;

/** An axis-aligned box in a part's print frame. */
export interface Box3 {
  min: readonly [x: number, y: number, z: number];
  max: readonly [x: number, y: number, z: number];
}

/** Ignore triangles that lie wholly inside any of the boxes (e.g. a bridge, a toothed annulus). */
export function inBoxes(...boxes: readonly Box3[]): TriangleFilter {
  const inside = (v: readonly number[], b: Box3) =>
    [0, 1, 2].every((i) => v[i]! >= b.min[i]! - 1e-6 && v[i]! <= b.max[i]! + 1e-6);
  return (tri) => boxes.some((b) => tri.every((v) => inside(v, b)));
}

/** Ignore triangles whose vertices all lie between z0 and z1 (a band of the print, e.g. a bridge's ceiling). */
export function inZRange(z0: number, z1: number): TriangleFilter {
  return (tri) => tri.every((v) => v[2]! >= z0 - 1e-6 && v[2]! <= z1 + 1e-6);
}

/** Ignore triangles any of the filters ignores. */
export function anyOf(...filters: readonly TriangleFilter[]): TriangleFilter {
  return (tri) => filters.some((f) => f(tri));
}

/**
 * The steepest overhang of a mesh in its print orientation, in degrees from
 * vertical (90 = a flat ceiling), over every downward-facing triangle that
 * does not lie on the bed.
 */
export function maxOverhangDeg(manifold: Manifold, options: OverhangOptions = {}): number {
  const { bedZ = 0, minArea = 1e-3, ignore } = options;
  const mesh = manifold.getMesh();
  const p = mesh.vertProperties;
  const n = mesh.numProp;
  let worst = 0;
  for (let t = 0; t < mesh.triVerts.length; t += 3) {
    const tri = [mesh.triVerts[t]!, mesh.triVerts[t + 1]!, mesh.triVerts[t + 2]!].map(
      (v): Vertex => [p[v * n]!, p[v * n + 1]!, p[v * n + 2]!],
    ) as [Vertex, Vertex, Vertex];
    const [a, b, c] = tri;
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const nx = u[1]! * v[2]! - u[2]! * v[1]!;
    const ny = u[2]! * v[0]! - u[0]! * v[2]!;
    const nz = u[0]! * v[1]! - u[1]! * v[0]!;
    const len = Math.hypot(nx, ny, nz);
    if (len / 2 < minArea || nz >= 0) continue;
    if (Math.max(a[2]!, b[2]!, c[2]!) <= bedZ + 1e-6) continue; // on the bed
    if (ignore?.(tri)) continue;
    worst = Math.max(worst, (Math.asin(Math.min(1, -nz / len)) * 180) / Math.PI);
  }
  return worst;
}
