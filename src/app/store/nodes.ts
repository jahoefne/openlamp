/**
 * The lamp tree's nodes: what the inspector can show, and which node a
 * printed part belongs to. Pure (no React, no three.js): shared by the tree,
 * the inspector, the viewport's click-to-select and the unit tests.
 *
 *   Project      name, printer chip, quality, fit test, view options
 *   Printer      the build volume and the plate
 *   Mount        which mount and its parameters; its parts (canopy, stem, base, …)
 *   Light        which light and its parameters
 *   Outer shade  the shade (or the fused single-piece print)
 *   Inner shade  the optional second shade
 *   Hub & joints the hub, the shade joint, the fit-test pair
 */
import { INNER_SHADE_ID } from '@core/assembly/assemble.ts';
import type { PartSpec } from '@core/model/assembly.ts';

export const NODE_IDS = [
  'project',
  'printer',
  'mount',
  'light',
  'outerShade',
  'innerShade',
  'hub',
] as const;
export type NodeId = (typeof NODE_IDS)[number];

/** Where a click on empty space (and a fresh page) puts the selection. */
export const ROOT_NODE: NodeId = 'project';

export const NODE_LABELS: Readonly<Record<NodeId, string>> = {
  project: 'Project',
  printer: 'Printer',
  mount: 'Mount',
  light: 'Light',
  outerShade: 'Outer shade',
  innerShade: 'Inner shade',
  hub: 'Hub & joints',
};

/**
 * The node a part belongs to: the hub → Hub & joints, the shades → their
 * shade, the fit-test pieces → Hub & joints (the joint's clearance lives
 * there), every other part (canopy, cord grip, stem, base, lid, wall plate,
 * wall arm) → Mount.
 */
export function nodeOfPart(part: Pick<PartSpec, 'id' | 'kind'>): NodeId {
  if (part.id === INNER_SHADE_ID) return 'innerShade';
  switch (part.kind) {
    case 'hub':
    case 'fitMale':
    case 'fitFemale':
      return 'hub';
    case 'shade':
      return 'outerShade';
    default:
      return 'mount';
  }
}

/** The part a node stands for, if it is one part (its outline in the viewport). */
export function mainPartOf(node: NodeId, parts: readonly PartSpec[]): PartSpec | undefined {
  switch (node) {
    case 'hub':
      return parts.find((p) => p.kind === 'hub');
    case 'outerShade':
      return parts.find((p) => p.kind === 'shade' && p.id !== INNER_SHADE_ID);
    case 'innerShade':
      return parts.find((p) => p.id === INNER_SHADE_ID);
    default:
      return undefined;
  }
}

/**
 * The parts listed under their own row in the tree: everything but the hub
 * and the shades (which are nodes of their own), in assembly order.
 */
export function structuralParts(parts: readonly PartSpec[]): PartSpec[] {
  return parts.filter((p) => p.kind !== 'hub' && p.kind !== 'shade');
}

/** The node the inspector shows: the inner shade's falls back to the outer one's when there is none. */
export function shownNode(node: NodeId, hasInnerShade: boolean): NodeId {
  return node === 'innerShade' && !hasInnerShade ? 'outerShade' : node;
}
