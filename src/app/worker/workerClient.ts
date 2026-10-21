/**
 * The main thread's handle on the geometry worker (src/worker/geometry.worker.ts).
 * Framework-agnostic: plain callbacks and promises, no React.
 *
 * - `build(parts)` starts a new build generation and returns its number. From
 *   then on `part`, `part-error` and `build-done` messages of older
 *   generations are dropped, so listeners only ever see the latest build.
 * - `export(req)` runs an export job and resolves with its files; jobs are
 *   correlated by id, so several can be in flight. Aborting the signal cancels
 *   the job in the worker and rejects with the signal's reason.
 */
import type { PartSpec } from '@core/model/assembly.ts';
import type {
  BuildDoneMessage,
  ExportFile,
  ExportMessage,
  FromWorker,
  PartErrorMessage,
  PartMessage,
  ProgressMessage,
  ToWorker,
} from '../../worker/protocol.ts';

export type { BuildDoneMessage, ExportFile, PartErrorMessage, PartMessage };

export type ExportRequest = Omit<ExportMessage, 't' | 'jobId'>;
export type ExportProgress = Omit<ProgressMessage, 't' | 'jobId'>;

export interface ExportOptions {
  onProgress?: (progress: ExportProgress) => void;
  /** Aborting cancels the job in the worker; the promise rejects with `signal.reason`. */
  signal?: AbortSignal;
}

/** Unsubscribes the listener. */
export type Unsubscribe = () => void;

export interface WorkerClient {
  /** Resolves once the worker has loaded the geometry kernel; rejects if it cannot start. */
  readonly ready: Promise<void>;
  /** Build these parts as a new generation and return its number. */
  build(parts: PartSpec[]): number;
  export(req: ExportRequest, options?: ExportOptions): Promise<ExportFile[]>;
  /** A part of the latest build is ready (its buffers are now owned by the listener). */
  onPart(cb: (msg: PartMessage) => void): Unsubscribe;
  /** A part of the latest build failed; the rest of the build goes on. */
  onPartError(cb: (msg: PartErrorMessage) => void): Unsubscribe;
  /** Every part of the latest build has been answered. */
  onBuildDone(cb: (msg: BuildDoneMessage) => void): Unsubscribe;
  /** The worker itself failed (failed to load, crashed). Builds in flight will not finish. */
  onError(cb: (error: Error) => void): Unsubscribe;
  /** Terminate the worker and reject every pending export. */
  dispose(): void;
}

interface PendingExport {
  resolve(files: ExportFile[]): void;
  reject(error: unknown): void;
  onProgress: ((progress: ExportProgress) => void) | undefined;
}

class Listeners<T> {
  private readonly set = new Set<(value: T) => void>();

  add(cb: (value: T) => void): Unsubscribe {
    this.set.add(cb);
    return () => this.set.delete(cb);
  }

  emit(value: T): void {
    for (const cb of this.set) {
      try {
        cb(value);
      } catch (err) {
        reportError(err); // one failing listener must not starve the others
      }
    }
  }

  clear(): void {
    this.set.clear();
  }
}

export function createWorkerClient(): WorkerClient {
  const worker = new Worker(new URL('../../worker/geometry.worker.ts', import.meta.url), {
    type: 'module',
  });
  const post = (msg: ToWorker): void => worker.postMessage(msg);

  let latestGen = 0;
  let jobCount = 0;
  let disposed = false;
  const jobs = new Map<string, PendingExport>();
  const parts = new Listeners<PartMessage>();
  const partErrors = new Listeners<PartErrorMessage>();
  const buildsDone = new Listeners<BuildDoneMessage>();
  const errors = new Listeners<Error>();

  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {}); // callers that never await `ready` must not see an unhandled rejection

  const failAll = (error: Error): void => {
    rejectReady(error); // no-op once settled
    for (const job of jobs.values()) job.reject(error);
    jobs.clear();
  };

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    switch (msg.t) {
      case 'ready':
        resolveReady();
        break;
      case 'part':
        if (msg.gen === latestGen) parts.emit(msg);
        break;
      case 'part-error':
        if (msg.gen === latestGen) partErrors.emit(msg);
        break;
      case 'build-done':
        if (msg.gen === latestGen) buildsDone.emit(msg);
        break;
      case 'progress':
        jobs.get(msg.jobId)?.onProgress?.({ done: msg.done, total: msg.total, label: msg.label });
        break;
      case 'export-done':
        jobs.get(msg.jobId)?.resolve(msg.files);
        break;
      case 'export-error':
        jobs.get(msg.jobId)?.reject(new Error(msg.message));
        break;
    }
  };

  // An uncaught error in the worker (or a worker script that fails to load).
  worker.onerror = (e: ErrorEvent) => {
    const error = new Error(e.message || 'The geometry worker failed');
    failAll(error);
    errors.emit(error);
  };

  post({ t: 'init' });

  return {
    ready,

    build(partSpecs) {
      if (disposed) throw new Error('The worker client has been disposed');
      const gen = ++latestGen;
      post({ t: 'build', gen, parts: partSpecs });
      return gen;
    },

    export(req, options = {}) {
      if (disposed) return Promise.reject(new Error('The worker client has been disposed'));
      const { onProgress, signal } = options;
      if (signal?.aborted) return Promise.reject(signal.reason);
      const jobId = `export-${++jobCount}`;
      return new Promise<ExportFile[]>((resolve, reject) => {
        const onAbort = (): void => {
          post({ t: 'cancel-export', jobId });
          settle();
          reject(signal?.reason);
        };
        const settle = (): void => {
          jobs.delete(jobId);
          signal?.removeEventListener('abort', onAbort);
        };
        jobs.set(jobId, {
          resolve: (files) => {
            settle();
            resolve(files);
          },
          reject: (error) => {
            settle();
            reject(error);
          },
          onProgress,
        });
        signal?.addEventListener('abort', onAbort, { once: true });
        post({ t: 'export', jobId, ...req });
      });
    },

    onPart: (cb) => parts.add(cb),
    onPartError: (cb) => partErrors.add(cb),
    onBuildDone: (cb) => buildsDone.add(cb),
    onError: (cb) => errors.add(cb),

    dispose() {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      failAll(new Error('The worker client has been disposed'));
      for (const l of [parts, partErrors, buildsDone, errors]) l.clear();
    },
  };
}
