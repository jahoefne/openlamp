import { describe, expect, it } from 'vitest';
import { PartCache } from '@core/geometry/cache.ts';
import type { Manifold } from '@core/geometry/kernel.ts';
import type { PartStats } from '@core/model/assembly.ts';

function fakePart(triangles: number, deleted: string[], name: string) {
  const manifold = { delete: () => deleted.push(name) } as unknown as Manifold;
  return { manifold, stats: { triangles } as PartStats };
}

describe('PartCache', () => {
  it('evicts least recently used parts over the triangle budget and deletes them', () => {
    const deleted: string[] = [];
    const cache = new PartCache(100);
    cache.set('a', fakePart(40, deleted, 'a'));
    cache.set('b', fakePart(40, deleted, 'b'));
    expect(cache.get('a')).toBeDefined(); // a is now the most recently used
    cache.set('c', fakePart(40, deleted, 'c'));
    expect(deleted).toEqual(['b']);
    expect(cache.size).toBe(2);
    expect(cache.triangles).toBe(80);
    expect(cache.has('b')).toBe(false);
  });

  it('keeps a single part larger than the budget, replaces and clears', () => {
    const deleted: string[] = [];
    const cache = new PartCache(10);
    cache.set('a', fakePart(50, deleted, 'a'));
    expect(cache.size).toBe(1);
    cache.set('a', fakePart(5, deleted, 'a2'));
    expect(deleted).toEqual(['a']);
    expect(cache.triangles).toBe(5);
    cache.clear();
    expect(deleted).toEqual(['a', 'a2']);
    expect(cache.size).toBe(0);
  });
});
