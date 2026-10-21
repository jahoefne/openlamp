/**
 * Mounts by kind: each resolves the hub's mount face and its own parts. The
 * cord pendant, the wall arm and the standing lamp register here in M2.2.
 */
import type { Mount } from '../../model/project.ts';
import { resolveCeilingStrap } from './ceilingStrap.ts';
import type { MountResolution } from './types.ts';

export type { MountResolution } from './types.ts';

export function resolveMount(mount: Mount): MountResolution {
  switch (mount.kind) {
    case 'ceilingStrap':
      return resolveCeilingStrap(mount);
  }
}
