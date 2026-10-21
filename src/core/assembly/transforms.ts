/**
 * 4×4 transforms for placing parts (column-major, as three.js and manifold
 * use them). Pure, no WASM.
 */
import { IDENTITY, type Mat4 } from '../model/assembly.ts';

const DEG = Math.PI / 180;

export function identity(): Mat4 {
  return [...IDENTITY];
}

export function translation(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

/** Rotation about z by `deg` degrees (counter-clockwise seen from +z). */
export function rotationZ(deg: number): Mat4 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Half a turn about x: (x, y, z) → (x, −y, −z). A proper rotation, so a
 * right-hand thread stays right-handed (a mirror would not).
 */
export function flipX(): Mat4 {
  return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
}

/** a · b (apply b first, then a). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** The product of the transforms, applied right to left (the last one first). */
export function compose(...ms: Mat4[]): Mat4 {
  return ms.reduce((acc, m) => multiply(acc, m), identity());
}

/** Where a point of the print frame ends up. */
export function applyToPoint(m: Mat4, [x, y, z]: readonly [number, number, number]): number[] {
  return [0, 1, 2].map((row) => m[row]! * x + m[4 + row]! * y + m[8 + row]! * z + m[12 + row]!);
}
