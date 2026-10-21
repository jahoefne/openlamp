/**
 * Bulb lights (E27 / E14 LED bulbs in a mains lampholder): the envelope the
 * hub is built around, the lampholder plate it carries, the rules that keep
 * the plate printable, the heat-zone checks and the print notes.
 *
 *          │ chamber │        the cable (and the M10 nut in its recess) under the mount face
 *      ════╧═╤═══╤═══╧════    plate: the lampholder's hole (sleeve Ø40.5 / Ø28.5, or nipple Ø10.5)
 *      ║   ╲ │   │ ╱   ║      skirt: Ø skirtDiameter, its inside rises at 45° to the hole
 *   ───╨────┴─────┴────╨───   light face (z 0): the skirt's rim, the lampholder's mouth
 *            ╭─────╮
 *           │ bulb  │         hangs below: bulbLength (cap included), Ø bulbDiameter
 *            ╰─────╯
 *
 * The hub core is the skirt plus an air annulus (`BULB_AIR_ANNULUS`) between
 * it and the shade collar's bore: the warm air rises through it and leaves
 * through the vents in the hub's shoulder.
 */
import { M10_NIPPLE_BORE, M10_NUT_RECESS } from '../../geometry/parts/lightInserts.ts';
import { cableBoreDiameter } from '../../geometry/parts/mountFaces.ts';
import type { HubDerived } from '../../geometry/parts/hub.ts';
import type { Warning } from '../../model/assembly.ts';
import type { BulbInsert, HeatZone, HubMountFace, LightEnvelope } from '../../model/parts.ts';
import type { LightOf } from '../../model/project.ts';

type BulbLight = LightOf<'bulb'>;

/**
 * Radial room between the skirt and the hub core's edge, mm: the shade
 * collar's bore stays `BULB_AIR_ANNULUS + 1.5 − collarWall` outside the skirt
 * (the air path), and the Ø6 vents fit between the skirt and the hub ring.
 */
export const BULB_AIR_ANNULUS = 6;
/** Below this heat clearance the form says so (info), mm. */
export const MIN_HEAT_CLEARANCE = 10;
/** Diameter of the bulb's cap (for the ghost's neck), by size, mm. */
export const BULB_CAP_DIAMETER = Object.freeze({ E27: 27, E14: 14 });
/** Room for a shade ring inside the skirt: the skirt's inside is this much wider than the hole, per side, mm. */
const SHADE_RING_ROOM = 1;
/** The M10 nut's hexagon may not slip through the hole: at most this Ø. */
const NIPPLE_HOLE_MAX = 13;

const mm = (n: number) => (Math.round(n * 10) / 10).toString();

/** The heat zone in the hub's frame: the bulb's glass (its far Ø) plus the clearance. */
export function bulbHeatZone(light: BulbLight): HeatZone {
  const hc = light.heatClearance;
  return {
    z0: -light.bulbLength - hc,
    z1: -light.bulbLength + light.bulbDiameter + hc,
    rMin: light.bulbDiameter / 2 + hc,
  };
}

/**
 * The hub core around a bulb: the skirt plus the air annulus. The insert
 * reaches from the light face up through the skirt and the plate (and the
 * nut recess); the cable runs along the axis through the mount face.
 */
export function bulbEnvelope(light: BulbLight): LightEnvelope {
  return {
    rCore: light.skirtDiameter / 2 + BULB_AIR_ANNULUS,
    insertDepth:
      light.skirtHeight +
      light.plateThickness +
      (light.fitting === 'm10Nipple' ? M10_NUT_RECESS.depth : 0),
    cableDiameter: light.cableDiameter,
    cablePath: 'axial',
    heatZone: bulbHeatZone(light),
  };
}

/** The lampholder plate the hub carries. */
export function bulbInsert(
  light: BulbLight,
  hub: { wallThickness: number; ventCount: number },
): BulbInsert {
  return {
    kind: 'bulb',
    size: light.size,
    fitting: light.fitting,
    holeDiameter: light.holeDiameter,
    plateThickness: light.plateThickness,
    skirtDiameter: light.skirtDiameter,
    skirtHeight: light.skirtHeight,
    wall: hub.wallThickness,
    cableDiameter: light.cableDiameter,
    vents: hub.ventCount,
    bulbDiameter: light.bulbDiameter,
    height: light.bulbLength,
  };
}

/**
 * Cross-parameter rules that adjust: an M10 nipple's hole stays narrower
 * than the nut; the skirt leaves room inside for the shade ring (or, on a
 * nipple, for the nut's recess and its wall) and a wall of its own.
 */
export function normalizeBulb(
  light: BulbLight,
  hub: { wallThickness: number },
): { light: BulbLight; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const out = { ...light };
  const w = hub.wallThickness;
  if (out.fitting === 'm10Nipple' && out.holeDiameter > NIPPLE_HOLE_MAX) {
    out.holeDiameter = NIPPLE_HOLE_MAX;
    warnings.push({
      severity: 'warning',
      code: 'adjusted',
      paramPath: 'light.holeDiameter',
      message: `Plate hole reduced to Ø${NIPPLE_HOLE_MAX} mm so the M10 nut cannot slip through it`,
    });
  }
  const inside =
    out.fitting === 'm10Nipple'
      ? Math.max(
          out.holeDiameter + 2 * SHADE_RING_ROOM,
          M10_NUT_RECESS.diameter + 2 * (M10_NUT_RECESS.wall + 0.5),
        )
      : out.holeDiameter + 2 * SHADE_RING_ROOM;
  // The skirt's inside plus its wall, rounded up to half a millimetre.
  const min = Math.ceil((inside + 2 * w) * 2 - 1e-9) / 2;
  if (out.skirtDiameter < min) {
    out.skirtDiameter = min;
    warnings.push({
      severity: 'warning',
      code: 'adjusted',
      paramPath: 'light.skirtDiameter',
      message:
        out.fitting === 'm10Nipple'
          ? `Skirt Ø raised to ${mm(min)} mm so the chamber above the plate holds the M10 nut's recess`
          : `Skirt Ø raised to ${mm(min)} mm so the shade ring fits inside it around the Ø${mm(out.holeDiameter)} mm hole`,
    });
  }
  return { light: out, warnings };
}

/** Whether a cable of this Ø passes the hub's mount face (the cord hole, or the bore of a threaded face). */
function cableWarning(face: HubMountFace, cable: number, what: string): Warning | undefined {
  if (face.kind === 'strap') return undefined;
  const bore = cableBoreDiameter(face);
  if (cable <= bore + 1e-9) return undefined;
  return {
    severity: 'warning',
    code: 'light-cable',
    partId: 'hub',
    paramPath: face.kind === 'cordBoss' ? 'mount.cordDiameter' : 'light.cableDiameter',
    message:
      face.kind === 'cordBoss'
        ? `${what}'s Ø${mm(cable)} mm cable does not fit the cord boss's Ø${mm(bore)} mm hole; on a pendant the cord is the light's cable, so give the cord the cable's Ø.`
        : `${what}'s Ø${mm(cable)} mm cable does not fit the Ø${mm(bore)} mm bore through the hub's mount face; use a thinner cable or a wider one for the mount.`,
  };
}

/** Non-adjusting checks of a bulb hub: LED / PETG, the heat clearance and zone, the cable. */
export function validateBulb(
  light: BulbLight,
  face: HubMountFace,
  envelope: LightEnvelope,
): Warning[] {
  const name = `${light.size} bulb`;
  const warnings: Warning[] = [
    {
      severity: 'info',
      code: 'bulb-led',
      partId: 'hub',
      paramPath: 'light.kind',
      message: `${name}: LED bulbs only (no incandescent or halogen bulbs); print the hub in PETG (PLA softens near 60 °C), and have the mains wiring done by a qualified person.`,
    },
  ];
  if (light.heatClearance < MIN_HEAT_CLEARANCE) {
    warnings.push({
      severity: 'info',
      code: 'heat-clearance',
      partId: 'hub',
      paramPath: 'light.heatClearance',
      message: `A heat clearance under ${MIN_HEAT_CLEARANCE} mm leaves printed parts close to the bulb; ${MIN_HEAT_CLEARANCE}–15 mm or more is safer, even for LED bulbs.`,
    });
  }
  // The hub stands on its light face (z 0) and up: the heat zone must stay below it.
  const zone = envelope.heatZone;
  if (zone && zone.z1 > 0) {
    warnings.push({
      severity: 'warning',
      code: 'heat-zone',
      partId: 'hub',
      paramPath: 'light.bulbLength',
      message: `The bulb's glass comes within ${mm(light.heatClearance)} mm of the hub (its heat zone reaches ${mm(zone.z1)} mm into it); use a longer bulb or a smaller heat clearance.`,
    });
  }
  const cable = cableWarning(face, light.cableDiameter, `The ${name}`);
  if (cable) warnings.push(cable);
  if (light.fitting === 'm10Nipple' && light.cableDiameter > M10_NIPPLE_BORE) {
    warnings.push({
      severity: 'warning',
      code: 'light-cable',
      partId: 'hub',
      paramPath: 'light.cableDiameter',
      message: `A Ø${mm(light.cableDiameter)} mm cable does not pass through an M10 nipple (its bore is about Ø${M10_NIPPLE_BORE} mm); use a thinner cable or the shade-ring fitting.`,
    });
  }
  return warnings;
}

/** The hub's print notes for a bulb: the nut, the lampholder, the cable, LED only. */
export function bulbPrintNotes(light: BulbLight, face: HubMountFace, d: HubDerived): string[] {
  const notes: string[] = [];
  const hole = mm(light.holeDiameter);
  if (light.fitting === 'm10Nipple') {
    const nut = `an M10 nut (16 mm across flats) into the hexagonal recess on the plate`;
    notes.push(
      face.kind === 'strap'
        ? `Drop ${nut} from the top, then screw the lampholder's M10 × 1 nipple up through the Ø${hole} mm hole into it.`
        : `Pause the print at z ≈ ${mm(d.zFloor + M10_NUT_RECESS.depth)} mm (the top of the nut recess) and drop ${nut}; the hub closes over it. Then screw the lampholder's M10 × 1 nipple up through the Ø${hole} mm hole into the nut.`,
    );
  } else {
    notes.push(
      `The lampholder's threaded sleeve goes through the Ø${hole} mm hole in the plate; screw its shade ring on from the light face, inside the skirt, so the plate is clamped.`,
    );
  }
  switch (face.kind) {
    case 'cordBoss':
      notes.push(
        light.fitting === 'm10Nipple'
          ? "Feed the cord down through the boss and the nipple into the lampholder and fix it in the lampholder's cord grip."
          : "Feed the cord down through the boss, tie a knot that sits in the knot cavity (reach in through the plate's hole), then wire the lampholder.",
      );
      break;
    case 'threadMale':
    case 'threadFemale':
      notes.push('The cable runs from the lampholder up through the bore in the mount face.');
      break;
    case 'strap':
      break;
  }
  notes.push(
    'LED bulbs only. Print the hub in PETG (PLA softens near 60 °C); mains wiring is your responsibility: have it done by a qualified person.',
  );
  return notes;
}
