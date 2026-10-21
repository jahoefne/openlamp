/**
 * The flush ceiling mount: a velcro strap runs across the hub's mount face and
 * through two belt-loop tunnels on its sides; the mating velcro is stuck to
 * the ceiling. Pucks only. No parts of its own.
 */
import type { StrapMountFace } from '../../model/parts.ts';
import type { Mount } from '../../model/project.ts';
import type { MountResolution } from './types.ts';

type StrapMount = Extract<Mount, { kind: 'ceilingStrap' }>;

/** Strap plus mating velcro between the mount face and the ceiling, mm. */
export const STRAP_CEILING_GAP = 3;

export function strapMountFace(mount: StrapMount): StrapMountFace {
  return {
    kind: 'strap',
    strapWidth: mount.strapWidth,
    strapThickness: mount.strapThickness,
    loopLength: mount.loopLength,
    loopWall: mount.loopWall,
  };
}

export function resolveCeilingStrap(mount: StrapMount): MountResolution {
  return { mountFace: strapMountFace(mount), parts: [], ceilingGap: STRAP_CEILING_GAP };
}
