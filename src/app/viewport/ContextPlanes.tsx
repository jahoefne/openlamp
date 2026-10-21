/**
 * What the lamp stands on or hangs from: the print bed (grid + dark plate)
 * by default, the ceiling in the mounted view. The print orientation already
 * is the mounted orientation (housing up, open end down), so the ceiling just
 * sits on the mount face plus the mount's gap (strap + mating velcro ≈ 3 mm),
 * both from the assembly on screen. The grid stays at z 0, where the display
 * lift puts the lamp's lowest point.
 */
import { Grid } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { DoubleSide } from 'three';
import { useUiStore } from '../store/uiStore.ts';
import { ceilingMaterial } from './materials.ts';
import { useDisplayLift, useShownDerived } from './sceneDerived.ts';

const BED = 256;
/** Where the ceiling goes before anything is built. */
const DEFAULT_TOP = 150;
const DEFAULT_GAP = 3;

/** The ceiling's height on screen (display lift included). */
function useCeilingTop(): number {
  const d = useShownDerived();
  const lift = useDisplayLift();
  if (d?.ceilingZ === undefined) return DEFAULT_TOP + DEFAULT_GAP;
  return d.ceilingZ + (d.ceilingGap ?? DEFAULT_GAP) + lift;
}

export function ContextPlanes() {
  const mounted = useUiStore((s) => s.mounted);
  const top = useCeilingTop();
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => invalidate(), [mounted, top, invalidate]);

  if (mounted) {
    return (
      <mesh material={ceilingMaterial} position={[0, 0, top]}>
        <planeGeometry args={[400, 400]} />
      </mesh>
    );
  }
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
