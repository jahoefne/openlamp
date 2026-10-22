/**
 * Helpers shared by the mount modules.
 */
import type { Hex, Mat4, PartKind, Warning } from '../../model/assembly.ts';
import { DEFAULT_HUB_COLOUR } from '../../model/project.ts';
import { MOUNT_LABELS, type MountKind } from '../../schema/defs.ts';
import { identity, translation } from '../transforms.ts';
import type { MountCtx, MountHubCtx, MountShade, MountShadePart } from './types.ts';

/** A shade's parts with their transforms into the shade frame (the collar part alone by default). */
export function mountShadeParts(shade: MountShade): readonly MountShadePart[] {
  return shade.parts ?? [{ id: shade.id, transform: translation(0, 0, -shade.zCollar) }];
}

/** A shade's lowest point in the shade frame (the hub's). */
export function mountShadeBottom(shade: MountShade): number {
  return shade.zBottom ?? -shade.zCollar;
}

/**
 * A hanging lamp: the hub's print frame is the world (collar plane at z 0,
 * mount face up), each shade hangs below it with its collar plane at z 0:
 * the shade frame is the world, so every shade part keeps its own transform.
 */
export function hangingTransforms(ctx: Pick<MountHubCtx, 'shades'>): {
  hubTransform: Mat4;
  shadeTransforms: Record<string, Mat4>;
  bottomZ: number;
} {
  const shadeTransforms: Record<string, Mat4> = {};
  let bottomZ = 0;
  for (const shade of ctx.shades) {
    for (const part of mountShadeParts(shade)) shadeTransforms[part.id] = part.transform;
    bottomZ = Math.min(bottomZ, mountShadeBottom(shade));
  }
  return { hubTransform: identity(), shadeTransforms, bottomZ };
}

/** A mount part's colour: an override by part id, else by kind, else the hub's colour. */
export function mountPartColour(ctx: Pick<MountCtx, 'colours'>, id: string, kind: PartKind): Hex {
  return ctx.colours[id] ?? ctx.colours[kind] ?? ctx.colours.hub ?? DEFAULT_HUB_COLOUR;
}

/** The info a mount gives while its parts are not built yet. */
export function pendingMountInfo(kind: MountKind): Warning {
  return {
    severity: 'info',
    code: 'mount-pending',
    paramPath: 'mount.kind',
    message: `${MOUNT_LABELS[kind]}: parts for this mount arrive in a later step; for now only the hub (with its mount face) and the shade are built.`,
  };
}
