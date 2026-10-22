/**
 * The geometric family (polyhedral, pleated, lattice) — **stub until M3b**.
 * It clamps its parameters and widens its top like every family, says that
 * its parts arrive in the next step (an info) and hands the assembler a plain
 * revolved body with its bottom and top Ø and height as a stand-in, so the
 * lamp still renders.
 *
 * M3b replaces `validate` (the pattern period `2πr/n ≥ 2 × nozzle`, the
 * lattice's hole cap), `parts` (one `shade` part with `variant: 'geometric'`
 * params, see `GeometricShadeParams`), `collarTop` / `widenTop` if the top's
 * polygon presents less than `topDiameter` to the collar, and, if it can,
 * `profile`.
 */
import { clampShadeStyle, pendingFamilyInfo, standInRevolvedStyle, whole } from './common.ts';
import { revolvedShadeParts } from './revolved.ts';
import type { ShadeModule } from './types.ts';

export const geometricShade: ShadeModule<'geometric'> = {
  family: 'geometric',
  partKinds: ['shade'],
  pending: true,

  normalize(ctx) {
    const clamped = clampShadeStyle(ctx);
    const s = clamped.style;
    const style = {
      ...s,
      sides: whole(s.sides),
      pleatCount: whole(s.pleatCount),
      bands: whole(s.bands),
    };
    return { ...clamped, style };
  },

  validate: (ctx) => [pendingFamilyInfo(ctx)],

  collarTop: (ctx) => ctx.style.topDiameter,

  parts: (ctx) => revolvedShadeParts(ctx, standInRevolvedStyle(ctx.style)),
};
