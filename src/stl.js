/**
 * Binary STL writer for a manifold-3d Mesh.
 *
 * The mesh's `triVerts` are CCW from the outside, so the facet normal computed
 * from the cross product points outward, which is what slicers expect.
 */

/**
 * @param {{numProp:number, vertProperties:Float32Array, triVerts:Uint32Array}} mesh
 * @param {string} [name]
 * @returns {ArrayBuffer}
 */
export function meshToBinaryStl(mesh, name = 'openlamp lamp shade') {
  const { numProp, vertProperties, triVerts } = mesh;
  const numTri = triVerts.length / 3;
  const buffer = new ArrayBuffer(84 + numTri * 50);
  const view = new DataView(buffer);
  const header = new Uint8Array(buffer, 0, 80);
  const headerText = new TextEncoder().encode(name.slice(0, 79));
  header.set(headerText);
  view.setUint32(80, numTri, true);

  let offset = 84;
  for (let t = 0; t < numTri; t++) {
    const i0 = triVerts[t * 3] * numProp;
    const i1 = triVerts[t * 3 + 1] * numProp;
    const i2 = triVerts[t * 3 + 2] * numProp;
    const ax = vertProperties[i0], ay = vertProperties[i0 + 1], az = vertProperties[i0 + 2];
    const bx = vertProperties[i1], by = vertProperties[i1 + 1], bz = vertProperties[i1 + 2];
    const cx = vertProperties[i2], cy = vertProperties[i2 + 1], cz = vertProperties[i2 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; } else { nx = ny = nz = 0; }

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
