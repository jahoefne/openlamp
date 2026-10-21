/**
 * The wall lamp: a wall plate, an arm screwed to it (4 × M3, inserts in the
 * plate) and the hub hanging under the end of the arm. The hub's mount face
 * is a hollow male thread stub that screws up into the arm's end boss.
 *
 * STUB until step M2.2b, which owns this file (and `geometry/parts/{wallPlate,
 * wallArm}.ts`): the hub face is final, there are no parts yet, the hub and
 * the shade hang as on the ceiling, and an info says the parts are pending.
 * M2.2b fills in `partKinds`, `normalize?`, `validate`, `parts` (plate, arm;
 * the hub ↔ arm joint `hubFaceJoint(ctx)` goes into `interfaces`) and
 * `placement` (wall plane y 0, the arm along +y, the hub below its end).
 */
import { HUB_THREAD_STUB, mountThreadJoint } from '../interfaces.ts';
import { hangingTransforms, pendingMountInfo } from './common.ts';
import type { MountCtx, MountModule } from './types.ts';

/** The id of the hub ↔ arm joint (the hub's stub is male, the arm's end boss female). */
export const HUB_TO_ARM_JOINT_ID = 'hubToArm';

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

export const wallArmMount: MountModule<'wallArm'> = {
  kind: 'wallArm',
  partKinds: [],

  validate: () => [pendingMountInfo('wallArm')],

  hubFace: (ctx) => ({
    kind: 'threadMale',
    joint: hubFaceJoint(ctx).iface,
    cableDiameter: ctx.mount.arm.cableDiameter,
  }),

  parts: () => ({ parts: [], interfaces: [] }),

  placement(ctx) {
    const hanging = hangingTransforms(ctx);
    return {
      ...hanging,
      partTransforms: {},
      // Until the arm exists: the wall one arm length behind the hub's axis.
      context: { kind: 'wall', wallY: -ctx.mount.arm.length },
      derived: {},
    };
  },
};
