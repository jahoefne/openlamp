/**
 * The bed view: every copy of every part in its print orientation (its print
 * frame, bed = z 0) where the plate layout puts it (`packParts`, the same
 * packing as `Assembly.layout`), turned 90° when the layout turns it. Pure
 * (no React, no three.js), so the unit tests can check it.
 *
 * World coordinates: the bed's centre at the origin, x and y along the bed's
 * edges. A copy is centred on its placement by its built mesh's bounding box
 * (the print frame's origin until it is built). Copies that do not fit the
 * bed go beside it, in a column to the right of the bed (+x), front to back.
 */
import { packParts } from '@core/assembly/layout.ts';
import { compose, rotationZ, translation } from '@core/assembly/transforms.ts';
import type { BBox, Layout, Mat4, PartSpec } from '@core/model/assembly.ts';

/** Gap between the bed and the parts beside it, and between those parts, mm. */
export const BED_SIDE_GAP = 20;

export interface BedPart {
  /** Print frame → world of each copy on (or beside) the bed. */
  matrices: Mat4[];
  /** Some copy does not fit the bed (drawn beside it, in red). */
  overflow: boolean;
}

export interface BedScene {
  bed: Layout['bed'];
  parts: ReadonlyMap<string, BedPart>;
}

/**
 * Where each part's copies lie in the bed view. `bboxOf` gives a part's
 * built bounding box (print frame), if any.
 */
export function bedScene(
  parts: readonly Pick<PartSpec, 'id' | 'bedFootprint' | 'instances'>[],
  bed: readonly [number, number, number],
  bboxOf: (id: string) => BBox | undefined,
): BedScene {
  const { layout, unplaced } = packParts(
    parts.map((p) => ({
      id: p.id,
      x: p.bedFootprint?.x ?? 0,
      y: p.bedFootprint?.y ?? 0,
      instances: p.instances,
    })),
    bed,
  );
  const [bedX, bedY] = layout.bed;
  const out = new Map<string, BedPart>();
  let sideY = -bedY / 2;
  for (const p of layout.placements) {
    const bb = bboxOf(p.id);
    const cx = bb ? (bb.min[0] + bb.max[0]) / 2 : 0;
    const cy = bb ? (bb.min[1] + bb.max[1]) / 2 : 0;
    let x = p.x - bedX / 2;
    let y = p.y - bedY / 2;
    const outside = unplaced.has(p);
    if (outside) {
      x = bedX / 2 + BED_SIDE_GAP + p.width / 2;
      y = sideY + p.depth / 2;
      sideY += p.depth + BED_SIDE_GAP;
    }
    const matrix = compose(
      translation(x, y, 0),
      rotationZ(p.rotated ? 90 : 0),
      translation(-cx, -cy, 0),
    );
    const entry = out.get(p.id) ?? { matrices: [], overflow: false };
    entry.matrices.push(matrix);
    entry.overflow ||= outside;
    out.set(p.id, entry);
  }
  return { bed: layout.bed, parts: out };
}
