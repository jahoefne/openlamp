/**
 * LED strip lights: a strip stuck into a ring channel on the light face of a
 * wide, flat hub (a disc). The envelope, the channel the hub cuts, the rules
 * that keep the strip in its channel, the checks and the print notes.
 *
 *     boss ┌┴┐  mount face (cord boss, thread stub or bore)
 *    ╭─────┤ ├──────────────╮╭─╮  rim and the hub ring the shade hangs from
 *    │     └ ┘      ▒▒▒▒▒▒▒ ││ │  disc; the strip's cable runs over it into the boss
 *   ─┴──────────────┘     └─┴┴─┴─ light face: the channel opens downward at ringDiameter
 *                    strip
 */
import {
  STRIP_CHANNEL_EXTRA,
  STRIP_DISC_GAP,
  STRIP_MAX_BRIDGE,
} from '../../geometry/parts/lightInserts.ts';
import { cableBoreDiameter } from '../../geometry/parts/mountFaces.ts';
import type { Warning } from '../../model/assembly.ts';
import type { HubMountFace, LightEnvelope, StripInsert } from '../../model/parts.ts';
import type { LightOf } from '../../model/project.ts';
import type { MountKind } from '../../schema/defs.ts';
import { COLLAR_CORE_CLEARANCE } from '../interfaces.ts';

type StripLight = LightOf<'strip'>;

/** The channel must be at least this much deeper than the strip is thick, mm. */
const STRIP_DEPTH_EXTRA = 0.5;
/** The disc's rim outside the channel keeps at least this much wall, mm (and `STRIP_DISC_GAP` to the collar's bore). */
const MIN_RIM = 1.2;

const mm = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * The hub core around a strip ring: `ringDiameter / 2 + stripWidth + 2·wall`
 * (the hub is a wide disc), or more when a thick collar wall would otherwise
 * reach into the channel's rim. The cable leaves sideways over the rim under
 * a strap, else along the axis through the mount face.
 */
export function stripEnvelope(
  light: StripLight,
  hub: { wallThickness: number; collarWall: number },
  mount?: MountKind,
): LightEnvelope {
  const ring = light.ringDiameter / 2 + light.stripWidth;
  // The collar's bore is rCore + 1.5 − collarWall; the disc stops STRIP_DISC_GAP inside it.
  const rimNeed =
    ring + STRIP_CHANNEL_EXTRA + MIN_RIM + STRIP_DISC_GAP + hub.collarWall - COLLAR_CORE_CLEARANCE;
  return {
    rCore: Math.max(ring + 2 * hub.wallThickness, rimNeed),
    insertDepth: light.channelDepth,
    cableDiameter: light.cableWidth,
    cablePath: mount === 'ceilingStrap' ? 'side' : 'axial',
  };
}

/** The ring channel the hub cuts. */
export function stripInsert(light: StripLight, hub: { wallThickness: number }): StripInsert {
  return {
    kind: 'strip',
    ringDiameter: light.ringDiameter,
    stripWidth: light.stripWidth,
    height: light.stripThickness,
    channelWidth: light.stripWidth + STRIP_CHANNEL_EXTRA,
    channelDepth: light.channelDepth,
    cableWidth: light.cableWidth,
    wall: hub.wallThickness,
  };
}

/** Cross-parameter rules that adjust: the channel is deeper than the strip is thick. */
export function normalizeStrip(light: StripLight): { light: StripLight; warnings: Warning[] } {
  const min = Math.round((light.stripThickness + STRIP_DEPTH_EXTRA) * 10) / 10;
  if (light.channelDepth >= min) return { light, warnings: [] };
  return {
    light: { ...light, channelDepth: min },
    warnings: [
      {
        severity: 'warning',
        code: 'adjusted',
        paramPath: 'light.channelDepth',
        message: `Channel depth raised to ${mm(min)} mm so the ${mm(light.stripThickness)} mm strip sits inside it`,
      },
    ],
  };
}

/** Non-adjusting checks of a strip hub: the channel's bridge, the cable through the mount face. */
export function validateStrip(light: StripLight, face: HubMountFace): Warning[] {
  const warnings: Warning[] = [];
  const width = light.stripWidth + STRIP_CHANNEL_EXTRA;
  if (width > STRIP_MAX_BRIDGE + 1e-9) {
    warnings.push({
      severity: 'info',
      code: 'strip-bridge',
      partId: 'hub',
      paramPath: 'light.stripWidth',
      message: `The ${mm(width)} mm wide channel's ceiling prints as a bridge longer than ${STRIP_MAX_BRIDGE} mm; slow the bridges down or use a narrower strip.`,
    });
  }
  if (face.kind !== 'strap') {
    const bore = cableBoreDiameter(face);
    if (light.cableWidth > bore + 1e-9) {
      warnings.push({
        severity: 'warning',
        code: 'light-cable',
        partId: 'hub',
        paramPath: face.kind === 'cordBoss' ? 'mount.cordDiameter' : 'light.cableWidth',
        message:
          face.kind === 'cordBoss'
            ? `The strip's ${mm(light.cableWidth)} mm cable does not fit the cord boss's Ø${mm(bore)} mm hole; on a pendant the cord is the light's cable, so give the cord the cable's size.`
            : `The strip's ${mm(light.cableWidth)} mm cable does not fit the Ø${mm(bore)} mm bore through the hub's mount face.`,
      });
    }
  }
  return warnings;
}

/** The hub's print notes for a strip: the channel, the cable's way to the mount. */
export function stripPrintNotes(light: StripLight, face: HubMountFace): string[] {
  const width = mm(light.stripWidth + STRIP_CHANNEL_EXTRA);
  const notes = [
    `The ring channel's ceiling prints as a ${width} mm bridge, the slot for the shade's collar as a short one.`,
    "Stick the LED strip into the ring channel on the light face, its adhesive side on the channel's ceiling (a bendable S-type strip lies flat in the ring); feed its cable up through the slot in the channel.",
  ];
  switch (face.kind) {
    case 'strap':
      notes.push('Run the cable over the disc and out over the rim, under the strap.');
      break;
    case 'cordBoss':
      notes.push(
        "The cord is the strip's power cable: feed it down through the boss, tie a knot that sits in the knot cavity (reach in through the opening in the middle of the light face), and lead it out through the side opening of the boss over the disc to the strip.",
      );
      break;
    case 'threadMale':
    case 'threadFemale':
      notes.push(
        'Lead the cable over the disc into the boss through its side opening and up through the bore in the mount face.',
      );
      break;
  }
  return notes;
}
