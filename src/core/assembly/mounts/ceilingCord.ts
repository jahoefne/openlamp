/**
 * The pendant: the lamp hangs on a cord from a canopy screwed to the ceiling.
 *
 *   ════════╤═══════╤════════ ceilingZ: the ceiling
 *          ╱  knot   ╲        canopy (printed ceiling-face-down, flipped here)
 *         ╱───┬┬┬─────╲       canopyZ: its room side
 *             ┃┃┃             collet neck + cord grip (grip `collet`)
 *              ┃              the cord, dropLength long
 *            ┌─┸─┐            cordZ0 = the hub's top: the cord boss, knot inside
 *           ╱ hub ╲
 *          ╱ shade ╲          collar plane at z 0, as every hanging lamp
 *
 * The hub's mount face is the cord boss; the canopy holds the cord with a knot
 * in its recess (grip `knot`) or with a slit collet neck and a screw-on cord
 * grip (grip `collet`, a thread joint: canopy male, grip female).
 */
import { canopyFootprint, colletCrestRadius } from '../../geometry/parts/canopy.ts';
import { cordGripFootprint } from '../../geometry/parts/cordGrip.ts';
import { RIGHT_HAND_TWIST } from '../../geometry/joints/thread.ts';
import type { JointInterface, Mat4, PartDraft, Warning } from '../../model/assembly.ts';
import type { CanopyParams, CordGripParams } from '../../model/parts.ts';
import type { MountOf } from '../../model/project.ts';
import { COLLET_THREAD, mountThreadJoint } from '../interfaces.ts';
import { compose, flipX, rotationZ, translation } from '../transforms.ts';
import { hangingTransforms, mountPartColour } from './common.ts';
import type { MountModule } from './types.ts';

type CordMount = MountOf<'ceilingCord'>;

/** The canopy's ceiling screw slots: width × length, head counterbore Ø, material under it (mm). */
export const CANOPY_SCREW_SLOT = Object.freeze({
  width: 4.5,
  length: 10,
  headDiameter: 9,
  floor: 4,
});
/** The collet's slits. */
const COLLET_SLITS = 3;
const COLLET_SLIT_WIDTH = 1.2;
/** The cord grip's clamping travel and wall, mm. */
export const CORD_GRIP_TRAVEL = 1.5;
const CORD_GRIP_WALL = 2.4;
/** Room between the screw heads' counterbores and the canopy's rim, mm. */
const CANOPY_RIM_MARGIN = 3;

/** The id of the canopy ↔ grip joint in `Assembly.interfaces`. */
export const COLLET_JOINT_ID = 'canopyToGrip';

const CANOPY_PRINT_NOTES = [
  'Print as exported: ceiling face on the bed. No supports needed.',
  'Feed the cord up through the canopy and tie a knot that sits in the recess; then screw the canopy to the ceiling through its two slots.',
];
const COLLET_CANOPY_NOTES = [
  'Print as exported: ceiling face on the bed, collet neck up. No supports needed.',
  'Feed the cord up through the neck, screw on the cord grip loosely, set the drop, then tighten the grip; screw the canopy to the ceiling through its two slots.',
];
const GRIP_PRINT_NOTES = [
  'Print as exported: open end on the bed. No supports needed.',
  'PETG recommended: the grip is tightened onto the collet and stays under load.',
];

const mm = (n: number) => (Math.round(n * 10) / 10).toString();

function canopyParams(
  mount: CordMount,
  quality: CanopyParams['quality'],
  collet?: CanopyParams['collet'],
): CanopyParams {
  return {
    diameter: mount.canopy.diameter,
    height: mount.canopy.height,
    screwSpacing: mount.canopy.screwSpacing,
    screwSlot: { ...CANOPY_SCREW_SLOT },
    cordHole: mount.cordDiameter + 1,
    ...(collet ? { collet } : {}),
    quality,
  };
}

export const ceilingCordMount: MountModule<'ceilingCord'> = {
  kind: 'ceilingCord',
  partKinds: ['canopy', 'cordGrip'],

  /** The screw slots must stay inside the canopy's rim and clear of the cord hole or collet. */
  normalize(mount) {
    const warnings: Warning[] = [];
    const slot = CANOPY_SCREW_SLOT;
    const c = (slot.length - slot.width) / 2;
    const R = mount.canopy.diameter / 2;
    const max = Math.floor(2 * (R - CANOPY_RIM_MARGIN - slot.headDiameter / 2 - c));
    const inner =
      mount.grip === 'collet'
        ? COLLET_THREAD.diameter / 2 + 1 + 2 // the collet's crest (≈ root + depth) plus a wall
        : (mount.cordDiameter + 1) / 2 + 2;
    const min = Math.ceil(2 * (inner + slot.headDiameter / 2 + c));
    let spacing = mount.canopy.screwSpacing;
    if (spacing > max) {
      spacing = Math.max(min, max);
      warnings.push({
        severity: 'warning',
        code: 'adjusted',
        paramPath: 'mount.canopy.screwSpacing',
        message: `Canopy screw spacing reduced to ${spacing} mm so the screw heads stay inside the Ø${mm(mount.canopy.diameter)} mm canopy`,
      });
    } else if (spacing < min) {
      spacing = min;
      warnings.push({
        severity: 'warning',
        code: 'adjusted',
        paramPath: 'mount.canopy.screwSpacing',
        message: `Canopy screw spacing raised to ${spacing} mm so the screw heads clear the ${mount.grip === 'collet' ? 'collet neck' : 'cord hole'}`,
      });
    }
    if (spacing === mount.canopy.screwSpacing) return { mount, warnings };
    return { mount: { ...mount, canopy: { ...mount.canopy, screwSpacing: spacing } }, warnings };
  },

  validate: () => [],

  hubFace: (ctx) => ({ kind: 'cordBoss', cordDiameter: ctx.mount.cordDiameter }),

  parts(ctx) {
    const { mount, quality } = ctx;
    const parts: PartDraft[] = [];
    const interfaces: JointInterface[] = [];
    const warnings: Warning[] = [];
    let collet: CanopyParams['collet'];
    if (mount.grip === 'collet') {
      const joint = mountThreadJoint(
        COLLET_JOINT_ID,
        { male: 'canopy', female: 'cordGrip' },
        COLLET_THREAD,
        ctx.joints,
        ctx.printer.nozzle,
      );
      collet = { joint: joint.iface, slits: COLLET_SLITS, slitWidth: COLLET_SLIT_WIDTH };
      interfaces.push(joint.iface);
      warnings.push(...joint.warnings);
    }
    const canopy = canopyParams(mount, quality, collet);
    parts.push({
      id: 'canopy',
      kind: 'canopy',
      displayName: 'Canopy',
      params: canopy,
      colour: mountPartColour(ctx, 'canopy', 'canopy'),
      footprint: canopyFootprint(canopy),
      printNotes: [...(collet ? COLLET_CANOPY_NOTES : CANOPY_PRINT_NOTES)],
    });
    if (collet) {
      const grip: CordGripParams = {
        joint: collet.joint,
        cordHole: mount.cordDiameter + 1,
        travel: CORD_GRIP_TRAVEL,
        wall: CORD_GRIP_WALL,
        quality,
      };
      parts.push({
        id: 'cordGrip',
        kind: 'cordGrip',
        displayName: 'Cord grip',
        params: grip,
        colour: mountPartColour(ctx, 'cordGrip', 'cordGrip'),
        footprint: cordGripFootprint(grip),
        printNotes: [...GRIP_PRINT_NOTES],
      });
      // The collet must stay clear of the cord: the neck's bore is the cord hole.
      if (colletCrestRadius(canopy) - (mount.cordDiameter + 1) / 2 < 3) {
        warnings.push({
          severity: 'warning',
          code: 'collet-wall',
          partId: 'canopy',
          paramPath: 'mount.cordDiameter',
          message: `A Ø${mm(mount.cordDiameter)} mm cord leaves the Ø${COLLET_THREAD.diameter} mm collet neck less than 3 mm of wall; use a thinner cord or the knot grip.`,
        });
      }
    }
    return { parts, interfaces, warnings };
  },

  placement(ctx, parts) {
    const { mount } = ctx;
    const hubTop = ctx.hub.derived.hubHeight;
    const canopyZ = hubTop + mount.dropLength; // the canopy's room side
    const ceilingZ = canopyZ + mount.canopy.height;
    // The canopy is printed ceiling face down: half a turn about x, up to the ceiling.
    const canopyT = compose(translation(0, 0, ceilingZ), flipX());
    const partTransforms: Record<string, Mat4> = {};
    for (const part of parts.parts) {
      if (part.kind === 'canopy') partTransforms[part.id] = canopyT;
      if (part.kind === 'cordGrip') {
        // In the canopy's frame the grip's mouth sits `travel` above the neck's
        // base, turned along the thread so the two helices line up.
        const { joint, travel } = part.params;
        const pitch = joint.thread?.pitch ?? 1;
        const turn = (RIGHT_HAND_TWIST * 360 * travel) / pitch;
        partTransforms[part.id] = compose(
          canopyT,
          translation(0, 0, mount.canopy.height + travel),
          rotationZ(turn),
        );
      }
    }
    return {
      ...hangingTransforms(ctx),
      partTransforms,
      context: {
        kind: 'ceiling',
        ceilingZ,
        cord: { z0: hubTop, z1: canopyZ, diameter: mount.cordDiameter },
      },
      derived: {
        ceilingZ,
        ceilingGap: 0,
        cordZ0: hubTop,
        cordZ1: canopyZ,
        cordDiameter: mount.cordDiameter,
        canopyZ,
      },
    };
  },

  withPart: (kind, mount) => (kind === 'cordGrip' ? { ...mount, grip: 'collet' } : mount),
};
