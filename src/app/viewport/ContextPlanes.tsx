/**
 * What the lamp stands on or hangs from: the print bed (grid + dark plate)
 * by default; in the mounted view what the assembly on screen says it is
 * mounted on (`Assembly.context`): the ceiling above the strap or the
 * pendant's canopy, the wall behind a wall arm, the floor under a standing
 * lamp. Positions are world coordinates plus the display lift, so the bed
 * grid stays at z 0, where the lift puts the lamp's lowest point.
 *
 * The bed view has the printer's own bed instead: `BedPlate` (the plate and
 * its grid, inside the camera's bounds so a refit frames the whole bed) and
 * `BedVolume` (the height limit as a wire box).
 */
import { Grid } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import { BoxGeometry, DoubleSide, EdgesGeometry } from 'three';
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

/** The printer's bed in the bed view: centred on the origin, grid cells of 10 mm. */
export function BedPlate({ bed }: { bed: readonly [number, number, number] }) {
  const [x, y] = bed;
  return (
    <group name="bed-plate">
      <Grid
        args={[x, y]}
        rotation={[Math.PI / 2, 0, 0]}
        cellSize={10}
        cellThickness={0.8}
        cellColor="#2c3038"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#4a5060"
        fadeDistance={10_000}
        fadeStrength={0}
        side={DoubleSide}
      />
      <mesh position={[0, 0, -0.3]}>
        <planeGeometry args={[x, y]} />
        <meshBasicMaterial color="#1a1d24" side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** The build volume's height limit: a wire box over the bed. */
export function BedVolume({ bed }: { bed: readonly [number, number, number] }) {
  const [x, y, z] = bed;
  const edges = useMemo(() => {
    const box = new BoxGeometry(x, y, z);
    const lines = new EdgesGeometry(box);
    box.dispose();
    return lines;
  }, [x, y, z]);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    invalidate();
    return () => edges.dispose();
  }, [edges, invalidate]);
  return (
    <lineSegments geometry={edges} position={[0, 0, z / 2]}>
      <lineBasicMaterial color="#5b6273" transparent opacity={0.7} />
    </lineSegments>
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
