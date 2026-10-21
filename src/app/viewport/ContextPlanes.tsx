/**
 * What the lamp stands on or hangs from: the print bed (grid + dark plate)
 * by default; in the mounted view what the assembly on screen says it is
 * mounted on (`Assembly.context`): the ceiling above the strap or the
 * pendant's canopy, the wall behind a wall arm, the floor under a standing
 * lamp. Positions are world coordinates plus the display lift, so the bed
 * grid stays at z 0, where the lift puts the lamp's lowest point.
 */
import { Grid } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { DoubleSide } from 'three';
import { useUiStore } from '../store/uiStore.ts';
import { ceilingMaterial, wallMaterial } from './materials.ts';
import { useDisplayLift, useShownContext } from './sceneDerived.ts';

const BED = 256;
/** Where the ceiling goes before anything is built. */
const DEFAULT_CEILING = 153;
/** Size of the ceiling, the wall and the floor planes, mm. */
const PLANE = 400;
const FLOOR = 800;
/** How far the wall plane sits behind `wallY` (the plate's back face), mm. */
const WALL_GAP = 0.5;

function BedGrid() {
  return (
    <>
      {/* drei's Grid lies in XZ; turned into the XY plane of the bed. */}
      <Grid
        args={[BED, BED]}
        rotation={[Math.PI / 2, 0, 0]}
        cellSize={16}
        cellThickness={1}
        cellColor="#2c3038"
        sectionSize={BED / 2}
        sectionThickness={1}
        sectionColor="#4a5060"
        fadeDistance={10_000}
        fadeStrength={0}
        side={DoubleSide}
      />
      <mesh position={[0, 0, -0.2]}>
        <planeGeometry args={[BED, BED]} />
        <meshBasicMaterial color="#1a1d24" transparent opacity={0.6} side={DoubleSide} />
      </mesh>
    </>
  );
}

function Floor({ z }: { z: number }) {
  return (
    <group position={[0, 0, z]}>
      <Grid
        args={[FLOOR, FLOOR]}
        rotation={[Math.PI / 2, 0, 0]}
        cellSize={50}
        cellThickness={1}
        cellColor="#5b554c"
        sectionSize={200}
        sectionThickness={1.2}
        sectionColor="#7a7266"
        fadeDistance={10_000}
        fadeStrength={0}
        side={DoubleSide}
      />
      <mesh position={[0, 0, -0.3]} material={ceilingMaterial}>
        <planeGeometry args={[FLOOR, FLOOR]} />
      </mesh>
    </group>
  );
}

export function ContextPlanes() {
  const mounted = useUiStore((s) => s.mounted);
  const context = useShownContext();
  const lift = useDisplayLift();
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => invalidate(), [mounted, context, lift, invalidate]);

  if (!mounted) return <BedGrid />;
  switch (context?.kind ?? 'ceiling') {
    case 'ceiling':
      // Facing down into the room (planeGeometry faces +z: half a turn about x).
      return (
        <mesh
          material={ceilingMaterial}
          position={[0, 0, (context?.ceilingZ ?? DEFAULT_CEILING) + lift]}
          rotation={[Math.PI, 0, 0]}
        >
          <planeGeometry args={[PLANE, PLANE]} />
        </mesh>
      );
    case 'wall':
      // A vertical plane y = wallY facing the room (+y; planeGeometry lies in
      // XY: turned −90° about x), just behind the plate's back face.
      return (
        <mesh
          material={wallMaterial}
          position={[0, (context?.wallY ?? -PLANE / 2) - WALL_GAP, PLANE / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[PLANE, PLANE]} />
        </mesh>
      );
    case 'floor':
      return <Floor z={(context?.floorZ ?? 0) + lift} />;
  }
}
