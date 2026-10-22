/**
 * The geometric family: a polyhedral (twisted polygon), pleated (Yoshimura)
 * or lattice shade with a 45° roof up to the collar (see
 * `geometry/parts/shades/geometric.ts`). One part (kind `shade`,
 * `variant: 'geometric'`), printed open end down, collar up. Its params carry
 * only the chosen form's fields, so the others do not change its buildKey.
 *
 * Rules (`normalize`, adjusting): `sides`, `pleatCount` and `bands` rounded; a
 * polyhedral twist limited to ±90°; a lattice's pitch raised to the hole plus
 * two walls (the bridges between holes never thinner, the holes never
 * touching). The top: a polygon presents its inscribed Ø to the collar
 * (`collarTop`), so a polyhedral top widens to `min / cos(π / sides)`
 * (`widenTop`). Checks (`validate`): facets, pleats or a lattice's cone
 * leaning more than 50° (warnings); pleats closer than two nozzle widths at
 * the narrow end (warning: the pattern period); pleats hardly deeper than the
 * wall (info); a lattice thinned out to its hole cap, a lattice too short for
 * a row of holes, holes whose tops span more than 10 mm (infos). Every form has
 * a clearance profile.
 */
import {
  GEOMETRIC_MAX_LEAN,
  LATTICE_MARGIN,
  LATTICE_MAX_ROOF,
  MAX_LATTICE_HOLES,
  MAX_POLYHEDRAL_TWIST,
  deriveGeometricShade,
  geometricShadeFootprint,
  geometricShadeRadii,
  latticeGrid,
  minHolePitch,
} from '../../geometry/parts/shades/geometric.ts';
import type { Warning } from '../../model/assembly.ts';
import type { GeometricShadeParams } from '../../model/parts.ts';
import type { GeometricStyle } from '../../model/project.ts';
import type { GeometricVariant } from '../../schema/defs.ts';
import { translation } from '../transforms.ts';
import { clampShadeStyle, whole } from './common.ts';
import { SHADE_PRINT_NOTES, shadeDisplayName } from './revolved.ts';
import type { ShadeCtx, ShadeModule, ShadeProfile } from './types.ts';

const PRINT_NOTES: Readonly<Record<GeometricVariant, string>> = {
  polyhedral:
    'Print as exported: open end on the bed, collar up. The facets and the 45° roof print without supports.',
  pleated:
    'Print as exported: open end on the bed, collar up. The pleats and the 45° roof print without supports.',
  lattice:
    'Print as exported: open end on the bed, collar up. The holes print without supports (hexagons point up, round holes bridge their short tops).',
};

const mm = (n: number) => (Math.round(n * 10) / 10).toString();

/** The project path of a style field of the shade, e.g. `shades.0.style.pleatCount`. */
const stylePath = (ctx: Pick<ShadeCtx, 'role'>, field: string) =>
  `shades.${ctx.role === 'inner' ? 1 : 0}.style.${field}`;

/** The geometric builder's params of a shade with this (geometric) style: only its form's fields. */
export function geometricShadeParamsOf(
  ctx: Omit<ShadeCtx, 'style'>,
  style: GeometricStyle,
): GeometricShadeParams {
  const shape = {
    variant: 'geometric',
    pattern: style.variant,
    bottomDiameter: style.bottomDiameter,
    topDiameter: style.topDiameter,
    height: style.height,
    wallThickness: ctx.wallThickness,
  } as const;
  const tail = { collar: ctx.collar, joint: ctx.joint, quality: ctx.quality };
  switch (style.variant) {
    case 'polyhedral':
      return { ...shape, sides: style.sides, twist: style.twist, ...tail };
    case 'pleated':
      return {
        ...shape,
        pleatCount: style.pleatCount,
        pleatDepth: style.pleatDepth,
        bands: style.bands,
        ...tail,
      };
    case 'lattice':
      return {
        ...shape,
        holeShape: style.holeShape,
        holeSize: style.holeSize,
        holePitch: style.holePitch,
        ...tail,
      };
  }
}

/** A geometric shade's radii in the shade frame (`geometricShadeRadii`, moved down by its collar's height). */
export function geometricShadeProfile(params: GeometricShadeParams): ShadeProfile {
  const radii = geometricShadeRadii(params);
  const zc = radii.derived.zCollar;
  return {
    depth: zc,
    outerAt: (z) => radii.outerAt(z + zc),
    innerAt: (z) => radii.innerAt(z + zc),
  };
}

/** How much of its top Ø a geometric shade's top presents to the collar (a polygon: its inscribed Ø). */
function collarFraction(style: GeometricStyle): number {
  return style.variant === 'polyhedral' ? Math.cos(Math.PI / style.sides) : 1;
}

export const geometricShade: ShadeModule<'geometric'> = {
  family: 'geometric',
  partKinds: ['shade'],

  normalize(ctx) {
    const clamped = clampShadeStyle(ctx);
    const warnings = clamped.warnings;
    const s = clamped.style;
    const style: GeometricStyle = {
      ...s,
      sides: whole(s.sides),
      pleatCount: whole(s.pleatCount),
      bands: whole(s.bands),
    };
    const adjusted = (field: string, message: string) =>
      warnings.push({
        severity: 'warning',
        code: 'adjusted',
        partId: ctx.id,
        paramPath: stylePath(ctx, field),
        message,
      });

    if (style.variant === 'polyhedral' && Math.abs(style.twist) > MAX_POLYHEDRAL_TWIST) {
      const twist = Math.sign(style.twist) * MAX_POLYHEDRAL_TWIST;
      adjusted(
        'twist',
        `twist limited to ${twist}°: a polyhedral shade folds its facets at most ${MAX_POLYHEDRAL_TWIST}° either way`,
      );
      style.twist = twist;
    }
    if (style.variant === 'lattice') {
      const min = minHolePitch(style.holeSize, clamped.wallThickness);
      if (style.holePitch < min - 1e-9) {
        const pitch = Math.ceil(min * 2 - 1e-9) / 2; // the pitch's 0.5 mm steps
        adjusted(
          'holePitch',
          `holePitch raised to ${mm(pitch)} mm so two walls (${mm(min - style.holeSize)} mm) stay between neighbouring holes`,
        );
        style.holePitch = pitch;
      }
    }
    return { style, wallThickness: clamped.wallThickness, warnings };
  },

  validate(ctx) {
    const params = geometricShadeParamsOf(ctx, ctx.style);
    const d = deriveGeometricShade(params);
    const style = ctx.style;
    const warnings: Warning[] = [];
    const add = (severity: Warning['severity'], code: string, field: string, message: string) =>
      warnings.push({ severity, code, partId: ctx.id, paramPath: stylePath(ctx, field), message });
    const steep = d.wallLeanDeg > GEOMETRIC_MAX_LEAN;
    const lean = `${mm(d.wallLeanDeg)}° from vertical (more than ${GEOMETRIC_MAX_LEAN}°)`;

    switch (style.variant) {
      case 'polyhedral':
        if (steep) {
          add(
            'warning',
            'facet-overhang',
            'twist',
            `The facets lean ${lean} and may need support: less twist, a smaller step from the bottom to the top Ø or a taller shade.`,
          );
        }
        break;
      case 'pleated': {
        const nozzle = ctx.printer.nozzle;
        const r = Math.min(style.bottomDiameter, style.topDiameter) / 2;
        const period = (2 * Math.PI * r) / style.pleatCount;
        if (period < 2 * nozzle) {
          add(
            'warning',
            'pattern-period',
            'pleatCount',
            `The pleats repeat every ${mm(period)} mm at the narrow end, less than two ${mm(nozzle)} mm nozzle widths: fewer pleats print cleaner.`,
          );
        }
        if (style.pleatDepth < 2 * ctx.wallThickness) {
          add(
            'info',
            'pleat-depth',
            'pleatDepth',
            `${mm(style.pleatDepth)} mm pleats are hardly deeper than the ${mm(ctx.wallThickness)} mm wall; ${mm(2 * ctx.wallThickness)} mm or more fold visibly.`,
          );
        }
        if (steep) {
          add(
            'warning',
            'pleat-overhang',
            'pleatDepth',
            `The pleats lean ${lean} and may need support: shallower pleats or fewer bands.`,
          );
        }
        break;
      }
      case 'lattice': {
        const grid = latticeGrid(params);
        if (grid.capped) {
          add(
            'info',
            'lattice-cap',
            'holePitch',
            `${grid.requested} holes would be more than ${MAX_LATTICE_HOLES}: the pitch is widened to ${mm(grid.pitch)} mm (${grid.holes} holes).`,
          );
        }
        if (grid.holes === 0) {
          add(
            'info',
            'lattice-empty',
            'height',
            `No row of ${mm(style.holeSize)} mm holes fits ${LATTICE_MARGIN} mm clear of the bed and the roof: make the shade taller or the holes smaller.`,
          );
        }
        if (style.holeSize > LATTICE_MAX_ROOF) {
          add(
            'info',
            'bridge',
            'holeSize',
            `${mm(style.holeSize)} mm holes span their tops over more than ${LATTICE_MAX_ROOF} mm and may sag; smaller holes print cleaner.`,
          );
        }
        if (steep) {
          add(
            'warning',
            'wall-lean',
            'height',
            `The wall leans ${lean} and may need support: a smaller step from the bottom to the top Ø or a taller shade.`,
          );
        }
        break;
      }
    }
    return warnings;
  },

  collarTop: (ctx) => ctx.style.topDiameter * collarFraction(ctx.style),

  widenTop(ctx, minCollarTop) {
    const fraction = collarFraction(ctx.style);
    const top = fraction === 1 ? minCollarTop : Math.ceil((minCollarTop / fraction) * 10) / 10;
    return { ...ctx.style, topDiameter: top };
  },

  parts(ctx) {
    const params = geometricShadeParamsOf(ctx, ctx.style);
    const { zCollar } = deriveGeometricShade(params);
    return {
      parts: [
        {
          draft: {
            id: ctx.id,
            kind: 'shade',
            displayName: shadeDisplayName(ctx),
            params,
            colour: ctx.colour,
            footprint: geometricShadeFootprint(params),
            printNotes: [PRINT_NOTES[ctx.style.variant], SHADE_PRINT_NOTES[1]!],
          },
          transform: translation(0, 0, -zCollar),
        },
      ],
      interfaces: [],
      zCollar,
      zBottom: -zCollar,
    };
  },

  profile: (ctx) => geometricShadeProfile(geometricShadeParamsOf(ctx, ctx.style)),
};
