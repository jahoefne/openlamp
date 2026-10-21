/**
 * Collar joint builders by type. Screws are not a collar joint; their cutters
 * come from `screwPattern` (screw.ts).
 */
import type { ShadeJointType } from '../../model/assembly.ts';
import { bayonetJoint } from './bayonet.ts';
import { snapJoint } from './snap.ts';
import { threadJoint } from './thread.ts';
import type { JointBuilder } from './types.ts';

export type { JointBuilder, JointCtx } from './types.ts';

export const COLLAR_JOINTS: Readonly<Record<ShadeJointType, JointBuilder>> = {
  bayonet: bayonetJoint,
  snap: snapJoint,
  thread: threadJoint,
};

export function collarJoint(type: string): JointBuilder {
  const builder = (COLLAR_JOINTS as Readonly<Record<string, JointBuilder | undefined>>)[type];
  if (!builder) throw new Error(`No collar joint of type "${type}"`);
  return builder;
}
