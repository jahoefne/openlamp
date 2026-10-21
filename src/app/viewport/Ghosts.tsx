/**
 * Translucent stand-ins for what is not printed: the LED puck in its pocket
 * and the velcro strap through the tunnels, placed from the derived dimensions
 * of the shade on screen (so they move with the mesh, not ahead of it).
 */
import type { ClassicShadeDerived } from '@core/geometry/parts/classicShade.ts';
import type { PartSpec } from '@core/model/assembly.ts';
import type { ClassicShadeParams } from '@core/schema/defs.ts';
import { useBuildStore } from '../store/buildStore.ts';
import { useAssembly } from '../store/selectors.ts';
import { useUiStore } from '../store/uiStore.ts';
import { puckMaterial, strapMaterial } from './materials.ts';
import { useMatrix } from './useMatrix.ts';

/** Ghosts of one classic shade (puck + strap), in the shade's print frame. */
function ClassicShadeGhosts({
  part,
  params,
  derived: d,
}: {
  part: PartSpec;
  params: ClassicShadeParams;
  derived: ClassicShadeDerived;
}) {
  const matrix = useMatrix(part.assembledTransform);
  const w = params.strapWidth;
  const th = Math.min(params.strapThickness, 2);
  const span = 2 * (d.rBoss + params.strapThickness);
  const tail = params.loopLength + 14;
  const r = params.puckDiameter / 2;
  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <group position={[0, 0, d.zOffset || 0]}>
        <mesh
          material={puckMaterial}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, d.zFloor + params.puckHeight / 2]}
        >
          <cylinderGeometry args={[r, r, params.puckHeight, 64]} />
        </mesh>
        <mesh material={strapMaterial} position={[0, 0, d.zTop + th / 2]}>
          <boxGeometry args={[w, span, th]} />
        </mesh>
        {([-1, 1] as const).map((s) => (
          <mesh
            key={s}
            material={strapMaterial}
            position={[0, s * (d.rBoss + params.strapThickness / 2), d.zTop - tail / 2 + 1]}
          >
            <boxGeometry args={[w, th, tail]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Ghosts() {
  const visible = useUiStore((s) => s.ghosts);
  const { parts } = useAssembly();
  const builds = useBuildStore((s) => s.parts);
  if (!visible) return null;
  return parts.map((part) => {
    const b = builds[part.id];
    const derived = b?.stats?.derived;
    if (part.kind !== 'classicShade' || b?.built?.kind !== 'classicShade' || !derived) return null;
    return (
      <ClassicShadeGhosts
        key={part.id}
        part={part}
        params={b.built.params}
        // The classic-shade builder reports its `derive()` dimensions plus zOffset.
        derived={derived as ClassicShadeDerived}
      />
    );
  });
}
