/**
 * Plate layout: greedy shelf packing of part footprints on the printer bed.
 * Pure, no WASM. Bed coordinates have their origin at the front-left corner.
 */
import type { Layout, Mat4, Placement } from '../model/assembly.ts';

export interface FootprintItem {
  id: string;
  /** Extent along X and Y in the part's print orientation, mm. */
  x: number;
  y: number;
  /** How many copies of the part to place (default 1); each gets a placement of its own. */
  instances?: number;
}

interface Shelf {
  y: number;
  depth: number;
  /** Next free x. */
  cursor: number;
}

/**
 * Pack footprints into shelves (rows) left to right, front to back, keeping
 * `gap` mm between parts. A part with `instances` copies is packed once per
 * copy (`Placement.instance` 0 … n − 1). Each part is turned so its shorter
 * side runs along Y (lower shelves), and turned back when that is what fits
 * the space left in a shelf. The packed block is centred on the bed. Copies
 * that do not fit are centred on the bed on their own, and their part's id
 * goes to `overflow` (once).
 */
export function layoutParts(
  footprints: readonly FootprintItem[],
  bed: readonly [number, number, number],
  gap = 10,
): Layout {
  return packParts(footprints, bed, gap).layout;
}

/**
 * `layoutParts`, and which of its placements are copies that did not fit (the
 * viewport's bed view draws those beside the bed).
 */
export function packParts(
  footprints: readonly FootprintItem[],
  bed: readonly [number, number, number],
  gap = 10,
): { layout: Layout; unplaced: ReadonlySet<Placement> } {
  const [bedX, bedY] = bed;
  const items = footprints.flatMap((f) => {
    // Landscape orientation unless only portrait fits the bed width.
    const rotated = f.x < f.y && f.y <= bedX;
    const w = rotated ? f.y : f.x;
    const d = rotated ? f.x : f.y;
    const copies = Math.max(1, Math.floor(f.instances ?? 1));
    return Array.from({ length: copies }, (_, instance) => ({ id: f.id, instance, w, d, rotated }));
  });
  // Deepest first; ties keep their input order (Array.prototype.sort is stable).
  const order = [...items].sort((a, b) => b.d - a.d);

  const shelves: Shelf[] = [];
  const placed: Placement[] = [];
  const unplaced: typeof items = [];

  const put = (
    shelf: Shelf,
    it: (typeof items)[number],
    w: number,
    d: number,
    rotated: boolean,
  ) => {
    placed.push({
      id: it.id,
      instance: it.instance,
      x: shelf.cursor + w / 2,
      y: shelf.y + d / 2,
      width: w,
      depth: d,
      rotated,
    });
    shelf.cursor += w + gap;
  };

  for (const it of order) {
    const options: [w: number, d: number, rotated: boolean][] = [
      [it.w, it.d, it.rotated],
      [it.d, it.w, !it.rotated],
    ];
    let done = false;
    for (const shelf of shelves) {
      const fit = options.find(([w, d]) => d <= shelf.depth && shelf.cursor + w <= bedX);
      if (fit) {
        put(shelf, it, ...fit);
        done = true;
        break;
      }
    }
    if (done) continue;
    const last = shelves[shelves.length - 1];
    const y = last ? last.y + last.depth + gap : 0;
    const fit = options.find(([w, d]) => w <= bedX && y + d <= bedY);
    if (fit) {
      const shelf: Shelf = { y, depth: fit[1], cursor: 0 };
      shelves.push(shelf);
      put(shelf, it, ...fit);
    } else {
      unplaced.push(it);
    }
  }

  // Centre the packed block on the bed.
  const usedX = Math.max(0, ...shelves.map((s) => s.cursor - gap));
  const last = shelves[shelves.length - 1];
  const usedY = last ? last.y + last.depth : 0;
  const dx = (bedX - usedX) / 2;
  const dy = (bedY - usedY) / 2;
  for (const p of placed) {
    p.x += dx;
    p.y += dy;
  }
  const outside = new Set<Placement>();
  for (const it of unplaced) {
    const p: Placement = {
      id: it.id,
      instance: it.instance,
      x: bedX / 2,
      y: bedY / 2,
      width: it.w,
      depth: it.d,
      rotated: it.rotated,
    };
    placed.push(p);
    outside.add(p);
  }
  // Report placements in input order, the copies of a part in order.
  const index = new Map(footprints.map((f, i) => [f.id, i]));
  placed.sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0) || a.instance - b.instance);
  const overflow = [...new Set(unplaced.map((it) => it.id))];
  return {
    layout: { bed: [bed[0], bed[1], bed[2]], placements: placed, overflow },
    unplaced: outside,
  };
}

/** Print frame → bed: optional 90° turn about z, then move to the placement centre. */
export function placementTransform(p: Placement): Mat4 {
  const [c, s] = p.rotated ? [0, 1] : [1, 0];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, p.x, p.y, 0, 1];
}
