/**
 * Where the lamp on screen is: `Assembly.derived` of the latest finished
 * build (buildStore.shownDerived), so the ghosts, the ceiling and the display
 * lift move with the meshes, not ahead of them.
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

/**
 * How far the scene is lifted so the lamp's lowest point stands on the grid
 * at z 0: 0 for a fused shade (its print frame is the world), the shade's
 * collar height for a split lamp (the hub's collar plane is world z 0).
 */
export function useDisplayLift(): number {
  return useBuildStore((s) => -(s.shownDerived?.bottomZ ?? 0));
}
