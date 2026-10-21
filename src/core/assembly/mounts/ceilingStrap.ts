/**
 * The flush ceiling mount: a velcro strap runs across the hub's mount face and
 * through two belt-loop tunnels on its sides; the mating velcro is stuck to
 * the ceiling. Pucks only (the strap also holds the puck in its pocket). No
 * parts of its own. Its parameters are normalised with the classic shade's
 * (the fused print has the same tunnels).
 */
import type { StrapMountFace } from '../../model/parts.ts';
import type { MountOf } from '../../model/project.ts';
import { hangingTransforms } from './common.ts';
import type { MountModule } from './types.ts';

type StrapMount = MountOf<'ceilingStrap'>;

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

/**
 * The strap's numbers in `Assembly.derived` (the fused lamp uses them too):
 * the mount face (`ceilingZ`), the gap to the ceiling and the strap itself.
 */
export function strapDerived(mount: StrapMount, mountFaceZ: number): Record<string, number> {
  return {
    ceilingZ: mountFaceZ,
    ceilingGap: STRAP_CEILING_GAP,
    strapWidth: mount.strapWidth,
    strapThickness: mount.strapThickness,
    loopLength: mount.loopLength,
  };
}

export const ceilingStrapMount: MountModule<'ceilingStrap'> = {
  kind: 'ceilingStrap',
  partKinds: [],

  validate(ctx) {
    // The strap holds the puck in its pocket; a bulb or a strip needs another mount.
    if (ctx.light.kind === 'puck') return [];
    return [
      {
        severity: 'error',
        code: 'mount-light',
        paramPath: 'mount.kind',
        message:
          'The velcro strap holds LED pucks only; choose another mount for this light source.',
      },
    ];
  },

  hubFace: (ctx) => strapMountFace(ctx.mount),

  parts: () => ({ parts: [], interfaces: [] }),

  placement(ctx) {
    const { zTop } = ctx.hub.derived;
    return {
      ...hangingTransforms(ctx),
      partTransforms: {},
      context: { kind: 'ceiling', ceilingZ: zTop + STRAP_CEILING_GAP },
      derived: strapDerived(ctx.mount, zTop),
    };
  },
};
