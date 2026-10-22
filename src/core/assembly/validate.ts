/**
 * Project checks that warn without adjusting anything. Pure, no WASM.
 */
import { STRIP_MAX_BRIDGE } from '../geometry/parts/lightInserts.ts';
import type { GeometryStats, Layout, PartSpec, Warning } from '../model/assembly.ts';
import type { HubParams } from '../model/parts.ts';
import { SHADE_FAMILY_LABELS, type ShadeFamily } from '../schema/defs.ts';
import { printerLabel, type PrinterSpec } from '../schema/printers.ts';
import type { ShadeProfile } from './shades/types.ts';

const mm = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * One `bed-fit` warning per part whose footprint exceeds the bed on some axis.
 * A part may be turned 90° about z to fit; the axes reported are those of the
 * better orientation.
 */
export function validateBedFit(parts: readonly PartSpec[], printer: PrinterSpec): Warning[] {
  const [bx, by, bz] = printer.bed;
  const warnings: Warning[] = [];
  for (const part of parts) {
    const f = part.bedFootprint;
    if (!f) continue;
    const turned = !(f.x <= bx && f.y <= by) && f.y <= bx && f.x <= by;
    const [x, y] = turned ? [f.y, f.x] : [f.x, f.y];
    const axes = [x > bx && 'X', y > by && 'Y', f.z > bz && 'Z'].filter(
      (a): a is string => typeof a === 'string',
    );
    if (axes.length === 0) continue;
    warnings.push({
      severity: 'warning',
      code: 'bed-fit',
      partId: part.id,
      message:
        `${part.displayName} (${mm(f.x)} × ${mm(f.y)} × ${mm(f.z)} mm) does not fit the ` +
        `${printerLabel(printer)} build volume (${bx} × ${by} × ${bz} mm): too large in ` +
        `${axes.join(' and ')}.`,
    });
  }
  return warnings;
}

/** An `info` for each part that fits the bed alone but not next to the others. */
export function validateLayout(layout: Layout, alreadyWarned: ReadonlySet<string>): Warning[] {
  return layout.overflow
    .filter((id) => !alreadyWarned.has(id))
    .map((id): Warning => ({
      severity: 'info',
      code: 'plate-overflow',
      partId: id,
      message: `${id} does not fit on the same plate as the other parts; print it separately.`,
    }));
}

/** The least radial clearance between an inner and an outer shade, mm. */
export const MIN_SHADE_CLEARANCE = 2;
/** Height step of the shade checks' sampling, mm. */
const SHADE_SAMPLE_STEP = 0.5;

/** Heights from `z0` up to (not including) `z1`, every `SHADE_SAMPLE_STEP`, and just under `z1`. */
function samples(z0: number, z1: number): number[] {
  const out: number[] = [];
  for (let z = z0; z < z1 - 0.01; z += SHADE_SAMPLE_STEP) out.push(z);
  if (z1 - z0 > 0.01) out.push(z1 - 0.01);
  return out;
}

/** What the shade checks need of a shade: its family, how far it hangs, its radii if its family has them. */
export interface ShadeCheck {
  family: ShadeFamily;
  /** How far it reaches below the collar plane, mm. */
  depth: number;
  profile: ShadeProfile | undefined;
}

/**
 * Checks of an inner shade against the outer one and the light, in the hub's
 * frame (both collar planes at z 0, the shades below it; a standing lamp turns
 * all of it over together), without meshes, from the shades' profiles
 * (`ShadeModule.profile`):
 *
 * - `shade-clearance` (warning): at some height the inner shade's outside
 *   (its pattern's crests included) comes closer than 2 mm to the outer
 *   shade's inside (its troughs included); `shade-clearance-unchecked` (info)
 *   instead when either shade's family has no profile;
 * - `heat-zone` (warning): the inner shade's inside reaches into the bulb's
 *   heat zone (when the inner shade has a profile);
 * - `inner-shade-longer` (info): the inner shade hangs out below the outer one;
 * - `bridge` (info): a strip hub's flange spans the radial gap between the
 *   two rings as a bridge longer than 11 mm.
 */
export function validateInnerShade(
  outer: ShadeCheck,
  inner: ShadeCheck,
  hub: Pick<HubParams, 'envelope' | 'insert' | 'collar' | 'innerCollar'>,
  ids: { outer: string; inner: string; hub: string },
): Warning[] {
  const warnings: Warning[] = [];
  const o = outer.profile;
  const i = inner.profile;
  const zo = outer.depth;
  const zi = inner.depth;

  // Clearance where both shades are (hub frame z < 0).
  if (o && i) {
    let worst: { gap: number; z: number } | undefined;
    for (const z of samples(-Math.min(zo, zi), 0)) {
      const gap = o.innerAt(z) - i.outerAt(z);
      if (!worst || gap < worst.gap) worst = { gap, z };
    }
    if (worst && worst.gap < MIN_SHADE_CLEARANCE) {
      warnings.push({
        severity: 'warning',
        code: 'shade-clearance',
        partId: ids.inner,
        paramPath: 'shades.1.style.bottomDiameter',
        message:
          worst.gap < 0
            ? `The inner shade cuts ${mm(-worst.gap)} mm into the outer shade ${mm(-worst.z)} mm below the hub; make it narrower or shorter.`
            : `The inner shade comes within ${mm(worst.gap)} mm of the outer shade ${mm(-worst.z)} mm below the hub (keep at least ${MIN_SHADE_CLEARANCE} mm); make it narrower or shorter.`,
      });
    }
  } else {
    const unchecked = [...new Set([o ? undefined : outer.family, i ? undefined : inner.family])]
      .filter((f): f is ShadeFamily => f !== undefined)
      .map((f) => SHADE_FAMILY_LABELS[f].toLowerCase());
    warnings.push({
      severity: 'info',
      code: 'shade-clearance-unchecked',
      partId: ids.inner,
      paramPath: 'shades.1.style.bottomDiameter',
      message: `The clearance between the inner and the outer shade is not checked for ${unchecked.join(' and ')} shades; keep ${MIN_SHADE_CLEARANCE} mm between them (the section view shows it).`,
    });
  }

  // A bulb's heat zone (hub frame), where the inner shade is.
  const zone = hub.envelope.heatZone;
  if (zone && i) {
    let closest: { r: number; z: number } | undefined;
    for (const z of samples(Math.max(zone.z0, -zi), Math.min(zone.z1, 0))) {
      const r = i.innerAt(z);
      if (!closest || r < closest.r) closest = { r, z };
    }
    if (closest && closest.r < zone.rMin) {
      warnings.push({
        severity: 'warning',
        code: 'heat-zone',
        partId: ids.inner,
        paramPath: 'shades.1.style.bottomDiameter',
        message: `The inner shade comes within ${mm(closest.r)} mm of the bulb's axis ${mm(-closest.z)} mm below the hub, inside its heat zone (Ø${mm(2 * zone.rMin)} mm); make it wider or shorter.`,
      });
    }
  }

  if (zi > zo + 0.05) {
    warnings.push({
      severity: 'info',
      code: 'inner-shade-longer',
      partId: ids.inner,
      paramPath: inner.family === 'tiered' ? 'shades.1.style.tiers' : 'shades.1.style.height',
      message: `The inner shade hangs ${mm(zi - zo)} mm below the outer shade.`,
    });
  }

  // A strip hub's flat flange bridges the gap between its two rings.
  if (hub.insert.kind === 'strip' && hub.innerCollar) {
    const bridge = hub.collar.ringInnerRadius - hub.innerCollar.seatRadius;
    if (bridge > STRIP_MAX_BRIDGE) {
      warnings.push({
        severity: 'info',
        code: 'bridge',
        partId: ids.hub,
        paramPath: 'hub.radialGap',
        message: `The strip hub's flange bridges ${mm(bridge)} mm between its two collar rings; more than ${STRIP_MAX_BRIDGE} mm may sag (bridging or supports there).`,
      });
    }
  }
  return warnings;
}

/**
 * Post-build checks of a part's geometry stats: an `error` if manifold did not
 * produce a valid solid. (The overhang check of the full plan joins here once
 * the status panel replaces today's overhang row.)
 */
export function validateGeometry(
  part: Pick<PartSpec, 'id' | 'displayName'>,
  stats: Pick<GeometryStats, 'status'>,
): Warning[] {
  if (stats.status === 'NoError') return [];
  return [
    {
      severity: 'error',
      code: 'geometry-status',
      partId: part.id,
      message: `${part.displayName} is not a valid solid (manifold status ${stats.status}).`,
    },
  ];
}
