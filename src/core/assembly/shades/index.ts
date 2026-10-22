/**
 * Shade style families by family: every family is one `ShadeModule` (see
 * types.ts), so `assemble()` stays generic: revolved, tiered, slatted,
 * geometric. `resolveShade` runs a shade through its module.
 */
import type { Warning } from '../../model/assembly.ts';
import type { ShadeRole } from '../../model/project.ts';
import type { ShadeFamily } from '../../schema/defs.ts';
import { widenShadeTop } from '../interfaces.ts';
import { geometricShade } from './geometric.ts';
import { revolvedShade } from './revolved.ts';
import { slattedShade } from './slatted.ts';
import { tieredShade } from './tiered.ts';
import type { ShadeCtx, ShadeModule, ShadeParts, ShadeProfile } from './types.ts';

export type { ShadeCtx, ShadeModule, ShadePart, ShadeParts, ShadeProfile } from './types.ts';
export {
  SHADE_PART_IDS,
  clampShadeStyle,
  pendingFamilyInfo,
  shadePartColour,
  shadePartId,
  shadeRoleOfPart,
  standInRevolvedStyle,
} from './common.ts';
export {
  SHADE_PRINT_NOTES,
  revolvedShadeParamsOf,
  revolvedShadeParts,
  revolvedShadeProfile,
  shadeDisplayName,
} from './revolved.ts';
export { MIN_SLAT_SPAN, slattedShadeParamsOf } from './slatted.ts';

export const SHADE_MODULES: { readonly [F in ShadeFamily]: ShadeModule<F> } = {
  revolved: revolvedShade,
  tiered: tieredShade,
  slatted: slattedShade,
  geometric: geometricShade,
};

/** The module of a shade family. */
export function shadeModule<F extends ShadeFamily>(family: F): ShadeModule<F> {
  return SHADE_MODULES[family];
}

/** A shade run through its family's module. */
export interface ResolvedShade {
  role: ShadeRole;
  /** Its collar part's id. */
  id: string;
  family: ShadeFamily;
  /** The context `parts` saw: the style normalised and widened. */
  ctx: ShadeCtx;
  parts: ShadeParts;
  /** Its radii for the clearance check, if its family has them. */
  profile: ShadeProfile | undefined;
  /** In order: `normalize`, the widened top, `validate`, `parts`. */
  warnings: Warning[];
}

/**
 * One shade through its family's module: `normalize`, the top widened to
 * clear the hub ring (`widenShadeTop`), `validate`, `parts`, `profile`.
 */
export function resolveShade(ctx: ShadeCtx): ResolvedShade {
  // Method parameters are bivariant: the family's module takes this ctx.
  const module: ShadeModule = shadeModule(ctx.style.family);
  const warnings: Warning[] = [];
  let c = ctx;
  const normalised = module.normalize?.(c);
  if (normalised) {
    warnings.push(...normalised.warnings);
    c = { ...c, style: normalised.style, wallThickness: normalised.wallThickness };
  }
  const widened = widenShadeTop(
    c.style,
    module.collarTop(c),
    c.minTopDiameter,
    { role: c.role, partId: c.id },
    module.widenTop ? (min) => module.widenTop!(c, min) : undefined,
  );
  if (widened.warning) warnings.push(widened.warning);
  c = { ...c, style: widened.style };
  warnings.push(...module.validate(c));
  const parts = module.parts(c);
  warnings.push(...(parts.warnings ?? []));
  return {
    role: c.role,
    id: c.id,
    family: c.style.family,
    ctx: c,
    parts,
    profile: module.profile?.(c),
    warnings,
  };
}
