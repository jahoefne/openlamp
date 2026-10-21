/**
 * Which parts of a new assembly need building. Pure (no three.js, no worker):
 * shared by the build pipeline and its unit test.
 */
import type { PartSpec } from '@core/model/assembly.ts';

/** What the diff needs to know about a part's current build. */
export interface PartBuildRef {
  /** Hash of the geometry the viewport shows for this part, if any. */
  readyHash?: string | undefined;
}

export interface PartsDiff {
  /** Parts whose displayed geometry is not theirs: build them (in assembly order). */
  build: PartSpec[];
  /** Parts whose displayed geometry already has their hash: nothing to do. */
  unchanged: PartSpec[];
  /** Ids that have a build but are no longer in the assembly. */
  removed: string[];
}

/**
 * Compare the assembly's parts with the current builds by hash. A part counts
 * as unchanged only if the geometry already on screen was built from the same
 * hash; a build still in flight does not count (the client drops the results
 * of superseded generations, so it would never arrive).
 */
export function diffParts(
  parts: readonly PartSpec[],
  current: Readonly<Record<string, PartBuildRef>>,
): PartsDiff {
  const build: PartSpec[] = [];
  const unchanged: PartSpec[] = [];
  const ids = new Set<string>();
  for (const part of parts) {
    ids.add(part.id);
    if (current[part.id]?.readyHash === part.hash) unchanged.push(part);
    else build.push(part);
  }
  const removed = Object.keys(current).filter((id) => !ids.has(id));
  return { build, unchanged, removed };
}
