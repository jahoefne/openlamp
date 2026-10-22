/**
 * Helpers shared by the shade modules.
 */
import type { Hex, PartKind, Warning } from '../../model/assembly.ts';
import {
  shadeParamPath,
  shadeStyleForFamily,
  shadeStyleFromParams,
  shadeToParams,
  type RevolvedStyle,
  type ShadeRole,
  type ShadeStyle,
  type ShadeStyleOf,
} from '../../model/project.ts';
import { SHADE_FAMILY_DEFS, SHADE_FAMILY_LABELS, type ShadeFamily } from '../../schema/defs.ts';
import { clampToSchema } from '../../schema/normalize.ts';
import type { ShadeCtx } from './types.ts';

/** The part id of each shade's collar part. */
export const SHADE_PART_IDS: Readonly<Record<ShadeRole, string>> = {
  outer: 'shade',
  inner: 'innerShade',
};

/** The id of a shade's further part (a tier, a spacer): `<shade id>-<suffix>`. */
export function shadePartId(shadeId: string, suffix: string): string {
  return `${shadeId}-${suffix}`;
}

/** Which shade a part belongs to (by its id), if any. */
export function shadeRoleOfPart(partId: string): ShadeRole | undefined {
  for (const role of ['outer', 'inner'] as const) {
    const id = SHADE_PART_IDS[role];
    if (partId === id || partId.startsWith(`${id}-`)) return role;
  }
  return undefined;
}

/**
 * The colour of one of a shade's parts: an override by its id, else (for a
 * further part, a tier or a spacer) by its kind, else the shade's colour.
 */
export function shadePartColour(
  ctx: Pick<ShadeCtx, 'id' | 'colour' | 'colours'>,
  partId: string,
  kind: PartKind,
): Hex {
  if (partId === ctx.id) return ctx.colour;
  return ctx.colours[partId] ?? (kind === 'shade' ? undefined : ctx.colours[kind]) ?? ctx.colour;
}

/** A clamp warning about a flat key of the shade → its project path and part. */
function locatedShadeWarning(
  ctx: Pick<ShadeCtx, 'role' | 'id'> & { style: { family: ShadeFamily } },
  w: Warning,
): Warning {
  const path =
    w.paramPath === undefined ? undefined : shadeParamPath(ctx.role, w.paramPath, ctx.style.family);
  return path === undefined ? { ...w, partId: ctx.id } : { ...w, partId: ctx.id, paramPath: path };
}

/**
 * Clamp the shade's style and wall to its family's parameter definitions
 * (`SHADE_FAMILY_DEFS`): the generic part of every module's `normalize`.
 * Warnings carry the project path (`shades.1.style.slatCount`) and the
 * shade's id.
 */
export function clampShadeStyle<F extends ShadeFamily>(
  ctx: ShadeCtx<F>,
): { style: ShadeStyleOf<F>; wallThickness: number; warnings: Warning[] } {
  const family = ctx.style.family as F;
  const flat = shadeToParams({ style: ctx.style, wallThickness: ctx.wallThickness });
  const clamped = clampToSchema(SHADE_FAMILY_DEFS[family], flat);
  return {
    style: shadeStyleFromParams(family, clamped.values) as ShadeStyleOf<F>,
    wallThickness: Number(clamped.values.wallThickness),
    warnings: clamped.warnings.map((w) => locatedShadeWarning(ctx, w)),
  };
}

/** `v` rounded to a whole number (counts: slats, tiers, sides). */
export function whole(v: number): number {
  return Math.round(v);
}

/**
 * The plain revolved body a family's stand-in builds while its own parts are
 * not there yet: its bottom and top Ø and height (`shadeStyleForFamily`),
 * straight and smooth.
 */
export function standInRevolvedStyle(style: ShadeStyle): RevolvedStyle {
  const revolved = shadeStyleForFamily(style, 'revolved');
  return { ...revolved, curve: 0, surface: { ...revolved.surface, style: 'smooth' } };
}

/** The info a family gives while its parts are not built yet. */
export function pendingFamilyInfo(ctx: Pick<ShadeCtx, 'role' | 'id' | 'style'>): Warning {
  const index = ctx.role === 'inner' ? 1 : 0;
  return {
    severity: 'info',
    code: 'family-pending',
    partId: ctx.id,
    paramPath: `shades.${index}.style.family`,
    message: `${SHADE_FAMILY_LABELS[ctx.style.family]} shades: this family's parts arrive in the next step; for now a plain revolved body with its diameters and height stands in.`,
  };
}
