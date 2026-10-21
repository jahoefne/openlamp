/**
 * Renderer-ready buffers from a manifold-3d mesh: de-interleaved positions
 * (and normals, when the mesh carries them) plus the triangle indices, each in
 * its own buffer so the worker can transfer them to the main thread and
 * three.js can use them as they are.
 */
import type { Manifold } from './kernel.ts';

/** The subset of a manifold-3d `Mesh` the conversion reads. */
export interface MeshLike {
  /** Properties per vertex: 3 = position only, ≥ 6 = position + normal (+ more). */
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

export interface MeshBuffers {
  /** x, y, z per vertex. */
  positions: Float32Array<ArrayBuffer>;
  /** Normal x, y, z per vertex, if the mesh has them (properties 3..5). */
  normals?: Float32Array<ArrayBuffer>;
  /** Three vertex indices per triangle, counter-clockwise seen from outside. */
  indices: Uint32Array<ArrayBuffer>;
}

export type RenderBuffers = Required<MeshBuffers>;

/**
 * Split a mesh into position, normal and index buffers. A mesh with 6 or more
 * properties per vertex is taken to hold its normal in properties 3..5 (where
 * `calculateNormals(0)` puts it); with fewer there are no normals. The buffers
 * are fresh copies, never views of the mesh's (possibly WASM-backed) arrays.
 */
export function meshToBuffers(mesh: MeshLike): MeshBuffers {
  const { numProp, vertProperties, triVerts } = mesh;
  if (numProp < 3 || vertProperties.length % numProp !== 0) {
    throw new Error(`Malformed mesh: ${vertProperties.length} properties, ${numProp} per vertex`);
  }
  const indices = triVerts.slice();
  if (numProp === 3) return { positions: vertProperties.slice(), indices };

  const numVert = vertProperties.length / numProp;
  const positions = new Float32Array(numVert * 3);
  const withNormals = numProp >= 6;
  const normals = withNormals ? new Float32Array(numVert * 3) : undefined;
  // In range by construction (numVert · numProp properties), hence the assertions.
  for (let v = 0, src = 0, dst = 0; v < numVert; v++, src += numProp, dst += 3) {
    positions[dst] = vertProperties[src]!;
    positions[dst + 1] = vertProperties[src + 1]!;
    positions[dst + 2] = vertProperties[src + 2]!;
    if (normals) {
      normals[dst] = vertProperties[src + 3]!;
      normals[dst + 1] = vertProperties[src + 4]!;
      normals[dst + 2] = vertProperties[src + 5]!;
    }
  }
  return normals ? { positions, normals, indices } : { positions, indices };
}

/**
 * `minSharpAngle` for `renderBuffers`: 180° keeps every edge smooth (one shared
 * normal per vertex), like three.js `computeVertexNormals` on an indexed mesh.
 * Any lower angle makes manifold split the normals along sharp edges, which
 * costs tens to hundreds of milliseconds on a ribbed shade (30° added up to
 * ~1 s at normal quality) against a few ms for smooth normals.
 */
export const SMOOTH_NORMALS_DEG = 180;

/**
 * Position, normal and index buffers for rendering a manifold. The normals are
 * computed by manifold (`calculateNormals`) on a temporary copy that is deleted
 * before returning; `manifold` itself is left untouched.
 * @param minSharpAngle  edges whose faces meet at more than this many degrees keep separate normals
 */
export function renderBuffers(
  manifold: Manifold,
  minSharpAngle: number = SMOOTH_NORMALS_DEG,
): RenderBuffers {
  const withNormals = manifold.calculateNormals(0, minSharpAngle);
  try {
    // normalIdx 0 = the first property after the position, i.e. mesh properties 3..5.
    const { positions, normals, indices } = meshToBuffers(withNormals.getMesh(0));
    if (!normals) throw new Error('calculateNormals() produced a mesh without normals');
    return { positions, normals, indices };
  } finally {
    withNormals.delete();
  }
}
