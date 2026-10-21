/**
 * The geometry kernel and the memory helper every builder runs in.
 *
 * The kernel is the initialised manifold-3d module (`Module()` + `setup()`). Core
 * never loads it itself: the worker, the CLI and the tests each initialise it
 * their own way and pass it in, so this file has no runtime import of
 * manifold-3d at all.
 *
 * Manifold and CrossSection objects live on the WASM heap and are not garbage
 * collected; each one must be `.delete()`d exactly once. `scoped()` tracks what a
 * builder creates and deletes everything it did not keep, also when it throws:
 *
 *   const shell = scoped(k, (s) => {
 *     const outer = s.add(k.Manifold.cylinder(10, 5));
 *     const inner = s.add(s.add(k.Manifold.cylinder(12, 4)).translate([0, 0, -1]));
 *     let body = s.add(outer.subtract(inner));
 *     body = s.swap(body, body.warp(fn)); // `body = body.warp()` without a leak
 *     return s.keep(body); // the caller owns it now
 *   });
 */
import type { ManifoldToplevel } from 'manifold-3d';

export type Kernel = ManifoldToplevel;
export type { Box, CrossSection, ErrorStatus, Manifold, Mesh, Vec2, Vec3 } from 'manifold-3d';

/** Anything that owns WASM memory. */
export interface Deletable {
  delete(): void;
}

export interface Scope {
  /** The kernel the scope was opened with. */
  readonly k: Kernel;
  /** Track `obj`: it is deleted when the scope closes. Returns `obj`. */
  add<T extends Deletable>(obj: T): T;
  /**
   * Hand `obj` to the caller: it survives the scope (unless the scope throws, in
   * which case nobody would own it and it is deleted too). Returns `obj`.
   */
  keep<T extends Deletable>(obj: T): T;
  /** Delete `old` (which this scope must own) now and track `next` instead. Returns `next`. */
  swap<T extends Deletable>(old: T, next: T): T;
}

// Leak accounting: every object a scope tracks is counted until a scope deletes
// it or it is passed to `dispose()`. After a build has returned and its result
// was disposed, `liveObjects()` is back where it started.
const registered = new WeakSet<Deletable>();
let live = 0;

function register(obj: Deletable): void {
  if (!registered.has(obj)) {
    registered.add(obj);
    live++;
  }
}

/** Delete an object that came out of a scope (a builder result, a cache entry). */
export function dispose(obj: Deletable): void {
  if (registered.delete(obj)) live--;
  obj.delete();
}

/** Objects tracked by a scope that have not been deleted or disposed yet. */
export function liveObjects(): number {
  return live;
}

/**
 * Run `fn` with a fresh scope and free every object it tracked but did not keep
 * once it returns or throws. `fn` must be synchronous.
 */
export function scoped<T>(k: Kernel, fn: (s: Scope) => T): T {
  const tracked = new Set<Deletable>();
  const kept = new Set<Deletable>();
  const s: Scope = {
    k,
    add(obj) {
      register(obj);
      tracked.add(obj);
      return obj;
    },
    keep(obj) {
      register(obj);
      tracked.add(obj);
      kept.add(obj);
      return obj;
    },
    swap(old, next) {
      s.add(next);
      if (old !== next) {
        tracked.delete(old);
        kept.delete(old);
        dispose(old);
      }
      return next;
    },
  };

  // Delete every tracked object (all of them, or all but the kept ones), even
  // if one delete fails; returns the first failure.
  const release = (keepKept: boolean): { error: unknown } | undefined => {
    let failure: { error: unknown } | undefined;
    for (const obj of tracked) {
      if (keepKept && kept.has(obj)) continue;
      try {
        dispose(obj);
      } catch (error) {
        failure ??= { error };
      }
    }
    tracked.clear();
    return failure;
  };

  let result: T;
  try {
    result = fn(s);
  } catch (err) {
    release(false); // nobody owns the kept objects now; `err` wins over delete failures
    throw err;
  }
  const failure = release(true);
  if (failure) throw failure.error;
  return result;
}
