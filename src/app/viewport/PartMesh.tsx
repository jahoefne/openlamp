/**
 * One printable part in the viewport: a mesh per copy (`instanceTransforms`,
 * e.g. the stacked stem segments), all sharing the part's geometry and
 * material, placed by the transforms of the spec the shown geometry was built
 * from (so a mesh never moves ahead of its rebuild), moved along z by the
 * exploded view's `offsetZ`; in the bed view by the bed scene's `transforms`
 * instead (red when the part does not fit the bed). Clicking any copy picks
 * the part (and selects its node in the lamp tree); every copy gets the outline.
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
import type { Mat4, PartSpec } from '@core/model/assembly.ts';
import { useBuildStore } from '../store/buildStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { geometryRegistry } from '../worker/geometryRegistry.ts';
import { overflowMaterial, partMaterial } from './materials.ts';
import { sectionPlanes } from './sectionPlane.ts';
import { useMatrices } from './useMatrix.ts';

const OUTLINE_PLANES = [...sectionPlanes];
/** Pointer travel (px) above which a click is an orbit drag, not a selection. */
const CLICK_SLOP = 4;

export interface PartMeshProps {
  part: PartSpec;
  /** Print frame → world of each copy, replacing the assembled ones (the bed view). */
  transforms?: readonly Mat4[] | undefined;
  /** The exploded view's move along z, mm. */
  offsetZ?: number | undefined;
  /** Drawn in red: the part does not fit the bed (bed view). */
  overflow?: boolean | undefined;
}

export function PartMesh({ part, transforms, offsetZ = 0, overflow = false }: PartMeshProps) {
  const revision = useBuildStore((s) => s.parts[part.id]?.revision ?? 0);
  const shown = useBuildStore((s) => s.parts[part.id]?.built);
  const selected = useUiStore((s) => s.selectedPart === part.id);
  const selectPart = useUiStore((s) => s.selectPart);
  const invalidate = useThree((s) => s.invalidate);
  const matrices = useMatrices(transforms ?? (shown ?? part).instanceTransforms, offsetZ);
  const material = overflow ? overflowMaterial : partMaterial(part.colour);
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
    selectPart(part);
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
