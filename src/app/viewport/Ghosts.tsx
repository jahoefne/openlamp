/**
 * Translucent stand-ins for what is not printed: the light (the LED puck in
 * its pocket, the bulb in its lampholder, the LED strip in its ring channel),
 * the velcro strap through the tunnels and the pendant's cord, placed from
 * the derived dimensions and the mount context of the assembly on screen
 * (`ceilingZ`, `puckZ`, `bulbZ`, `stripZ`, `context.cord`, … in the world
 * frame), so they move with the meshes, not ahead of them. Rendered inside
 * the display lift (see Viewport). In the exploded view they follow their
 * part: the light and the strap the hub (the fused shade), the cord the hub
 * at its lower end and the canopy at its upper end.
 *
 * In the light-on view the light is the light source: drawn lit (an opaque
 * warm glow, `glowMaterial`) even with the ghosts hidden; LightOn.tsx adds
 * its point light.
 */
import { useMemo } from 'react';
import { DoubleSide, MeshStandardMaterial, Vector2, type Material } from 'three';
import { shownLightOf, useShownContext, useShownDerived } from './sceneDerived.ts';
import { useUiStore } from '../store/uiStore.ts';
import { cordMaterial, glowMaterial, puckMaterial, strapMaterial } from './materials.ts';
import { useLightMode } from './useLightMode.ts';

/** The bulb ghost: warm, translucent glass. */
const bulbMaterial = new MeshStandardMaterial({
  color: 0xfff3d6,
  emissive: 0xffd58a,
  emissiveIntensity: 0.35,
  transparent: true,
  opacity: 0.5,
  roughness: 0.2,
});

/** The LED strip ghost: a flat lit ring. */
const stripMaterial = new MeshStandardMaterial({
  color: 0xfff6e0,
  emissive: 0xffe2a0,
  emissiveIntensity: 0.5,
  transparent: true,
  opacity: 0.75,
  roughness: 0.4,
  side: DoubleSide,
});

function Puck({
  z,
  diameter,
  height,
  lit,
}: {
  z: number;
  diameter: number;
  height: number;
  lit: boolean;
}) {
  const r = diameter / 2;
  return (
    <mesh
      material={lit ? glowMaterial : puckMaterial}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0, z + height / 2]}
    >
      <cylinderGeometry args={[r, r, height, 64]} />
    </mesh>
  );
}

function Strap({
  top,
  rBoss,
  width,
  thickness,
  loopLength,
}: {
  top: number;
  rBoss: number;
  width: number;
  thickness: number;
  loopLength: number;
}) {
  const th = Math.min(thickness, 2);
  const span = 2 * (rBoss + thickness);
  const tail = loopLength + 14;
  return (
    <>
      <mesh material={strapMaterial} position={[0, 0, top + th / 2]}>
        <boxGeometry args={[width, span, th]} />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh
          key={s}
          material={strapMaterial}
          position={[0, s * (rBoss + thickness / 2), top - tail / 2 + 1]}
        >
          <boxGeometry args={[width, th, tail]} />
        </mesh>
      ))}
    </>
  );
}

/**
 * The bulb: a sphere of its Ø at the far end, a neck narrowing to the cap
 * toward the lampholder (`capZ`, above it on a hanging lamp, below on a
 * standing one).
 */
function Bulb({
  z,
  capZ,
  diameter,
  length,
  capDiameter,
  material = bulbMaterial,
}: {
  z: number;
  capZ: number;
  diameter: number;
  length: number;
  capDiameter: number;
  material?: Material;
}) {
  const r = diameter / 2;
  const dir = capZ >= z ? 1 : -1; // from the glass toward the cap
  const sphereZ = capZ - dir * (length - r);
  const neck = Math.max(0, length - r);
  const capR = Math.min(capDiameter / 2, r);
  const neckR = Math.max(capR, r * 0.6);
  return (
    <>
      <mesh material={material} position={[0, 0, sphereZ]}>
        <sphereGeometry args={[r, 48, 24]} />
      </mesh>
      {neck > 0 ? (
        <mesh
          material={material}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, (sphereZ + capZ) / 2]}
        >
          {/* The cylinder's +y (radiusTop) turns to +z. */}
          <cylinderGeometry args={[dir > 0 ? capR : neckR, dir > 0 ? neckR : capR, neck, 48]} />
        </mesh>
      ) : null}
    </>
  );
}

/** The LED strip: a flat ring from the channel's inner Ø outward, its thickness around `z`. */
function StripRing({
  z,
  ringDiameter,
  width,
  thickness,
  material = stripMaterial,
}: {
  z: number;
  ringDiameter: number;
  width: number;
  thickness: number;
  material?: Material;
}) {
  const rIn = ringDiameter / 2;
  const rOut = rIn + width;
  const h = thickness / 2;
  const profile = useMemo(
    () => [
      new Vector2(rIn, -h),
      new Vector2(rOut, -h),
      new Vector2(rOut, h),
      new Vector2(rIn, h),
      new Vector2(rIn, -h),
    ],
    [rIn, rOut, h],
  );
  return (
    <mesh material={material} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, z]}>
      <latheGeometry args={[profile, 128]} />
    </mesh>
  );
}

/** The cord: a thin vertical cylinder on the axis from z0 up to z1. */
function Cord({ z0, z1, diameter }: { z0: number; z1: number; diameter: number }) {
  const r = diameter / 2;
  return (
    <mesh material={cordMaterial} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, (z0 + z1) / 2]}>
      <cylinderGeometry args={[r, r, z1 - z0, 12]} />
    </mesh>
  );
}

/** The exploded view's z offset of each part, by part id. */
export type PartOffsets = ReadonlyMap<string, number>;

const NO_OFFSETS: PartOffsets = new Map();

export function Ghosts({ offsets = NO_OFFSETS }: { offsets?: PartOffsets }) {
  const visible = useUiStore((s) => s.ghosts);
  const lit = useLightMode() !== 'off';
  const d = useShownDerived();
  const cord = useShownContext()?.cord;
  if ((!visible && !lit) || !d) return null;
  const light = shownLightOf(d);
  const { ceilingZ, rBoss } = d;
  const { strapWidth, strapThickness, loopLength } = d;
  // The light and the strap sit in the hub (the fused print has no hub: its shade).
  const hubDz = offsets.get('hub') ?? offsets.get('shade') ?? 0;
  const canopyDz = offsets.get('canopy') ?? 0;
  return (
    <>
      <group position={[0, 0, hubDz]}>
        {light?.kind === 'puck' ? (
          <Puck z={light.z} diameter={light.diameter} height={light.height} lit={lit} />
        ) : null}
        {light?.kind === 'bulb' ? (
          <Bulb {...light} material={lit ? glowMaterial : bulbMaterial} />
        ) : null}
        {light?.kind === 'strip' ? (
          <StripRing {...light} material={lit ? glowMaterial : stripMaterial} />
        ) : null}
      </group>
      {visible &&
      ceilingZ !== undefined &&
      rBoss !== undefined &&
      strapWidth !== undefined &&
      strapThickness !== undefined &&
      loopLength !== undefined ? (
        <Strap
          top={ceilingZ + hubDz}
          rBoss={rBoss}
          width={strapWidth}
          thickness={strapThickness}
          loopLength={loopLength}
        />
      ) : null}
      {visible && cord && cord.z1 + canopyDz > cord.z0 + hubDz ? (
        <Cord z0={cord.z0 + hubDz} z1={cord.z1 + canopyDz} diameter={cord.diameter} />
      ) : null}
    </>
  );
}
