/**
 * Web worker: owns the manifold-3d WASM instance, builds the shade off the
 * main thread and hands back a renderable mesh or a binary STL.
 */
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { normalizeParams } from './params.js';
import { buildShade } from './geometry.js';
import { meshToBinaryStl } from './stl.js';

let wasm = null;
let current = null; // { key, manifold, stats, params }

async function init() {
  if (!wasm) {
    wasm = await Module({ locateFile: () => wasmUrl });
    wasm.setup();
  }
}

function ensureBuilt(rawParams) {
  const { params, warnings } = normalizeParams(rawParams);
  const key = JSON.stringify(params);
  if (!current || current.key !== key) {
    if (current) current.manifold.delete();
    const t0 = performance.now();
    const { manifold, stats } = buildShade(wasm, params);
    stats.buildMs = Math.round(performance.now() - t0);
    current = { key, manifold, stats, params };
  }
  return { ...current, warnings };
}

function positionsOf(mesh) {
  if (mesh.numProp === 3) return mesh.vertProperties.slice();
  const out = new Float32Array(mesh.numVert * 3);
  for (let i = 0; i < mesh.numVert; i++) {
    out[i * 3] = mesh.vertProperties[i * mesh.numProp];
    out[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1];
    out[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2];
  }
  return out;
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    await init();
    if (msg.type === 'build') {
      const { manifold, stats, params, warnings } = ensureBuilt(msg.params);
      const mesh = manifold.getMesh();
      const positions = positionsOf(mesh);
      const indices = mesh.triVerts.slice();
      self.postMessage({ type: 'built', id: msg.id, positions, indices, stats, params, warnings },
        [positions.buffer, indices.buffer]);
    } else if (msg.type === 'stl') {
      const { manifold, params } = ensureBuilt(msg.params);
      const buffer = meshToBinaryStl(manifold.getMesh(), 'openlamp lamp shade for Bambu Lab LED Lamp Kit-001');
      self.postMessage({ type: 'stl', id: msg.id, buffer, params }, [buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String((err && err.message) || err) });
  }
};
