/**
 * Messages between the UI thread (app.ts) and the geometry worker (worker.ts).
 *
 * Every response carries the `id` of the request it answers so the UI can drop
 * stale builds. Typed arrays and buffers are transferred, not copied.
 */
import type { ClassicShadeStats } from '@core/geometry/parts/classicShade.ts';
import type { ClassicShadeParams } from '@core/schema/defs.ts';

export type WorkerRequest =
  | { type: 'build'; id: number; params: Partial<ClassicShadeParams> }
  | { type: 'stl'; id: number; params: Partial<ClassicShadeParams> };

/** Shade stats plus the time the worker spent building the manifold. */
export interface BuildStats extends ClassicShadeStats {
  buildMs: number;
}

export interface BuiltResponse {
  type: 'built';
  id: number;
  /** xyz per vertex. */
  positions: Float32Array<ArrayBuffer>;
  /** Three vertex indices per triangle, CCW from the outside. */
  indices: Uint32Array<ArrayBuffer>;
  stats: BuildStats;
  /** The normalized parameters the mesh was built from. */
  params: ClassicShadeParams;
  warnings: string[];
}

export interface StlResponse {
  type: 'stl';
  id: number;
  /** A complete binary STL file. */
  buffer: ArrayBuffer;
  params: ClassicShadeParams;
}

export interface ErrorResponse {
  type: 'error';
  id: number;
  message: string;
}

export type WorkerResponse = BuiltResponse | StlResponse | ErrorResponse;
