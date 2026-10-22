/**
 * The geometry worker: owns the manifold-3d kernel and a cache of built parts,
 * builds the parts the main thread asks for and answers with renderable
 * buffers, and writes export files. See protocol.ts for the messages.
 *
 * Every build and export loop yields to the event loop before each part, so a
 * newer `build` (or a `cancel-export`) that arrived meanwhile is seen before
 * the next part starts. A manifold taken from the cache is used up before the
 * next yield: the cache may evict (and delete) it once another loop runs.
 */
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { validateGeometry } from '@core/assembly/validate.ts';
import { archiveFileName, partFileName } from '@core/export/naming.ts';
import { meshToBinaryStl } from '@core/export/stl.ts';
import {
  IMPLEMENTED_SLICER_FLAVOURS,
  THREEMF_MIME,
  meshFor3mf,
  writeLamp3mf,
  type Built3mfPart,
} from '@core/export/threemf.ts';
import { zipFiles } from '@core/export/zip.ts';
import { buildPart } from '@core/geometry/build.ts';
import { PartCache } from '@core/geometry/cache.ts';
import type { Kernel, Manifold } from '@core/geometry/kernel.ts';
import { renderBuffers } from '@core/geometry/mesh.ts';
import type { PartSpec, PartStats } from '@core/model/assembly.ts';
import { printerLabel } from '@core/schema/printers.ts';
import type { ExportFile, ExportMessage, FromWorker, ToWorker } from './protocol.ts';

/** Triangles the part cache may hold before it evicts least recently used parts. */
const CACHE_TRIANGLES = 3_000_000;

const cache = new PartCache(CACHE_TRIANGLES);
/** The newest build generation received; older build loops stop at their next part. */
let latestGen = 0;
/** Running export jobs by id; `cancel-export` sets the flag, checked between parts. */
const exportJobs = new Map<string, { cancelled: boolean }>();

let kernel: Promise<Kernel> | undefined;

/** The kernel, loaded on first use; posts `ready` once it is. A failed load is retried next time. */
function init(): Promise<Kernel> {
  kernel ??= loadKernel().catch((err: unknown) => {
    kernel = undefined;
    throw err;
  });
  return kernel;
}

async function loadKernel(): Promise<Kernel> {
  const t0 = performance.now();
  const k = await Module({ locateFile: () => wasmUrl });
  k.setup();
  post({ t: 'ready', kernelMs: Math.round(performance.now() - t0) });
  return k;
}

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/** Let queued messages (a newer build, a cancel) run before going on. */
function yieldToEvents(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The part's manifold from the cache, or built and cached. The manifold is
 * owned by the cache and valid only until the next `cache.set`, i.e. until this
 * loop yields.
 */
function getOrBuild(
  k: Kernel,
  part: PartSpec,
): { manifold: Manifold; stats: PartStats; cached: boolean } {
  const hit = cache.get(part.buildKey);
  if (hit) return { ...hit, cached: true };
  const built = buildPart(k, part);
  cache.set(part.buildKey, built);
  return { ...built, cached: false };
}

async function build(gen: number, parts: readonly PartSpec[]): Promise<void> {
  const t0 = performance.now();
  let k: Kernel;
  try {
    k = await init();
  } catch (err) {
    if (gen !== latestGen) return;
    const message = `The geometry engine failed to load: ${errorMessage(err)}`;
    for (const part of parts) post({ t: 'part-error', gen, partId: part.id, message });
    post({ t: 'build-done', gen, totalMs: Math.round(performance.now() - t0) });
    return;
  }
  for (const part of parts) {
    await yieldToEvents();
    if (gen !== latestGen) return; // superseded: the client would drop the rest anyway
    try {
      const { manifold, stats, cached } = getOrBuild(k, part);
      const { positions, normals, indices } = renderBuffers(manifold);
      post(
        {
          t: 'part',
          gen,
          partId: part.id,
          hash: part.hash,
          positions,
          normals,
          indices,
          stats,
          warnings: validateGeometry(part, stats),
          buildMs: cached ? 0 : stats.buildMs,
          cached,
        },
        [positions.buffer, normals.buffer, indices.buffer],
      );
    } catch (err) {
      post({ t: 'part-error', gen, partId: part.id, message: errorMessage(err) });
    }
  }
  if (gen === latestGen) {
    post({ t: 'build-done', gen, totalMs: Math.round(performance.now() - t0) });
  }
}

/** One binary STL per part, in its print orientation as built. */
async function exportStl(
  k: Kernel,
  msg: ExportMessage,
  job: { cancelled: boolean },
): Promise<ExportFile[]> {
  const { jobId, parts, meta } = msg;
  const files: ExportFile[] = [];
  for (const [i, part] of parts.entries()) {
    await yieldToEvents();
    if (job.cancelled) throw new Error('Export cancelled');
    const { manifold, stats } = getOrBuild(k, part);
    if (stats.status !== 'NoError') {
      throw new Error(`${part.displayName} is not a valid solid (manifold status ${stats.status})`);
    }
    // The one mesh alive at a time; it is garbage as soon as the STL is written.
    const data = meshToBinaryStl(manifold.getMesh(), `openlamp ${part.displayName} - ${meta.name}`);
    files.push({ name: partFileName(meta, part, 'stl'), data, mime: 'model/stl' });
    post({ t: 'progress', jobId, done: i + 1, total: parts.length, label: part.displayName });
  }
  return files;
}

/**
 * One ZIP of every part's STL (stored, level 0; a part with several copies
 * once) plus the main thread's text files (the print sheet), deflated.
 */
async function exportZip(
  k: Kernel,
  msg: ExportMessage,
  job: { cancelled: boolean },
): Promise<ExportFile[]> {
  const stls = await exportStl(k, msg, job);
  const data = zipFiles([
    ...stls.map((f) => ({ name: f.name, data: f.data })),
    ...(msg.meta.extraFiles ?? []).map((f) => ({ name: f.name, data: f.text, level: 6 as const })),
  ]);
  return [{ name: archiveFileName(msg.meta, 'zip'), data, mime: 'application/zip' }];
}

/**
 * One 3MF of every part: one object per part (a part with several copies
 * once, one build item per copy), coloured, laid out on the bed by
 * `msg.layout` in print orientation; a `progress` per part.
 */
async function export3mf(
  k: Kernel,
  msg: ExportMessage,
  job: { cancelled: boolean },
): Promise<ExportFile[]> {
  const { jobId, parts, meta, layout, printer } = msg;
  const flavour = msg.slicerFlavour ?? 'generic';
  if (!IMPLEMENTED_SLICER_FLAVOURS.includes(flavour)) {
    throw new Error(`The ${flavour} 3MF flavour is not implemented yet`);
  }
  const built: Built3mfPart[] = [];
  for (const [i, part] of parts.entries()) {
    await yieldToEvents();
    if (job.cancelled) throw new Error('Export cancelled');
    const { manifold, stats } = getOrBuild(k, part);
    if (stats.status !== 'NoError') {
      throw new Error(`${part.displayName} is not a valid solid (manifold status ${stats.status})`);
    }
    // A copy in plain JS arrays: the cached manifold may be evicted at the next yield.
    built.push({ part, mesh: meshFor3mf(manifold.getMesh()), bbox: stats.bbox });
    post({ t: 'progress', jobId, done: i + 1, total: parts.length, label: part.displayName });
  }
  const { buffer: data } = writeLamp3mf(built, layout, {
    title: meta.name,
    printerName: printerLabel(printer),
    shareUrl: meta.shareUrl,
  });
  return [{ name: archiveFileName(meta, '3mf'), data, mime: THREEMF_MIME }];
}

const EXPORTERS = { stl: exportStl, 'zip-stl': exportZip, '3mf': export3mf } as const;

async function runExport(msg: ExportMessage): Promise<void> {
  const { jobId } = msg;
  const job = { cancelled: false };
  exportJobs.set(jobId, job);
  try {
    const k = await init();
    const files = await EXPORTERS[msg.format](k, msg, job);
    post(
      { t: 'export-done', jobId, files },
      files.map((f) => f.data),
    );
  } catch (err) {
    post({ t: 'export-error', jobId, message: errorMessage(err) });
  } finally {
    exportJobs.delete(jobId);
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.t) {
    case 'init':
      // Surfaces as an `error` event on the Worker object (the client rejects `ready`).
      init().catch((err: unknown) => reportError(err));
      break;
    case 'build':
      latestGen = msg.gen;
      void build(msg.gen, msg.parts);
      break;
    case 'export':
      void runExport(msg);
      break;
    case 'cancel-export': {
      const job = exportJobs.get(msg.jobId);
      if (job) job.cancelled = true;
      break;
    }
  }
};
