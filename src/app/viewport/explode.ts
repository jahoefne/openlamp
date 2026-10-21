/**
 * The exploded view: parts move apart along the lamp's axis (z). Pure (no
 * React, no three.js), so the unit tests can check it.
 *
 * The parts are ranked by the z of their bounding box's centre in the
 * assembled lamp (the box of the built mesh, in its print frame, through every
 * copy's transform), and each part with all its copies moves by
 * `factor · EXPLODE_STEP · (rank − median rank)`: the middle part stays, the
 * ones below move down, the ones above move up, neighbours one step apart.
 */
import { applyToPoint } from '@core/assembly/transforms.ts';
import type { BBox, Mat4 } from '@core/model/assembly.ts';

/** How far neighbouring parts move apart at full explode (factor 1), mm. */
export const EXPLODE_STEP = 60;

export interface ExplodeItem {
  id: string;
  /** Print frame → world of every copy. */
  transforms: readonly Mat4[];
  /** The built mesh's bounding box in its print frame; the origin stands in until it is built. */
  bbox?: BBox | undefined;
}

/** The z of the centre of a part's bounding box over all its copies in the assembled lamp. */
export function assembledCentreZ(item: ExplodeItem): number {
  const { min, max } = item.bbox ?? { min: [0, 0, 0], max: [0, 0, 0] };
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of item.transforms) {
    for (const x of [min[0], max[0]]) {
      for (const y of [min[1], max[1]]) {
        for (const z of [min[2], max[2]]) {
          const wz = applyToPoint(m, [x, y, z])[2]!;
          lo = Math.min(lo, wz);
          hi = Math.max(hi, wz);
        }
      }
    }
  }
  return Number.isFinite(lo) ? (lo + hi) / 2 : 0;
}

/**
 * The z offset of each part (by id) at `factor` (0 … 1); empty at 0. Parts at
 * the same height keep their input order.
 */
export function explodeOffsets(
  items: readonly ExplodeItem[],
  factor: number,
): ReadonlyMap<string, number> {
  const offsets = new Map<string, number>();
  const f = Math.min(1, Math.max(0, factor));
  if (f === 0 || items.length < 2) return offsets;
  const ranked = items
    .map((item, i) => ({ id: item.id, z: assembledCentreZ(item), i }))
    .sort((a, b) => a.z - b.z || a.i - b.i);
  const median = (ranked.length - 1) / 2;
  ranked.forEach((r, rank) => offsets.set(r.id, f * EXPLODE_STEP * (rank - median)));
  return offsets;
}
