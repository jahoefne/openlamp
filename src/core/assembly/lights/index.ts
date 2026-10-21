/**
 * Light sources by kind: each contributes the envelope the hub is built around
 * (`lightEnvelope`), the insert the hub cuts for it (`lightInsert`), its
 * cross-parameter rules (`normalizeLight`), its checks (`validateLight`), the
 * hub's print notes about it (`lightPrintNotes`) and the world-frame numbers
 * the viewport's ghosts draw it from (`lightDerived`).
 *
 * - `puck`: a USB LED puck in a pocket (puck.ts);
 * - `bulb`: an E27 / E14 LED bulb in a lampholder plate (bulb.ts);
 * - `strip`: an LED strip in a ring channel of a wide, flat hub (strip.ts).
 */
import type { HubDerived } from '../../geometry/parts/hub.ts';
import type { Mat4, Warning } from '../../model/assembly.ts';
import type { HubMountFace, LightEnvelope, LightInsert } from '../../model/parts.ts';
import type { LightSource } from '../../model/project.ts';
import { DEFAULT_VENTS, HUB_JOINT_DEFAULTS, type MountKind } from '../../schema/defs.ts';
import { lightFromParams, lightToParams } from '../../model/project.ts';
import { normalizeLightParams } from '../../schema/normalize.ts';
import { applyToPoint } from '../transforms.ts';
import {
  BULB_CAP_DIAMETER,
  bulbEnvelope,
  bulbInsert,
  bulbPrintNotes,
  normalizeBulb,
  validateBulb,
} from './bulb.ts';
import { puckEnvelope, puckInsert } from './puck.ts';
import {
  normalizeStrip,
  stripEnvelope,
  stripInsert,
  stripPrintNotes,
  validateStrip,
} from './strip.ts';

export * from './bulb.ts';
export * from './puck.ts';
export * from './strip.ts';

/** What of the hub a light's envelope and insert depend on. */
export interface LightHubOptions {
  /** The hub's wall (a bulb's skirt, a strip disc's walls). */
  wallThickness: number;
  /** The shade collar's wall (a strip disc keeps clear of it). */
  collarWall: number;
  /** Vents through the hub's shoulder (bulbs only). */
  ventCount: number;
  /** The mount (a strip's cable leaves sideways under a strap). */
  mount?: MountKind;
}

const DEFAULT_HUB: LightHubOptions = {
  wallThickness: HUB_JOINT_DEFAULTS.hubWallThickness,
  collarWall: HUB_JOINT_DEFAULTS.collarWall,
  ventCount: DEFAULT_VENTS.bulb,
};

export function lightEnvelope(
  light: LightSource,
  hub: Partial<LightHubOptions> = {},
): LightEnvelope {
  const h = { ...DEFAULT_HUB, ...hub };
  switch (light.kind) {
    case 'puck':
      return puckEnvelope(light);
    case 'bulb':
      return bulbEnvelope(light);
    case 'strip':
      return stripEnvelope(light, h, h.mount);
  }
}

export function lightInsert(light: LightSource, hub: Partial<LightHubOptions> = {}): LightInsert {
  const h = { ...DEFAULT_HUB, ...hub };
  switch (light.kind) {
    case 'puck':
      return puckInsert(light);
    case 'bulb':
      return bulbInsert(light, h);
    case 'strip':
      return stripInsert(light, h);
  }
}

/**
 * A bulb or a strip clamped to its parameter definitions (warnings at
 * `light.…`) and its cross-parameter rules. The puck is normalised with the
 * classic shade, so it comes back unchanged.
 */
export function normalizeLight(
  light: LightSource,
  hub: Pick<LightHubOptions, 'wallThickness'>,
): { light: LightSource; warnings: Warning[] } {
  switch (light.kind) {
    case 'puck':
      return { light, warnings: [] };
    case 'bulb': {
      const clamped = normalizeLightParams('bulb', lightToParams(light));
      const rules = normalizeBulb(lightFromParams('bulb', clamped.values), hub);
      return { light: rules.light, warnings: [...clamped.warnings, ...rules.warnings] };
    }
    case 'strip': {
      const clamped = normalizeLightParams('strip', lightToParams(light));
      const rules = normalizeStrip(lightFromParams('strip', clamped.values));
      return { light: rules.light, warnings: [...clamped.warnings, ...rules.warnings] };
    }
  }
}

/** Non-adjusting checks of the light in its hub (the strap + non-puck error is the strap's). */
export function validateLight(
  light: LightSource,
  face: HubMountFace,
  envelope: LightEnvelope,
): Warning[] {
  switch (light.kind) {
    case 'puck':
      return [];
    case 'bulb':
      return validateBulb(light, face, envelope);
    case 'strip':
      return validateStrip(light, face);
  }
}

/** The hub's print notes about a bulb or a strip (the puck's are the hub's own, see assemble.ts). */
export function lightPrintNotes(light: LightSource, face: HubMountFace, d: HubDerived): string[] {
  switch (light.kind) {
    case 'puck':
      return [];
    case 'bulb':
      return bulbPrintNotes(light, face, d);
    case 'strip':
      return stripPrintNotes(light, face);
  }
}

/** World z of a point on the hub's axis at hub-frame height `z`. */
const worldZ = (hub: Mat4, z: number) => applyToPoint(hub, [0, 0, z])[2]!;

/**
 * The light's numbers in `Assembly.derived` (world frame), for the ghosts:
 * the puck in its pocket (`puckZ` / `puckDiameter` / `puckHeight`, its
 * underside), the bulb (`bulbZ` its centre, `bulbCapZ` the end in the
 * lampholder, `bulbDiameter`, `bulbLength`, `bulbCapDiameter`, and its heat
 * zone `heatZoneZ0` / `heatZoneZ1` / `heatZoneRadius`), or the strip ring
 * (`stripZ` its mid-plane, `stripRingDiameter` the channel's inner Ø,
 * `stripWidth`, `stripThickness`). `hubTransform` is the hub's placement.
 */
export function lightDerived(
  light: LightSource,
  d: HubDerived,
  hubTransform: Mat4,
  envelope: LightEnvelope,
): Record<string, number> {
  switch (light.kind) {
    case 'puck':
      return { puckZ: d.zPuck, puckDiameter: light.diameter, puckHeight: light.height };
    case 'bulb': {
      // The bulb hangs from the skirt's rim (the light face, z 0) by its length.
      const capZ = worldZ(hubTransform, 0);
      const tipZ = worldZ(hubTransform, -light.bulbLength);
      const out: Record<string, number> = {
        bulbZ: (capZ + tipZ) / 2,
        bulbCapZ: capZ,
        bulbDiameter: light.bulbDiameter,
        bulbLength: light.bulbLength,
        bulbCapDiameter: BULB_CAP_DIAMETER[light.size],
      };
      const zone = envelope.heatZone;
      if (zone) {
        const a = worldZ(hubTransform, zone.z0);
        const b = worldZ(hubTransform, zone.z1);
        out.heatZoneZ0 = Math.min(a, b);
        out.heatZoneZ1 = Math.max(a, b);
        out.heatZoneRadius = zone.rMin;
      }
      return out;
    }
    case 'strip':
      return {
        // The strip is stuck to the channel's ceiling.
        stripZ: worldZ(hubTransform, light.channelDepth - light.stripThickness / 2),
        stripRingDiameter: light.ringDiameter,
        stripWidth: light.stripWidth,
        stripThickness: light.stripThickness,
      };
  }
}

/** The lowest world z of the light (a bulb hanging below a shade), or undefined. */
export function lightBottomZ(light: LightSource, hubTransform: Mat4): number | undefined {
  if (light.kind !== 'bulb') return undefined;
  return Math.min(worldZ(hubTransform, 0), worldZ(hubTransform, -light.bulbLength));
}
