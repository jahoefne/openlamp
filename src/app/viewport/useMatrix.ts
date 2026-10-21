import { useMemo } from 'react';
import { Matrix4 } from 'three';
import type { Mat4 } from '@core/model/assembly.ts';

/**
 * One Matrix4 per column-major Mat4 (the copies of a part; `matrix={[…]}`
 * would read it row-major), memoised on the array.
 */
export function useMatrices(ms: readonly Mat4[]): Matrix4[] {
  return useMemo(() => ms.map((m) => new Matrix4().fromArray(m)), [ms]);
}
