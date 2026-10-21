/**
 * The 3D view: react-three-fiber canvas, rendered on demand.
 *
 * - Assembled (`viewMode: 'assembled'`): every part where the lamp has it,
 *   lifted so the lamp stands on the grid, moved apart along z by the
 *   exploded view (`useExplode`), with the ghosts (light, strap, cord) and
 *   what the lamp is mounted on (`ContextPlanes`).
 * - Bed (`viewMode: 'bed'`): every copy of every part in its print
 *   orientation where the plate layout puts it on the printer's bed
 *   (`bedScene`), parts that do not fit beside the bed in red; the bed with
 *   its height limit, no ghosts, no context planes.
 *
 * A click on a part picks it (and selects its lamp-tree node); a click on
 * empty space goes back to the project node.
 */
import './zUp.ts';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { useBuildStore } from '../store/buildStore.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { useAssembly } from '../store/selectors.ts';
import { useUiStore } from '../store/uiStore.ts';
import { bedScene, type BedScene } from './bedView.ts';
import { CameraRig } from './CameraRig.tsx';
import { BedPlate, BedVolume, ContextPlanes } from './ContextPlanes.tsx';
import { Ghosts } from './Ghosts.tsx';
import { PartMesh } from './PartMesh.tsx';
import { useDisplayLift } from './sceneDerived.ts';
import { SectionPlane } from './SectionPlane.tsx';
import { useExplode } from './useExplode.ts';
import styles from './Viewport.module.css';

/** The bed view's layout of the current parts, or null in the assembled view. */
function useBedScene(on: boolean): BedScene | null {
  const { parts } = useAssembly();
  const bed = useProjectStore((s) => s.project.printer.bed);
  const builds = useBuildStore((s) => s.parts);
  return useMemo(
    () => (on ? bedScene(parts, bed, (id) => builds[id]?.stats?.bbox) : null),
    [on, parts, bed, builds],
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#404060', 1.1]} />
      <directionalLight color="#ffffff" intensity={1.6} position={[200, -300, 400]} />
      <directionalLight color="#ffe9c4" intensity={0.5} position={[-300, 200, 100]} />
    </>
  );
}

function Scene() {
  const { parts } = useAssembly();
  const bedView = useUiStore((s) => s.viewMode === 'bed');
  const explode = useUiStore((s) => s.explode);
  const offsets = useExplode(parts, bedView ? 0 : explode);
  const bed = useBedScene(bedView);
  // World → screen: the assembled lamp is lifted so its lowest point stands on the grid.
  const lift = useDisplayLift();
  return (
    <>
      <CameraRig>
        <group position={[0, 0, bed ? 0 : lift]}>
          {parts.map((part) => {
            const onBed = bed?.parts.get(part.id);
            return (
              <PartMesh
                key={part.id}
                part={part}
                transforms={onBed?.matrices}
                offsetZ={offsets.get(part.id) ?? 0}
                overflow={onBed?.overflow}
              />
            );
          })}
        </group>
        {bed ? <BedPlate bed={bed.bed} /> : null}
      </CameraRig>
      {bed ? (
        <BedVolume bed={bed.bed} />
      ) : (
        <>
          <group position={[0, 0, lift]}>
            <Ghosts offsets={offsets} />
          </group>
          <ContextPlanes />
        </>
      )}
    </>
  );
}

export function Viewport() {
  const clearSelection = useUiStore((s) => s.clearSelection);
  return (
    <div className={styles.viewport}>
      <Canvas
        className={styles.canvas}
        frameloop="demand"
        dpr={[1, 2]}
        flat
        gl={{ antialias: true, localClippingEnabled: true }}
        camera={{ up: [0, 0, 1], position: [260, -300, 220], fov: 40, near: 1, far: 4000 }}
        onPointerMissed={() => clearSelection()}
      >
        <color attach="background" args={['#15171c']} />
        <Lights />
        <SectionPlane />
        <Scene />
      </Canvas>
    </div>
  );
}
