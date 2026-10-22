/**
 * The slatted (louvred) family: a bottom ring, flat slats and a top ring with
 * a 45° shoulder up to the collar (see `geometry/parts/shades/slatted.ts`).
 * One part (kind `shade`, `variant: 'slatted'`), printed on its bottom ring,
 * collar up.
 *
 * Rules (`normalize`, adjusting): the rings leave at least 10 mm of slat
 * between them; fewer slats when they would come closer than 1 mm at the
 * narrowest ring (`slatCount` reduced, a warning). Checks (`validate`): a slat
 * leaning more than 50° from vertical (warning), slats thinner than two
 * nozzle widths (info), the top ring bridging more than 11 mm between two
 * slats (info). No clearance profile (an inner or outer slatted shade gets an
 * info instead of the clearance check).
 */
import {
  MAX_SLAT_LEAN,
  MIN_SLAT_GAP,
  SLAT_MAX_BRIDGE,
  deriveSlattedShade,
  slattedShadeFootprint,
} from '../../geometry/parts/shades/slatted.ts';
import type { Warning } from '../../model/assembly.ts';
import type { SlattedShadeParams } from '../../model/parts.ts';
import type { SlattedStyle } from '../../model/project.ts';
import { translation } from '../transforms.ts';
import { clampShadeStyle, whole } from './common.ts';
import { shadeDisplayName } from './revolved.ts';
import type { ShadeCtx, ShadeModule } from './types.ts';

/** The least free slat between the two rings, mm. */
export const MIN_SLAT_SPAN = 10;

const SLATTED_PRINT_NOTES: readonly string[] = [
  'Print as exported: bottom ring on the bed, collar up. The top ring bridges the short gaps between the slats; no supports needed.',
  'Two or more perimeters through the slats; no infill needed.',
];

const mm = (n: number) => (Math.round(n * 10) / 10).toString();

/** The slatted builder's params of a shade with this (slatted) style. */
export function slattedShadeParamsOf(
  ctx: Omit<ShadeCtx, 'style'>,
  style: SlattedStyle,
): SlattedShadeParams {
  return {
    variant: 'slatted',
    bottomDiameter: style.bottomDiameter,
    topDiameter: style.topDiameter,
    height: style.height,
    ringHeight: style.ringHeight,
    wallThickness: ctx.wallThickness,
    slatCount: style.slatCount,
    slatWidth: style.slatWidth,
    slatThickness: style.slatThickness,
    louvreAngle: style.louvreAngle,
    twist: style.twist,
    collar: ctx.collar,
    joint: ctx.joint,
    quality: ctx.quality,
  };
}

/** The project path of a style field of the shade, e.g. `shades.0.style.slatCount`. */
const stylePath = (ctx: Pick<ShadeCtx, 'role'>, field: string) =>
  `shades.${ctx.role === 'inner' ? 1 : 0}.style.${field}`;

export const slattedShade: ShadeModule<'slatted'> = {
  family: 'slatted',
  partKinds: ['shade'],

  normalize(ctx) {
    const clamped = clampShadeStyle(ctx);
    const warnings = clamped.warnings;
    const style: SlattedStyle = { ...clamped.style, slatCount: whole(clamped.style.slatCount) };
    const adjusted = (field: string, message: string) =>
      warnings.push({
        severity: 'warning',
        code: 'adjusted',
        partId: ctx.id,
        paramPath: stylePath(ctx, field),
        message,
      });

    const maxRing = Math.floor(style.height - MIN_SLAT_SPAN) / 2;
    if (style.ringHeight > maxRing) {
      adjusted(
        'ringHeight',
        `ringHeight reduced to ${mm(maxRing)} mm so the slats keep ${MIN_SLAT_SPAN} mm between the rings`,
      );
      style.ringHeight = maxRing;
    }

    // The gaps, with the top as wide as the collar's ring will make it.
    const top = Math.max(style.topDiameter, ctx.minTopDiameter);
    const probe = slattedShadeParamsOf(
      { ...ctx, wallThickness: clamped.wallThickness },
      { ...style, topDiameter: top },
    );
    const d = deriveSlattedShade(probe);
    if (style.slatCount > d.maxSlats) {
      const n = Math.max(1, d.maxSlats);
      adjusted(
        'slatCount',
        `slatCount reduced to ${n} so the slats keep ${MIN_SLAT_GAP} mm apart at the narrowest ring (${style.slatCount} would touch)`,
      );
      if (d.maxSlats < 3) {
        warnings.push({
          severity: 'error',
          code: 'slat-gap',
          partId: ctx.id,
          paramPath: stylePath(ctx, 'slatWidth'),
          message: 'The slats are too wide for the rings: make them narrower or the rings wider.',
        });
      }
      style.slatCount = n;
    }
    return { style, wallThickness: clamped.wallThickness, warnings };
  },

  validate(ctx) {
    const d = deriveSlattedShade(slattedShadeParamsOf(ctx, ctx.style));
    const warnings: Warning[] = [];
    if (d.leanDeg > MAX_SLAT_LEAN) {
      warnings.push({
        severity: 'warning',
        code: 'slat-lean',
        partId: ctx.id,
        paramPath: stylePath(ctx, 'twist'),
        message: `The slats lean ${mm(d.leanDeg)}° from vertical (more than ${MAX_SLAT_LEAN}°) and may need support: reduce the twist or make the shade taller.`,
      });
    }
    const nozzle = ctx.printer.nozzle;
    if (ctx.style.slatThickness < 2 * nozzle) {
      warnings.push({
        severity: 'info',
        code: 'slat-thickness',
        partId: ctx.id,
        paramPath: stylePath(ctx, 'slatThickness'),
        message: `${mm(ctx.style.slatThickness)} mm slats get fewer than two perimeters with the ${mm(nozzle)} mm nozzle; ${mm(2 * nozzle)} mm or more prints stronger.`,
      });
    }
    if (d.bridge > SLAT_MAX_BRIDGE) {
      warnings.push({
        severity: 'info',
        code: 'bridge',
        partId: ctx.id,
        paramPath: stylePath(ctx, 'slatCount'),
        message: `The top ring bridges ${mm(d.bridge)} mm between two slats; more than ${SLAT_MAX_BRIDGE} mm may sag (more or wider slats shorten it).`,
      });
    }
    return warnings;
  },

  collarTop: (ctx) => ctx.style.topDiameter,

  parts(ctx) {
    const params = slattedShadeParamsOf(ctx, ctx.style);
    const { zCollar } = deriveSlattedShade(params);
    return {
      parts: [
        {
          draft: {
            id: ctx.id,
            kind: 'shade',
            displayName: shadeDisplayName(ctx),
            params,
            colour: ctx.colour,
            footprint: slattedShadeFootprint(params),
            printNotes: [...SLATTED_PRINT_NOTES],
          },
          transform: translation(0, 0, -zCollar),
        },
      ],
      interfaces: [],
      zCollar,
      zBottom: -zCollar,
    };
  },
};
