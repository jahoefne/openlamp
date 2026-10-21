/**
 * Translucent stand-ins for what is not printed: the LED puck in its pocket
 * and the velcro strap through the tunnels, placed from the derived
 * dimensions of the assembly on screen (`ceilingZ`, `puckZ`, … in the world
 * frame), so they move with the meshes, not ahead of them. Rendered inside
 * the display lift (see Viewport).
 */
import { useShownDerived } from './sceneDerived.ts';
import { useUiStore } from '../store/uiStore.ts';
import { puckMaterial, strapMaterial } from './materials.ts';

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

export function Ghosts() {
  const visible = useUiStore((s) => s.ghosts);
  const d = useShownDerived();
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
    </>
  );
}
