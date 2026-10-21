/**
 * Translucent stand-ins for what is not printed: the LED puck in its pocket,
 * the velcro strap through the tunnels and the pendant's cord, placed from
 * the derived dimensions and the mount context of the assembly on screen
 * (`ceilingZ`, `puckZ`, `context.cord`, … in the world frame), so they move
 * with the meshes, not ahead of them. Rendered inside the display lift (see
 * Viewport).
 */
import { useShownContext, useShownDerived } from './sceneDerived.ts';
import { useUiStore } from '../store/uiStore.ts';
import { cordMaterial, puckMaterial, strapMaterial } from './materials.ts';

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
  const { puckZ, puckDiameter, puckHeight, ceilingZ, rBoss } = d;
  const { strapWidth, strapThickness, loopLength } = d;
  return (
    <>
      {puckZ !== undefined && puckDiameter !== undefined && puckHeight !== undefined ? (
        <Puck z={puckZ} diameter={puckDiameter} height={puckHeight} />
      ) : null}
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
