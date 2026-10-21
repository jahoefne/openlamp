/**
 * Build state of every part, written by the build pipeline
 * (worker/useBuildPipeline.ts) and read by the viewport and the panels. The
 * meshes themselves live outside React in worker/geometryRegistry.ts; a part's
 * `revision` is bumped whenever a new geometry for it lands there.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Assembly, MountContext, PartSpec, PartStats, Warning } from '@core/model/assembly.ts';
import type { ExportProgress, PartMessage } from '../worker/workerClient.ts';
import type { PartsDiff } from '../worker/pipelineDiff.ts';

export type PartBuildStatus = 'queued' | 'building' | 'ready' | 'error' | 'stale';

export interface PartBuild {
  /**
   * `ready`: the displayed geometry is this part's; `stale`: the part changed
   * and its build is about to start; `queued` / `building`: sent to the worker;
   * `error`: its last build failed (any older geometry stays on screen).
   */
  status: PartBuildStatus;
  /** Bumped whenever a new geometry for this part lands in the geometry registry. */
  revision: number;
  /** Hash of the spec last requested for this part. */
  hash: string;
  /** Hash of the geometry in the registry (what the viewport shows), if any. */
  readyHash?: string | undefined;
  /** The spec the displayed geometry was built from. */
  built?: PartSpec | undefined;
  /** Stats of the displayed geometry. */
  stats?: PartStats | undefined;
  /** Post-build geometry warnings of the displayed geometry. */
  warnings: Warning[];
  error?: string | undefined;
  buildMs?: number | undefined;
  cached?: boolean | undefined;
}

export interface BuildSummary {
  /** Builder time of the parts built in the latest build that had any. */
  ms: number;
  /** Every one of them came from the worker's cache. */
  cached: boolean;
}

export interface BuildState {
  /** The latest dispatched build (monotonic across worker restarts). */
  generation: number;
  /** The latest build whose `build-done` arrived. */
  doneGeneration: number;
  parts: Record<string, PartBuild>;
  /**
   * Project-level warnings and derived dimensions of the dispatched assembly,
   * and the worker's total time once its build is done.
   */
  assembly: {
    warnings: Warning[];
    derived: Record<string, number>;
    context: MountContext;
    totalMs: number | null;
  } | null;
  /**
   * `Assembly.derived` of the latest build that finished: what the meshes on
   * screen were built from, so the ghosts and context planes move with them
   * rather than ahead of them.
   */
  shownDerived: Record<string, number> | null;
  /** `Assembly.context` of the same build (what the lamp is mounted on). */
  shownContext: MountContext | null;
  lastBuild: BuildSummary | null;
  exporting: boolean;
  exportProgress: ExportProgress | null;
  exportError: string | null;
  kernelReady: boolean;
  fatalError: string | null;

  /** A changed project is waiting for the debounce: mark parts whose hash moved on. */
  markStale(parts: readonly PartSpec[]): void;
  /** Build `diff.build` as `generation`. */
  dispatch(generation: number, assembly: Assembly, diff: PartsDiff): void;
  partReady(msg: Omit<PartMessage, 'positions' | 'normals' | 'indices'>, spec: PartSpec): void;
  /** The latest build of this part failed (the client only passes on the latest generation). */
  partError(partId: string, message: string): void;
  buildDone(generation: number, totalMs: number): void;
  setKernelReady(): void;
  setFatalError(message: string): void;
  exportStarted(): void;
  setExportProgress(progress: ExportProgress): void;
  exportFinished(error: string | null): void;
}

/** In-flight parts in the order the worker builds them (it builds in dispatch order). */
function markNextBuilding(parts: Record<string, PartBuild>, order: readonly string[]): void {
  if (order.some((id) => parts[id]?.status === 'building')) return;
  const next = order.find((id) => parts[id]?.status === 'queued');
  if (next) parts[next]!.status = 'building';
}

/** Dispatch order of the latest generation, for `markNextBuilding`. */
let buildOrder: string[] = [];

export const useBuildStore = create<BuildState>()(
  immer((set) => ({
    generation: 0,
    doneGeneration: 0,
    parts: {},
    assembly: null,
    shownDerived: null,
    shownContext: null,
    lastBuild: null,
    exporting: false,
    exportProgress: null,
    exportError: null,
    kernelReady: false,
    fatalError: null,

    markStale: (parts) =>
      set((s) => {
        for (const part of parts) {
          const b = s.parts[part.id];
          if (!b || (b.status !== 'ready' && b.status !== 'stale')) continue;
          b.status = b.readyHash === part.hash ? 'ready' : 'stale';
        }
      }),

    dispatch: (generation, assembly, diff) =>
      set((s) => {
        s.generation = generation;
        s.assembly = {
          warnings: assembly.warnings,
          derived: assembly.derived,
          context: assembly.context,
          totalMs: null,
        };
        s.exportError = null;
        for (const id of diff.removed) delete s.parts[id];
        for (const part of diff.unchanged) {
          const b = s.parts[part.id]!;
          b.status = 'ready';
          b.hash = part.hash;
          b.built = part;
          b.error = undefined;
        }
        for (const part of diff.build) {
          const b = s.parts[part.id];
          if (b) {
            b.status = 'queued';
            b.hash = part.hash;
            b.error = undefined;
          } else {
            s.parts[part.id] = { status: 'queued', revision: 0, hash: part.hash, warnings: [] };
          }
        }
        buildOrder = diff.build.map((p) => p.id);
        markNextBuilding(s.parts, buildOrder);
        if (diff.build.length > 0) s.lastBuild = { ms: 0, cached: true };
      }),

    partReady: (msg, spec) =>
      set((s) => {
        const b = s.parts[msg.partId];
        if (!b) return;
        b.status = b.hash === msg.hash ? 'ready' : b.status;
        b.revision += 1;
        b.readyHash = msg.hash;
        b.built = spec;
        b.stats = msg.stats;
        b.warnings = msg.warnings;
        b.error = undefined;
        b.buildMs = msg.buildMs;
        b.cached = msg.cached;
        if (s.lastBuild) {
          s.lastBuild.ms += msg.buildMs;
          s.lastBuild.cached &&= msg.cached;
        }
        markNextBuilding(s.parts, buildOrder);
      }),

    partError: (partId, message) =>
      set((s) => {
        const b = s.parts[partId];
        if (!b) return;
        b.status = 'error';
        b.error = message;
        markNextBuilding(s.parts, buildOrder);
      }),

    buildDone: (generation, totalMs) =>
      set((s) => {
        s.doneGeneration = generation;
        if (s.assembly) {
          s.assembly.totalMs = totalMs;
          if (generation === s.generation) {
            s.shownDerived = s.assembly.derived;
            s.shownContext = s.assembly.context;
          }
        }
      }),

    setKernelReady: () => set({ kernelReady: true }),
    setFatalError: (fatalError) =>
      set((s) => {
        s.fatalError = fatalError;
        for (const b of Object.values(s.parts)) {
          if (b.status !== 'ready' && b.status !== 'error') b.status = 'stale';
        }
      }),

    exportStarted: () => set({ exporting: true, exportProgress: null, exportError: null }),
    setExportProgress: (exportProgress) => set({ exportProgress }),
    exportFinished: (exportError) => set({ exporting: false, exportProgress: null, exportError }),
  })),
);
