/**
 * Built parts by `buildKey`, least recently used first out once the total
 * triangle count exceeds the budget. Evicted manifolds are deleted, so a
 * manifold handed out by `get` is only valid until the next `set` or `clear`.
 */
import type { PartStats } from '../model/assembly.ts';
import { dispose, type Manifold } from './kernel.ts';

export interface CachedPart {
  manifold: Manifold;
  stats: PartStats;
}

export class PartCache {
  readonly maxTriangles: number;
  // Map iteration order is insertion order: the first entry is the least recently used.
  private readonly entries = new Map<string, CachedPart>();
  private total = 0;

  constructor(maxTriangles = 3_000_000) {
    this.maxTriangles = maxTriangles;
  }

  get size(): number {
    return this.entries.size;
  }

  /** Total triangles currently held. */
  get triangles(): number {
    return this.total;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): CachedPart | undefined {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }

  /**
   * Store a part (the cache takes ownership of the manifold), then evict least
   * recently used entries until the budget holds again. The new entry itself is
   * never evicted, even if it alone exceeds the budget.
   */
  set(key: string, part: CachedPart): void {
    const old = this.entries.get(key);
    if (old) {
      this.entries.delete(key);
      this.total -= old.stats.triangles;
      if (old.manifold !== part.manifold) dispose(old.manifold);
    }
    this.entries.set(key, part);
    this.total += part.stats.triangles;
    for (const [k, entry] of this.entries) {
      if (this.total <= this.maxTriangles || k === key) break;
      this.entries.delete(k);
      this.total -= entry.stats.triangles;
      dispose(entry.manifold);
    }
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.total -= entry.stats.triangles;
    dispose(entry.manifold);
    return true;
  }

  clear(): void {
    for (const entry of this.entries.values()) dispose(entry.manifold);
    this.entries.clear();
    this.total = 0;
  }
}
