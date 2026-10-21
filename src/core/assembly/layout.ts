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
}

interface Shelf {
  y: number;
  depth: number;
  /** Next free x. */
  cursor: number;
}

/**
 * Pack footprints into shelves (rows) left to right, front to back, keeping
 * `gap` mm between parts. Each part is turned so its shorter side runs along Y
 * (lower shelves), and turned back when that is what fits the space left in a
 * shelf. The packed block is centred on the bed. Parts that do not fit go to
 * `overflow` and are centred on the bed on their own.
 */
export function layoutParts(
  footprints: readonly FootprintItem[],
  bed: readonly [number, number, number],
  gap = 10,
): Layout {
  const [bedX, bedY] = bed;
  const items = footprints.map((f) => {
    // Landscape orientation unless only portrait fits the bed width.
    const rotated = f.x < f.y && f.y <= bedX;
    return { id: f.id, w: rotated ? f.y : f.x, d: rotated ? f.x : f.y, rotated };
  });
  // Deepest first; ties keep their input order (Array.prototype.sort is stable).
  const order = [...items].sort((a, b) => b.d - a.d);

  const shelves: Shelf[] = [];
  const placed: Placement[] = [];
  const overflow: string[] = [];

  const put = (shelf: Shelf, id: string, w: number, d: number, rotated: boolean) => {
    placed.push({ id, x: shelf.cursor + w / 2, y: shelf.y + d / 2, width: w, depth: d, rotated });
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
        put(shelf, it.id, ...fit);
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
      put(shelf, it.id, ...fit);
    } else {
      overflow.push(it.id);
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
  for (const id of overflow) {
    const it = items.find((i) => i.id === id)!;
    placed.push({ id, x: bedX / 2, y: bedY / 2, width: it.w, depth: it.d, rotated: it.rotated });
  }
  // Report placements in input order.
  const index = new Map(footprints.map((f, i) => [f.id, i]));
  placed.sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
  return { bed: [bed[0], bed[1], bed[2]], placements: placed, overflow };
}

/** Print frame → bed: optional 90° turn about z, then move to the placement centre. */
export function placementTransform(p: Placement): Mat4 {
  const [c, s] = p.rotated ? [0, 1] : [1, 0];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, p.x, p.y, 0, 1];
}
