/**
 * One printable part in the viewport: a mesh per copy (`instanceTransforms`,
 * e.g. the stacked stem segments), all sharing the part's geometry and
 * material, placed by the transforms of the spec the shown geometry was built
 * from (so a mesh never moves ahead of its rebuild). Selecting any copy
 * selects the part, and every copy gets the outline.
 *
 * The geometry comes from the geometry registry and is re-read whenever the
 * part's build `revision` changes, so the old mesh stays on screen while a new
 * one is building. It is passed as the `geometry` prop (applied in the commit,
 * before any layout effect) rather than swapped in a layout effect, because
 * drei's <Outlines> reads its parent's geometry in its own layout effect,
 * which runs before the parent's.
 */
import { Outlines } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import type { PartSpec } from '@core/model/assembly.ts';
import { useBuildStore } from '../store/buildStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { geometryRegistry } from '../worker/geometryRegistry.ts';
import { partMaterial } from './materials.ts';
import { sectionPlanes } from './sectionPlane.ts';
import { useMatrices } from './useMatrix.ts';

const OUTLINE_PLANES = [...sectionPlanes];
/** Pointer travel (px) above which a click is an orbit drag, not a selection. */
const CLICK_SLOP = 4;

export function PartMesh({ part }: { part: PartSpec }) {
  const revision = useBuildStore((s) => s.parts[part.id]?.revision ?? 0);
  const shown = useBuildStore((s) => s.parts[part.id]?.built);
  const selected = useUiStore((s) => s.selection === part.id);
  const select = useUiStore((s) => s.select);
  const invalidate = useThree((s) => s.invalidate);
  const matrices = useMatrices((shown ?? part).instanceTransforms);
  const material = partMaterial(part.colour);
  // `revision` names the registry entry this render shows.
  const geometry = revision > 0 ? geometryRegistry.get(part.id) : undefined;

  useLayoutEffect(() => {
    invalidate();
    // Free the GPU buffers of a geometry once it is swapped out, unless the
    // registry still holds it (an unmount while the part stays in the lamp).
    return () => {
      if (geometry && !geometryRegistry.owns(part.id, geometry)) geometry.dispose();
    };
  }, [geometry, part.id, invalidate]);

  useLayoutEffect(() => invalidate(), [material, matrices, selected, invalidate]);

  if (!geometry) return null;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_SLOP) return;
    e.stopPropagation();
    select(part.id);
  };

  return matrices.map((matrix, i) => (
    <mesh
      key={i}
      name={i === 0 ? part.id : `${part.id}#${i}`}
      geometry={geometry}
      material={material}
      matrixAutoUpdate={false}
      matrix={matrix}
      dispose={null}
      onClick={onClick}
    >
      {selected && (
        <Outlines
          color="#f2b544"
          thickness={2}
          screenspace
          angle={0}
          clippingPlanes={OUTLINE_PLANES}
        />
      )}
    </mesh>
  ));
}
