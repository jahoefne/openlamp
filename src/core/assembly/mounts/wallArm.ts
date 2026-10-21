/**
 * The wall lamp: a wall plate hung on two screws, an arm screwed to it
 * (4 × M3, heat-set inserts in the plate) and the hub hanging under the end
 * of the arm. The hub's mount face is a hollow male thread stub that screws
 * up into the arm's end boss.
 *
 *   ┃ wall (y = wallY)
 *   ┃▐▌                   the plate (its back face on the wall)
 *   ┃▐▌══════════╗        the arm: flange on the plate, tube leaving along +y
 *   ┃▐▌          ║        (straight, angled or curved up), end boss on the hub's axis
 *   ┃▐▌        ┌─┸─┐      the hub, screwed up into the boss: as every hanging lamp,
 *   ┃▐▌       ╱ hub ╲     its collar plane at z 0 on the world's z axis …
 *   ┃        ╱ shade ╲    … and the shade below it
 *
 * The hub stays at the world origin (as for the ceiling mounts, so the puck
 * ghost and the camera need no offset); the wall plane is `length +
 * plate thickness` behind the hub's axis. Both mount parts print with their
 * wall side on the bed and the room's "up" along their +y, so their
 * placement is the same rotation ((x, y, z) → (−x, z, y)) and a translation.
 */
import { deriveWallArm, wallArmFootprint } from '../../geometry/parts/wallArm.ts';
import {
  cableSlotX,
  keyholeSpacingLimits,
  wallPlateFootprint,
} from '../../geometry/parts/wallPlate.ts';
import { M3 } from '../../geometry/joints/screw.ts';
import type { JointInterface, Mat4, PartDraft, Warning } from '../../model/assembly.ts';
import type { WallArmParams, WallPlateParams } from '../../model/parts.ts';
import { HUB_THREAD_STUB, mountThreadJoint, screwJoint } from '../interfaces.ts';
import { compose, translation } from '../transforms.ts';
import { hangingTransforms, mountPartColour } from './common.ts';
import type { MountCtx, MountModule } from './types.ts';

/** The id of the hub ↔ arm joint (the hub's stub is male, the arm's end boss female). */
export const HUB_TO_ARM_JOINT_ID = 'hubToArm';
/** The id of the arm ↔ plate screw joint (the arm's flange is male, the plate female). */
export const ARM_TO_PLATE_JOINT_ID = 'armToPlate';

/** The arm's flange on the plate: Ø × thickness, mm. */
export const ARM_FLANGE = Object.freeze({ diameter: 60, thickness: 6 });
/** The flange's four M3 screws sit on this bolt circle, mm. */
export const ARM_BOLT_CIRCLE = 50;
/** The plate's keyholes: head hole Ø, slot width, travel from the head hole to the slot's end, mm. */
export const KEYHOLE = Object.freeze({ headDiameter: 9, slotWidth: 4.5, length: 12 });
/** Corner radius of the plate, mm. */
const PLATE_CORNER_RADIUS = 6;
/** Room between the flange and the plate's edge, mm. */
const PLATE_MARGIN = 4;
/** Thinnest wall the cable bore may leave in the arm's tube, mm. */
const TUBE_MIN_WALL = 3;

/** The thread joint of the hub's mount face: its male stub (root Ø16, 12 mm) into the arm's end boss. */
export function hubFaceJoint(ctx: MountCtx<'wallArm'>) {
  return mountThreadJoint(
    HUB_TO_ARM_JOINT_ID,
    { male: 'hub', female: 'wallArm' },
    HUB_THREAD_STUB,
    ctx.joints,
    ctx.printer.nozzle,
  );
}

/** The flange's screws into the plate. */
export function armScrewJoint(ctx: Pick<MountCtx<'wallArm'>, 'joints'>): JointInterface {
  return screwJoint(
    ARM_TO_PLATE_JOINT_ID,
    { male: 'wallArm', female: 'wallPlate' },
    ARM_BOLT_CIRCLE,
    ctx.joints,
  );
}

/** The arm's params (also needed for the placement in fit-test mode, when there are no parts). */
export function wallArmParams(ctx: MountCtx<'wallArm'>): WallArmParams {
  const { arm } = ctx.mount;
  return {
    shape: arm.shape,
    length: arm.length,
    // A straight arm does not rise; one key for every straight arm.
    riseAngle: arm.shape === 'straight' ? 0 : arm.riseAngle,
    tubeDiameter: arm.tubeDiameter,
    boreDiameter: arm.cableDiameter + 1,
    flange: { ...ARM_FLANGE },
    plateScrews: armScrewJoint(ctx),
    hubJoint: hubFaceJoint(ctx).iface,
    quality: ctx.quality,
  };
}

export function wallPlateParams(ctx: MountCtx<'wallArm'>): WallPlateParams {
  const { plate, arm } = ctx.mount;
  return {
    width: plate.width,
    height: plate.height,
    thickness: plate.thickness,
    cornerRadius: PLATE_CORNER_RADIUS,
    keyholes: { spacing: plate.keyholeSpacing, ...KEYHOLE },
    armScrews: armScrewJoint(ctx),
    // A slot through the plate, so the cable lies flush on the wall.
    cableNotch: { width: arm.cableDiameter + 1, depth: plate.thickness },
    quality: ctx.quality,
  };
}

/** Print frame → room for both mount parts: wall side (z) → +y, the room's up (y) → +z. */
const WALL_ROTATION: Mat4 = [-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

const PLATE_PRINT_NOTES = [
  'Print as exported: back face on the bed. No supports needed.',
  'Hang the plate on two screws through its keyholes (heads in the channels on the back, the plate slid down onto them); the cable leaves through the slot at its bottom edge.',
];
const ARM_PRINT_NOTES = [
  "Print as exported: standing on its flange, the end boss's thread lying horizontal. No supports needed; a brim keeps the tall part in place.",
  'Feed the cable in through the flange and out of the threaded bore, screw the hub onto the arm (clockwise seen from below), then screw the flange to the plate with four M3 × 10 screws.',
];

const mm = (n: number) => (Math.round(n * 10) / 10).toString();

/** `n` rounded up to a multiple of `step`. */
const ceilTo = (n: number, step: number) => Math.ceil(n / step - 1e-9) * step;

export const wallArmMount: MountModule<'wallArm'> = {
  kind: 'wallArm',
  partKinds: ['wallPlate', 'wallArm'],

  /**
   * The tube must leave the cable bore a wall; the plate must hold the flange
   * and both keyholes, which keep clear of the cable hole.
   */
  normalize(mount) {
    const warnings: Warning[] = [];
    const warn = (paramPath: string, message: string) =>
      warnings.push({ severity: 'warning', code: 'adjusted', paramPath, message });
    const arm = { ...mount.arm };
    const plate = { ...mount.plate };
    const cable = arm.cableDiameter + 1;
    const tubeMin = ceilTo(cable + 2 * TUBE_MIN_WALL, 0.5);
    if (arm.tubeDiameter < tubeMin) {
      arm.tubeDiameter = tubeMin;
      warn(
        'mount.arm.tubeDiameter',
        `Arm tube Ø raised to ${mm(tubeMin)} mm so the Ø${mm(cable)} mm cable bore keeps a ${TUBE_MIN_WALL} mm wall`,
      );
    }
    const sizeMin = ARM_FLANGE.diameter + 2 * PLATE_MARGIN;
    if (plate.width < sizeMin) {
      plate.width = sizeMin;
      warn(
        'mount.plate.width',
        `Wall plate width raised to ${sizeMin} mm so it holds the Ø${ARM_FLANGE.diameter} mm arm flange`,
      );
    }
    // The keyholes: their spacing between the cable hole and the plate's edges.
    const limits = keyholeSpacingLimits(plate.height, KEYHOLE, cable);
    const edges = plate.height - limits.max; // the height the keyholes need beyond their spacing
    const spacingMin = Math.ceil(limits.min - 1e-9);
    const heightMin = Math.max(sizeMin, edges + spacingMin);
    if (plate.height < heightMin) {
      plate.height = heightMin;
      warn(
        'mount.plate.height',
        `Wall plate height raised to ${heightMin} mm so it holds the arm flange and both keyholes`,
      );
    }
    const spacingMax = Math.floor(plate.height - edges + 1e-9);
    if (plate.keyholeSpacing < spacingMin) {
      plate.keyholeSpacing = spacingMin;
      warn(
        'mount.plate.keyholeSpacing',
        `Keyhole spacing raised to ${spacingMin} mm so the keyholes clear the cable hole`,
      );
    } else if (plate.keyholeSpacing > spacingMax) {
      plate.keyholeSpacing = spacingMax;
      warn(
        'mount.plate.keyholeSpacing',
        `Keyhole spacing reduced to ${spacingMax} mm so both keyholes stay inside the ${mm(plate.height)} mm plate`,
      );
    }
    const changed =
      arm.tubeDiameter !== mount.arm.tubeDiameter ||
      plate.width !== mount.plate.width ||
      plate.height !== mount.plate.height ||
      plate.keyholeSpacing !== mount.plate.keyholeSpacing;
    return changed ? { mount: { ...mount, arm, plate }, warnings } : { mount, warnings };
  },

  validate(ctx) {
    const { plate, arm } = ctx.mount;
    const warnings: Warning[] = [];
    if (plate.thickness < arm.cableDiameter) {
      warnings.push({
        severity: 'warning',
        code: 'cable-slot',
        partId: 'wallPlate',
        paramPath: 'mount.plate.thickness',
        message: `A Ø${mm(arm.cableDiameter)} mm cable stands out of the ${mm(plate.thickness)} mm plate's slot and presses on the flange; use a plate at least as thick as the cable.`,
      });
    }
    // The cable slot's vertical leg must pass between the lower keyhole and the flange's screws.
    const cable = arm.cableDiameter + 1;
    const pocket = ctx.joints.heatSet ? M3.insertPocket[0] : M3.tapHole;
    const screwX = ARM_BOLT_CIRCLE / 2 / Math.SQRT2 - pocket / 2;
    if (cableSlotX(KEYHOLE, cable) + cable / 2 + 1 > screwX) {
      warnings.push({
        severity: 'warning',
        code: 'cable-slot',
        partId: 'wallPlate',
        paramPath: 'mount.arm.cableDiameter',
        message: `The slot for a Ø${mm(arm.cableDiameter)} mm cable runs into the plate's screw pockets for the arm; use a thinner cable.`,
      });
    }
    return warnings;
  },

  hubFace: (ctx) => ({
    kind: 'threadMale',
    joint: hubFaceJoint(ctx).iface,
    cableDiameter: ctx.mount.arm.cableDiameter,
  }),

  parts(ctx) {
    const hubJoint = hubFaceJoint(ctx);
    const plate = wallPlateParams(ctx);
    const arm = wallArmParams(ctx);
    const parts: PartDraft[] = [
      {
        id: 'wallPlate',
        kind: 'wallPlate',
        displayName: 'Wall plate',
        params: plate,
        colour: mountPartColour(ctx, 'wallPlate', 'wallPlate'),
        footprint: wallPlateFootprint(plate),
        printNotes: [
          ...PLATE_PRINT_NOTES,
          ctx.joints.heatSet
            ? 'Press four M3 heat-set inserts into the pockets on the front face, flush.'
            : 'Tap the four holes on the front face for M3 screws (no heat-set inserts).',
        ],
      },
      {
        id: 'wallArm',
        kind: 'wallArm',
        displayName: 'Wall arm',
        params: arm,
        colour: mountPartColour(ctx, 'wallArm', 'wallArm'),
        footprint: wallArmFootprint(arm),
        printNotes: [...ARM_PRINT_NOTES],
      },
    ];
    return {
      parts,
      interfaces: [hubJoint.iface, arm.plateScrews],
      warnings: hubJoint.warnings,
    };
  },

  placement(ctx) {
    const hanging = hangingTransforms(ctx);
    const { plate, arm } = ctx.mount;
    const d = deriveWallArm(wallArmParams(ctx));
    const reach = arm.length;
    const wallY = -reach - plate.thickness;
    // The arm frame's origin (the flange's centre) in the world: the boss's
    // bottom face (the thread's mouth) sits on the hub's mount face.
    const flangeZ = ctx.hub.derived.zFace - d.yBoss0;
    const partTransforms: Record<string, Mat4> = ctx.fitTest
      ? {}
      : {
          wallPlate: compose(translation(0, wallY, flangeZ), WALL_ROTATION),
          wallArm: compose(
            translation(0, -reach, flangeZ),
            WALL_ROTATION,
            translation(0, -d.yShift, 0),
          ),
        };
    const plateBottom = flangeZ - plate.height / 2;
    return {
      ...hanging,
      partTransforms,
      bottomZ: ctx.fitTest ? hanging.bottomZ : Math.min(hanging.bottomZ, plateBottom),
      context: { kind: 'wall', wallY },
      derived: {
        wallY,
        armLength: reach,
        armRise: d.rise,
        // The flange's (and the plate's) centre, and the end boss's bottom (on the hub).
        plateZ: flangeZ,
        armBossZ: ctx.hub.derived.zFace,
        cableDiameter: arm.cableDiameter,
      },
    };
  },
};
