/**
 * What a mount contributes to the assembly.
 */
import type { PartSpec } from '../../model/assembly.ts';
import type { MountFace } from '../../model/parts.ts';

export interface MountResolution {
  /** What the mount puts on the hub's mount face. */
  mountFace: MountFace;
  /** Parts of the mount itself (canopy, stem, wall arm … from M2.2 on). */
  parts: PartSpec[];
  /** Distance from the hub's mount face to the ceiling it hangs from, mm. */
  ceilingGap: number;
}
