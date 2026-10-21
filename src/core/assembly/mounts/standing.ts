/**
 * The standing lamp (table or floor): a weighted base, a segmented stem, the
 * hub on top of the stem (turned over: light face up, the shade flaring
 * upward). The hub's mount face is a female thread bore; the top stem
 * segment's male thread screws into it.
 *
 * STUB until step M2.2b, which owns this file (and `geometry/parts/{stem,base,
 * baseLid}.ts`): the hub face is final, there are no parts yet, the hub and
 * the shade hang as on the ceiling, and an info says the parts are pending.
 * M2.2b fills in `partKinds`, `normalize?`, `validate`, `parts` (stem segments,
 * base, lid; the stem ↔ hub joint `hubFaceJoint(ctx)` goes into `interfaces`)
 * and `placement` (hub flipped onto the stem's top, `context.kind: 'floor'`).
 */
import { HUB_THREAD_BORE, mountThreadJoint } from '../interfaces.ts';
import { hangingTransforms, pendingMountInfo } from './common.ts';
import type { MountCtx, MountModule } from './types.ts';

/** The id of the stem ↔ hub joint (the stem's top is male, the hub's bore female). */
export const STEM_TO_HUB_JOINT_ID = 'stemToHub';

/**
 * The thread joint of the hub's mount face: the top stem segment's male
 * thread (root Ø20, 14 mm) into the hub's female bore.
 */
export function hubFaceJoint(ctx: MountCtx<'standing'>) {
  return mountThreadJoint(
    STEM_TO_HUB_JOINT_ID,
    { male: 'stem', female: 'hub' },
    HUB_THREAD_BORE,
    ctx.joints,
    ctx.printer.nozzle,
  );
}

export const standingMount: MountModule<'standing'> = {
  kind: 'standing',
  partKinds: [],

  validate: () => [pendingMountInfo('standing')],

  hubFace: (ctx) => ({
    kind: 'threadFemale',
    joint: hubFaceJoint(ctx).iface,
    cableDiameter: ctx.mount.stem.cableDiameter,
  }),

  parts: () => ({ parts: [], interfaces: [] }),

  placement(ctx) {
    const hanging = hangingTransforms(ctx);
    return {
      ...hanging,
      partTransforms: {},
      context: { kind: 'floor', floorZ: hanging.bottomZ },
      derived: {},
    };
  },
};
