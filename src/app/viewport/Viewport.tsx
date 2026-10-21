/**
 * The 3D view: react-three-fiber canvas, rendered on demand.
 */
import './zUp.ts';
import { Canvas } from '@react-three/fiber';
import { useAssembly } from '../store/selectors.ts';
import { useUiStore } from '../store/uiStore.ts';
import type { ReactNode } from 'react';
import { CameraRig } from './CameraRig.tsx';
import { ContextPlanes } from './ContextPlanes.tsx';
import { Ghosts } from './Ghosts.tsx';
import { PartMesh } from './PartMesh.tsx';
import { useDisplayLift } from './sceneDerived.ts';
import { SectionPlane } from './SectionPlane.tsx';
import styles from './Viewport.module.css';

function Parts() {
  const { parts } = useAssembly();
  return parts.map((part) => <PartMesh key={part.id} part={part} />);
}

/** World → screen: lifts the lamp so its lowest point stands on the grid (see sceneDerived.ts). */
function Lifted({ children }: { children: ReactNode }) {
  const lift = useDisplayLift();
  return <group position={[0, 0, lift]}>{children}</group>;
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

export function Viewport() {
  const select = useUiStore((s) => s.select);
  return (
    <div className={styles.viewport}>
      <Canvas
        className={styles.canvas}
        frameloop="demand"
        dpr={[1, 2]}
        flat
        gl={{ antialias: true, localClippingEnabled: true }}
        camera={{ up: [0, 0, 1], position: [260, -300, 220], fov: 40, near: 1, far: 4000 }}
        onPointerMissed={() => select(null)}
      >
        <color attach="background" args={['#15171c']} />
        <Lights />
        <SectionPlane />
        <CameraRig>
          <Lifted>
            <Parts />
          </Lifted>
        </CameraRig>
        <Lifted>
          <Ghosts />
        </Lifted>
        <ContextPlanes />
      </Canvas>
    </div>
  );
}
