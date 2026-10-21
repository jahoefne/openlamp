/**
 * Web worker: owns the manifold-3d WASM instance, builds the shade off the
 * main thread and hands back a renderable mesh or a binary STL.
 */
import Module from 'manifold-3d';
import type { Manifold, ManifoldToplevel, Mesh } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { normalizeParams, type Params } from './params.ts';
import { buildShade } from './geometry.ts';
import { meshToBinaryStl } from './stl.ts';
import type { BuildStats, WorkerRequest, WorkerResponse } from './protocol.ts';

interface Built {
  key: string;
  manifold: Manifold;
  stats: BuildStats;
  params: Params;
}

let wasm: ManifoldToplevel | null = null;
let current: Built | null = null;

async function init(): Promise<ManifoldToplevel> {
  if (!wasm) {
    wasm = await Module({ locateFile: () => wasmUrl });
    wasm.setup();
  }
  return wasm;
}

function ensureBuilt(
  kernel: ManifoldToplevel,
  rawParams: Partial<Params>,
): Built & { warnings: string[] } {
  const { params, warnings } = normalizeParams(rawParams);
  const key = JSON.stringify(params);
  if (!current || current.key !== key) {
    if (current) current.manifold.delete();
    const t0 = performance.now();
    const { manifold, stats } = buildShade(kernel, params);
    const buildMs = Math.round(performance.now() - t0);
    current = { key, manifold, stats: { ...stats, buildMs }, params };
  }
  return { ...current, warnings };
}

function positionsOf(mesh: Mesh): Float32Array<ArrayBuffer> {
  if (mesh.numProp === 3) return mesh.vertProperties.slice();
  const out = new Float32Array(mesh.numVert * 3);
  for (let i = 0; i < mesh.numVert; i++) {
    out[i * 3] = mesh.vertProperties[i * mesh.numProp]!;
    out[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1]!;
    out[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2]!;
  }
  return out;
}

function reply(msg: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    const kernel = await init();
    if (msg.type === 'build') {
      const { manifold, stats, params, warnings } = ensureBuilt(kernel, msg.params);
      const mesh = manifold.getMesh();
      const positions = positionsOf(mesh);
      const indices = mesh.triVerts.slice();
      reply({ type: 'built', id: msg.id, positions, indices, stats, params, warnings }, [
        positions.buffer,
        indices.buffer,
      ]);
    } else if (msg.type === 'stl') {
      const { manifold, params } = ensureBuilt(kernel, msg.params);
      const buffer = meshToBinaryStl(
        manifold.getMesh(),
        'openlamp lamp shade for Bambu Lab LED Lamp Kit-001',
      );
      reply({ type: 'stl', id: msg.id, buffer, params }, [buffer]);
    }
  } catch (err) {
    reply({
      type: 'error',
      id: msg.id,
      message: err instanceof Error && err.message ? err.message : String(err),
    });
  }
};
