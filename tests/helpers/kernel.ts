/**
 * The manifold-3d kernel for tests, initialised once per test process, and a
 * counter of live WASM objects for leak tests.
 */
import Module from 'manifold-3d';
import type { Kernel } from '../../src/core/geometry/kernel.ts';

let kernel: Promise<Kernel> | undefined;

export function getKernel(): Promise<Kernel> {
  kernel ??= Module().then((m) => {
    m.setup();
    return m;
  });
  return kernel;
}

type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Count every Manifold and CrossSection the kernel hands out and every one that
 * is deleted, by wrapping the static and instance methods of both classes. Unlike
 * the scope counter this also sees objects a builder forgot to track. Call
 * `restore()` when done.
 */
export function trackKernelObjects(k: Kernel): { live(): number; restore(): void } {
  const live = new Set<object>();
  const restores: (() => void)[] = [];
  const isWasmObject = (v: unknown): v is object =>
    v instanceof k.Manifold || v instanceof k.CrossSection;
  const note = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(note);
    else if (isWasmObject(v)) live.add(v);
  };

  const wrap = (target: object, name: string, orig: AnyFn): void => {
    const own = Object.getOwnPropertyDescriptor(target, name);
    const wrapped: AnyFn =
      name === 'delete'
        ? function (this: unknown, ...args) {
            live.delete(this as object);
            return orig.apply(this, args);
          }
        : function (this: unknown, ...args) {
            const result = orig.apply(this, args);
            note(result);
            return result;
          };
    Object.defineProperty(target, name, { value: wrapped, writable: true, configurable: true });
    restores.push(() => {
      if (own) Object.defineProperty(target, name, own);
      else delete (target as Record<string, unknown>)[name];
    });
  };

  // Instances do not inherit from `cls.prototype` itself (manifold-3d subclasses
  // the Embind class and answers `instanceof` with Symbol.hasInstance), so each
  // method is wrapped on the prototype that defines it, once.
  const done = new Map<object, Set<string>>();
  const wrapOnce = (target: object, name: string, orig: AnyFn): void => {
    const names = done.get(target) ?? new Set<string>();
    done.set(target, names);
    if (names.has(name)) return;
    names.add(name);
    wrap(target, name, orig);
  };

  for (const cls of [k.Manifold, k.CrossSection]) {
    for (const name of Object.getOwnPropertyNames(cls)) {
      const d = Object.getOwnPropertyDescriptor(cls, name);
      if (d && typeof d.value === 'function' && d.writable) wrapOnce(cls, name, d.value as AnyFn);
    }
    for (
      let proto: object | null = cls.prototype;
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto) as object | null
    ) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        const d = Object.getOwnPropertyDescriptor(proto, name);
        if (name !== 'constructor' && d && typeof d.value === 'function') {
          wrapOnce(proto, name, d.value as AnyFn);
        }
      }
    }
  }

  return {
    live: () => live.size,
    restore: () => {
      for (const r of restores.reverse()) r();
    },
  };
}
