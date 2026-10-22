/**
 * The light-on view (`uiStore.lightOn`, the View option or "L"; see
 * lightMode.ts for the decisions):
 *
 * - a warm point light where the light shines from (`lightSourceZ`: a puck's
 *   light face, a bulb's glass, a strip ring's face), following the hub in
 *   the exploded view; the light ghost itself glows (Ghosts.tsx);
 * - a synthetic environment (drei `<Environment>` rendered once from three
 *   `<Lightformer>`s at 64 px, no HDR download) for the reflections of the
 *   transmission shades and the reflective inner shade;
 * - the shades' light materials (PartMesh, materials.ts), the room's lights
 *   dimmed (Viewport's `Lights`).
 *
 * Rendered inside the display lift, like the ghosts. Toggling it redraws the
 * demand-driven canvas once.
 */
import { Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import type { PartOffsets } from './Ghosts.tsx';
import { LIGHT_COLOUR, lightSourceZ } from './lightMode.ts';
import { shownLightOf, useShownContext, useShownDerived } from './sceneDerived.ts';
import { useLightMode } from './useLightMode.ts';

/** The point light's intensity (with `decay` 1 it falls off as 1/d, d in mm: ≈ 5 at 120 mm). */
const SOURCE_INTENSITY = 600;
/** Linear falloff: softer across a shade's height than the physical 1/d². */
const SOURCE_DECAY = 1;
/** How strongly the synthetic environment lights every material. */
const ENVIRONMENT_INTENSITY = 0.5;

const NO_OFFSETS: PartOffsets = new Map();

export function LightOn({ offsets = NO_OFFSETS }: { offsets?: PartOffsets }) {
  const mode = useLightMode();
  const d = useShownDerived();
  const facing = useShownContext()?.kind === 'floor' ? 1 : -1;
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => invalidate(), [mode, invalidate]);
  if (mode === 'off') return null;
  const light = d ? shownLightOf(d) : null;
  // The light sits in the hub (the fused print has no hub: its shade).
  const hubDz = offsets.get('hub') ?? offsets.get('shade') ?? 0;
  return (
    <>
      <Environment resolution={64} frames={1} environmentIntensity={ENVIRONMENT_INTENSITY}>
        {/* A soft window above, a fill from the side, a warm bounce from below. */}
        <Lightformer form="rect" intensity={2} position={[0, 0, 6]} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1} position={[-6, 4, 1]} scale={[3, 6, 1]} />
        <Lightformer
          form="ring"
          color={LIGHT_COLOUR}
          intensity={1}
          position={[5, -5, -3]}
          scale={4}
        />
      </Environment>
      {light ? (
        <pointLight
          position={[0, 0, lightSourceZ(light, facing) + hubDz]}
          color={LIGHT_COLOUR}
          intensity={SOURCE_INTENSITY}
          decay={SOURCE_DECAY}
          distance={0}
        />
      ) : null}
    </>
  );
}
