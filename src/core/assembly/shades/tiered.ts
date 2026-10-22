/**
 * The tiered (PH-style) family — **stub until M3b**. It clamps its
 * parameters and widens its top tier like every family, says that its parts
 * arrive in the next step (an info) and hands the assembler a plain revolved
 * body with its bottom and top Ø as a stand-in, so the lamp still renders.
 *
 * M3b replaces `validate` (tier overlap, flat saucers), `parts` (one `tier`
 * part per tier, `<id>` for the top one with the collar and
 * `shadePartId(id, 'tier2')`… for the others, plus the `spacer` parts and
 * their joints, each with its transform into the shade frame; the tiers'
 * flips chosen by their overhang) and, if it can, `profile`.
 */
import { clampShadeStyle, pendingFamilyInfo, standInRevolvedStyle, whole } from './common.ts';
import { revolvedShadeParts } from './revolved.ts';
import type { ShadeModule } from './types.ts';

export const tieredShade: ShadeModule<'tiered'> = {
  family: 'tiered',
  partKinds: ['tier', 'spacer'],
  pending: true,

  normalize(ctx) {
    const clamped = clampShadeStyle(ctx);
    const style = {
      ...clamped.style,
      tiers: whole(clamped.style.tiers),
      spacers: whole(clamped.style.spacers),
    };
    return { ...clamped, style };
  },

  validate: (ctx) => [pendingFamilyInfo(ctx)],

  collarTop: (ctx) => ctx.style.topDiameter,

  parts: (ctx) => revolvedShadeParts(ctx, standInRevolvedStyle(ctx.style)),
};
