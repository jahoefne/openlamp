/**
 * Binary STL writer for a manifold-3d Mesh.
 *
 * The mesh's `triVerts` are CCW from the outside, so the facet normal computed
 * from the cross product points outward, which is what slicers expect.
 *
 * Core runs on the plain ES library (no TextEncoder), so the 80-byte header is
 * written as ASCII; any other character becomes `?`.
 */

/** The subset of a manifold-3d `Mesh` the writer reads. */
export interface StlMesh {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

export function meshToBinaryStl(mesh: StlMesh, name = 'openlamp lamp shade'): ArrayBuffer {
  const { numProp, vertProperties, triVerts } = mesh;
  const numTri = triVerts.length / 3;
  const buffer = new ArrayBuffer(84 + numTri * 50);
  const view = new DataView(buffer);
  const header = new Uint8Array(buffer, 0, 80);
  const headerText = name.slice(0, 79);
  for (let i = 0; i < headerText.length; i++) {
    const code = headerText.charCodeAt(i);
    header[i] = code < 128 ? code : 0x3f;
  }
  view.setUint32(80, numTri, true);

  // Every index below is in range for a well-formed mesh (3 indices per
  // triangle, numProp floats per vertex), hence the non-null assertions.
  let offset = 84;
  for (let t = 0; t < numTri; t++) {
    const i0 = triVerts[t * 3]! * numProp;
    const i1 = triVerts[t * 3 + 1]! * numProp;
    const i2 = triVerts[t * 3 + 2]! * numProp;
    const ax = vertProperties[i0]!;
    const ay = vertProperties[i0 + 1]!;
    const az = vertProperties[i0 + 2]!;
    const bx = vertProperties[i1]!;
    const by = vertProperties[i1 + 1]!;
    const bz = vertProperties[i1 + 2]!;
    const cx = vertProperties[i2]!;
    const cy = vertProperties[i2 + 1]!;
    const cz = vertProperties[i2 + 2]!;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = ny = nz = 0;
    }

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    view.setFloat32(offset + 12, ax, true);
    view.setFloat32(offset + 16, ay, true);
    view.setFloat32(offset + 20, az, true);
    view.setFloat32(offset + 24, bx, true);
    view.setFloat32(offset + 28, by, true);
    view.setFloat32(offset + 32, bz, true);
    view.setFloat32(offset + 36, cx, true);
    view.setFloat32(offset + 40, cy, true);
    view.setFloat32(offset + 44, cz, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return buffer;
}
