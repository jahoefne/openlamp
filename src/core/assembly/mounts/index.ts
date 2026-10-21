/**
 * Mounts by kind: every mount is one `MountModule` (see types.ts), so
 * `assemble()` stays generic. The standing lamp and the wall arm are stubs
 * until M2.2b (their modules keep their names and this registration).
 */
import type { MountKind } from '../../schema/defs.ts';
import { ceilingCordMount } from './ceilingCord.ts';
import { ceilingStrapMount } from './ceilingStrap.ts';
import { standingMount } from './standing.ts';
import type { MountModule } from './types.ts';
import { wallArmMount } from './wallArm.ts';

export type {
  MountCtx,
  MountHubCtx,
  MountModule,
  MountParts,
  MountPlacement,
  MountShade,
} from './types.ts';

export const MOUNT_MODULES: { readonly [K in MountKind]: MountModule<K> } = {
  ceilingStrap: ceilingStrapMount,
  ceilingCord: ceilingCordMount,
  wallArm: wallArmMount,
  standing: standingMount,
};

/** The module of a mount kind. */
export function mountModule<K extends MountKind>(kind: K): MountModule<K> {
  return MOUNT_MODULES[kind];
}
