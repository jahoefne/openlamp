import { useMemo } from 'react';
import { Matrix4 } from 'three';
import type { Mat4 } from '@core/model/assembly.ts';

/** A Matrix4 for a column-major Mat4 (`matrix={[…]}` would read it row-major). */
export function useMatrix(m: Mat4): Matrix4 {
  return useMemo(() => new Matrix4().fromArray(m), [m]);
}
