/**
 * The exploded view's z offset per part id (see explode.ts), from the parts on
 * screen: each part's built bounding box through the transforms of the spec
 * its mesh was built from, so the ranking follows what is shown.
 */
import { useMemo } from 'react';
import type { PartSpec } from '@core/model/assembly.ts';
import { useBuildStore } from '../store/buildStore.ts';
import { explodeOffsets } from './explode.ts';

export function useExplode(
  parts: readonly PartSpec[],
  factor: number,
): ReadonlyMap<string, number> {
  const builds = useBuildStore((s) => s.parts);
  return useMemo(
    () =>
      explodeOffsets(
        parts.map((p) => {
          const b = builds[p.id];
          return { id: p.id, transforms: (b?.built ?? p).instanceTransforms, bbox: b?.stats?.bbox };
        }),
        factor,
      ),
    [parts, builds, factor],
  );
}
