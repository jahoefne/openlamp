/**
 * The revolved family (today's shade): a turned wall with its own shoulder
 * cone, ending in the collar. One part (kind `shade`, `variant: 'revolved'`),
 * printed open end down, collar up. Its parameters are the classic shade's
 * shape and surface (`SHADE_DEFS`); the outer shade's are normalised with the
 * classic shade's (the puck housing rule), so `normalize` finds nothing to
 * clamp there.
 */
import {
  deriveRevolvedShade,
  revolvedShadeFootprint,
  revolvedShadeRadii,
} from '../../geometry/parts/shades/revolved.ts';
import type { RevolvedShadeParams } from '../../model/parts.ts';
import type { RevolvedStyle } from '../../model/project.ts';
import { translation } from '../transforms.ts';
import { clampShadeStyle } from './common.ts';
import type { ShadeCtx, ShadeModule, ShadePart, ShadeParts, ShadeProfile } from './types.ts';

/** How a shade with a collar prints (every family's collar part adds the joint's note). */
export const SHADE_PRINT_NOTES: readonly string[] = [
  'Print as exported: open end on the bed, collar up. No supports needed.',
  'Two 0.4 mm perimeters (0.8 mm wall) diffuse the light best; no infill needed.',
];

/** The display name of a shade's collar part. */
export function shadeDisplayName(ctx: Pick<ShadeCtx, 'role'>): string {
  return ctx.role === 'inner' ? 'Inner shade' : 'Shade';
}

/** The revolved builder's params of a shade with this (revolved) style. */
export function revolvedShadeParamsOf(
  ctx: Omit<ShadeCtx, 'style'>,
  style: RevolvedStyle,
): RevolvedShadeParams {
  return {
    variant: 'revolved',
    bottomDiameter: style.bottomDiameter,
    topDiameter: style.topDiameter,
    height: style.height,
    curve: style.curve,
    wallThickness: ctx.wallThickness,
    shoulderAngle: style.shoulderAngle,
    surface: {
      style: style.surface.style,
      patternCount: style.surface.patternCount,
      ribDepth: style.surface.ribDepth,
      twist: style.surface.twist,
    },
    collar: ctx.collar,
    joint: ctx.joint,
    quality: ctx.quality,
  };
}

/** The one part of a revolved shade (also the stand-in of the families still to come). */
export function revolvedShadeParts(ctx: Omit<ShadeCtx, 'style'>, style: RevolvedStyle): ShadeParts {
  const params = revolvedShadeParamsOf(ctx, style);
  const { zCollar } = deriveRevolvedShade(params);
  const part: ShadePart = {
    draft: {
      id: ctx.id,
      kind: 'shade',
      displayName: shadeDisplayName(ctx),
      params,
      colour: ctx.colour,
      footprint: revolvedShadeFootprint(params),
      printNotes: [...SHADE_PRINT_NOTES],
    },
    transform: translation(0, 0, -zCollar),
  };
  return { parts: [part], interfaces: [], zCollar, zBottom: -zCollar };
}

/** A revolved shade's radii in the shade frame (`revolvedShadeRadii`, moved down by its collar's height). */
export function revolvedShadeProfile(params: RevolvedShadeParams): ShadeProfile {
  const radii = revolvedShadeRadii(params);
  const zc = radii.derived.zCollar;
  return {
    depth: zc,
    outerAt: (z) => radii.outerAt(z + zc),
    innerAt: (z) => radii.innerAt(z + zc),
  };
}

export const revolvedShade: ShadeModule<'revolved'> = {
  family: 'revolved',
  partKinds: ['shade'],

  normalize: (ctx) => clampShadeStyle(ctx),

  validate: () => [],

  collarTop: (ctx) => ctx.style.topDiameter,

  parts: (ctx) => revolvedShadeParts(ctx, ctx.style),

  profile: (ctx) => revolvedShadeProfile(revolvedShadeParamsOf(ctx, ctx.style)),
};
