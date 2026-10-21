/**
 * Where the lamp on screen is: `Assembly.derived` of the latest finished
 * build (buildStore.shownDerived), so the ghosts, the ceiling and the display
 * lift move with the meshes, not ahead of them. `shownLightOf` reads the
 * light's numbers (puck, bulb or strip ring) out of it for the ghosts.
 */
import type { MountContext } from '@core/model/assembly.ts';
import { useBuildStore } from '../store/buildStore.ts';

/** The derived dimensions (world frame) of the lamp on screen, or null before the first build. */
export function useShownDerived(): Readonly<Record<string, number>> | null {
  return useBuildStore((s) => s.shownDerived);
}

/** What the lamp on screen is mounted on (ceiling, wall, floor), or null before the first build. */
export function useShownContext(): Readonly<MountContext> | null {
  return useBuildStore((s) => s.shownContext);
}

/** The light on screen, in the world frame, as the ghosts draw it (see `lightDerived` in core). */
export type ShownLight =
  /** The puck: its underside `z`, Ø, thickness. */
  | { kind: 'puck'; z: number; diameter: number; height: number }
  /** The bulb: its centre, the end in the lampholder (`capZ`), Ø, length, the cap's Ø. */
  | { kind: 'bulb'; z: number; capZ: number; diameter: number; length: number; capDiameter: number }
  /** The strip ring: its mid-plane, the channel's inner Ø, the strip's width and thickness. */
  | { kind: 'strip'; z: number; ringDiameter: number; width: number; thickness: number };

/** The light of a lamp's derived numbers, or null when there is none to draw. */
export function shownLightOf(d: Readonly<Record<string, number>>): ShownLight | null {
  const { puckZ, puckDiameter, puckHeight } = d;
  if (puckZ !== undefined && puckDiameter !== undefined && puckHeight !== undefined) {
    return { kind: 'puck', z: puckZ, diameter: puckDiameter, height: puckHeight };
  }
  const { bulbZ, bulbCapZ, bulbDiameter, bulbLength, bulbCapDiameter } = d;
  if (
    bulbZ !== undefined &&
    bulbCapZ !== undefined &&
    bulbDiameter !== undefined &&
    bulbLength !== undefined &&
    bulbCapDiameter !== undefined
  ) {
    return {
      kind: 'bulb',
      z: bulbZ,
      capZ: bulbCapZ,
      diameter: bulbDiameter,
      length: bulbLength,
      capDiameter: bulbCapDiameter,
    };
  }
  const { stripZ, stripRingDiameter, stripWidth, stripThickness } = d;
  if (
    stripZ !== undefined &&
    stripRingDiameter !== undefined &&
    stripWidth !== undefined &&
    stripThickness !== undefined
  ) {
    return {
      kind: 'strip',
      z: stripZ,
      ringDiameter: stripRingDiameter,
      width: stripWidth,
      thickness: stripThickness,
    };
  }
  return null;
}

/**
 * How far the scene is lifted so the lamp's lowest point stands on the grid
 * at z 0: 0 for a fused shade (its print frame is the world), the shade's
 * collar height for a split lamp (the hub's collar plane is world z 0).
 */
export function useDisplayLift(): number {
  return useBuildStore((s) => -(s.shownDerived?.bottomZ ?? 0));
}
