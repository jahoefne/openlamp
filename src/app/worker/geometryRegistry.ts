/**
 * The meshes of the built parts, by part id, kept outside React (and outside
 * the stores, which hold only plain data). The build pipeline puts a new
 * geometry here and then bumps the part's `revision` in the build store;
 * `PartMesh` picks it up on that revision.
 *
 * `set` does not dispose the geometry it replaces: the viewport may still be
 * drawing it until it has swapped to the new one, and it disposes what it
 * swaps out (a replaced geometry that never reached the viewport was never
 * uploaded to the GPU, so the garbage collector takes care of it).
 */
import type { BufferGeometry } from 'three';

const geometries = new Map<string, BufferGeometry>();

export const geometryRegistry = {
  get(partId: string): BufferGeometry | undefined {
    return geometries.get(partId);
  },

  set(partId: string, geometry: BufferGeometry): void {
    geometries.set(partId, geometry);
  },

  /** Drop a part that left the assembly and free its GPU buffers. */
  dispose(partId: string): void {
    geometries.get(partId)?.dispose();
    geometries.delete(partId);
  },

  /** Whether this exact geometry is the registry's current one for the part. */
  owns(partId: string, geometry: BufferGeometry): boolean {
    return geometries.get(partId) === geometry;
  },
};
