/**
 * Translucent stand-ins for what is not printed: the light (the LED puck in
 * its pocket, the bulb in its lampholder, the LED strip in its ring channel),
 * the velcro strap through the tunnels and the pendant's cord, placed from
 * the derived dimensions and the mount context of the assembly on screen
 * (`ceilingZ`, `puckZ`, `bulbZ`, `stripZ`, `context.cord`, … in the world
 * frame), so they move with the meshes, not ahead of them. Rendered inside
 * the display lift (see Viewport).
 */
import { useMemo } from 'react';
import { DoubleSide, MeshStandardMaterial, Vector2 } from 'three';
import { shownLightOf, useShownContext, useShownDerived } from './sceneDerived.ts';
import { useUiStore } from '../store/uiStore.ts';
import { cordMaterial, puckMaterial, strapMaterial } from './materials.ts';

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

function Puck({ z, diameter, height }: { z: number; diameter: number; height: number }) {
  const r = diameter / 2;
  return (
    <mesh material={puckMaterial} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, z + height / 2]}>
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
}: {
  z: number;
  capZ: number;
  diameter: number;
  length: number;
  capDiameter: number;
}) {
  const r = diameter / 2;
  const dir = capZ >= z ? 1 : -1; // from the glass toward the cap
  const sphereZ = capZ - dir * (length - r);
  const neck = Math.max(0, length - r);
  const capR = Math.min(capDiameter / 2, r);
  const neckR = Math.max(capR, r * 0.6);
  return (
    <>
      <mesh material={bulbMaterial} position={[0, 0, sphereZ]}>
        <sphereGeometry args={[r, 48, 24]} />
      </mesh>
      {neck > 0 ? (
        <mesh
          material={bulbMaterial}
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
}: {
  z: number;
  ringDiameter: number;
  width: number;
  thickness: number;
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
    <mesh material={stripMaterial} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, z]}>
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

export function Ghosts() {
  const visible = useUiStore((s) => s.ghosts);
  const d = useShownDerived();
  const cord = useShownContext()?.cord;
  if (!visible || !d) return null;
  const light = shownLightOf(d);
  const { ceilingZ, rBoss } = d;
  const { strapWidth, strapThickness, loopLength } = d;
  return (
    <>
      {light?.kind === 'puck' ? (
        <Puck z={light.z} diameter={light.diameter} height={light.height} />
      ) : null}
      {light?.kind === 'bulb' ? <Bulb {...light} /> : null}
      {light?.kind === 'strip' ? <StripRing {...light} /> : null}
      {ceilingZ !== undefined &&
      rBoss !== undefined &&
      strapWidth !== undefined &&
      strapThickness !== undefined &&
      loopLength !== undefined ? (
        <Strap
          top={ceilingZ}
          rBoss={rBoss}
          width={strapWidth}
          thickness={strapThickness}
          loopLength={loopLength}
        />
      ) : null}
      {cord && cord.z1 > cord.z0 ? <Cord {...cord} /> : null}
    </>
  );
}
