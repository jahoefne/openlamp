import { useMemo } from 'react';
import { Matrix4 } from 'three';
import type { Mat4 } from '@core/model/assembly.ts';

/**
 * One Matrix4 per column-major Mat4 (the copies of a part; `matrix={[…]}`
 * would read it row-major), moved by `offsetZ` along the world's z (the
 * exploded view), memoised on both.
 */
export function useMatrices(ms: readonly Mat4[], offsetZ = 0): Matrix4[] {
  return useMemo(
    () =>
      ms.map((m) => {
        const matrix = new Matrix4().fromArray(m);
        // Translation after the transform: only the z of its translation column changes.
        matrix.elements[14] = matrix.elements[14]! + offsetZ;
        return matrix;
      }),
    [ms, offsetZ],
  );
}
