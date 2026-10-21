/**
 * Messages between the main thread (src/app/worker/workerClient.ts) and the
 * geometry worker (geometry.worker.ts). Hand-rolled and typed; every message
 * is tagged by `t`. Mesh buffers and export files are transferred, not copied.
 *
 * Builds are numbered by generation: the client bumps `gen` for every build,
 * the worker stops a build between parts as soon as a newer one has arrived,
 * and the client drops `part` / `part-error` / `build-done` messages of any
 * generation but the latest. Export jobs are correlated by `jobId`.
 */
import type { Layout, PartSpec, PartStats, Warning } from '@core/model/assembly.ts';
import type { PrinterSpec } from '@core/schema/printers.ts';

export type ExportFormat = 'stl' | 'zip-stl' | '3mf';

export interface ExportMeta {
  /** Project name, used in file names and file headers. */
  name: string;
  /** Project id, the file-name fallback for a name without letters or digits. */
  id?: string;
  shareUrl?: string;
}

export interface ExportFile {
  name: string;
  data: ArrayBuffer;
  mime: string;
}

export type ToWorker =
  | { t: 'init' }
  /** Mesh quality is already baked into each part's params (and buildKey) by `assemble()`. */
  | { t: 'build'; gen: number; parts: PartSpec[] }
  | {
      t: 'export';
      jobId: string;
      parts: PartSpec[];
      format: ExportFormat;
      layout: Layout;
      printer: PrinterSpec;
      meta: ExportMeta;
    }
  | { t: 'cancel-export'; jobId: string };

export type FromWorker =
  /** The kernel is loaded; sent once. */
  | { t: 'ready'; kernelMs: number }
  | {
      t: 'part';
      gen: number;
      partId: string;
      hash: string;
      /** x, y, z per vertex. */
      positions: Float32Array<ArrayBuffer>;
      /** Unit normal per vertex. */
      normals: Float32Array<ArrayBuffer>;
      /** Three vertex indices per triangle, counter-clockwise seen from outside. */
      indices: Uint32Array<ArrayBuffer>;
      stats: PartStats;
      /** Post-build geometry warnings (the assembly's own warnings stay on the main thread). */
      warnings: Warning[];
      /** 0 when the part came from the cache. */
      buildMs: number;
      cached: boolean;
    }
  | { t: 'part-error'; gen: number; partId: string; message: string }
  | { t: 'build-done'; gen: number; totalMs: number }
  | { t: 'progress'; jobId: string; done: number; total: number; label: string }
  | { t: 'export-done'; jobId: string; files: ExportFile[] }
  | { t: 'export-error'; jobId: string; message: string };

export type ExportMessage = Extract<ToWorker, { t: 'export' }>;
export type PartMessage = Extract<FromWorker, { t: 'part' }>;
export type PartErrorMessage = Extract<FromWorker, { t: 'part-error' }>;
export type BuildDoneMessage = Extract<FromWorker, { t: 'build-done' }>;
export type ProgressMessage = Extract<FromWorker, { t: 'progress' }>;
