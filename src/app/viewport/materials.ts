/**
 * Part materials, one per colour, shared by every mesh of that colour. Each
 * clips against the shared section plane.
 */
import { DoubleSide, FrontSide, MeshStandardMaterial } from 'three';
import { sectionPlanes } from './sectionPlane.ts';

const partMaterials = new Map<string, MeshStandardMaterial>();

export function partMaterial(colour: string): MeshStandardMaterial {
  let material = partMaterials.get(colour);
  if (!material) {
    material = new MeshStandardMaterial({
      color: colour,
      roughness: 0.55,
      metalness: 0,
      side: DoubleSide,
      clippingPlanes: [...sectionPlanes],
    });
    partMaterials.set(colour, material);
  }
  return material;
}

/** A part that does not fit the print bed (bed view). */
export const overflowMaterial = new MeshStandardMaterial({
  color: 0xe5484d,
  roughness: 0.55,
  metalness: 0,
  side: DoubleSide,
  clippingPlanes: [...sectionPlanes],
});

/** The LED puck ghost. */
export const puckMaterial = new MeshStandardMaterial({
  color: 0x9fd3ff,
  transparent: true,
  opacity: 0.55,
  roughness: 0.3,
});

/** The velcro strap ghost. */
export const strapMaterial = new MeshStandardMaterial({
  color: 0x3a3a3a,
  transparent: true,
  opacity: 0.75,
  roughness: 0.9,
});

/** The pendant's cord ghost. */
export const cordMaterial = new MeshStandardMaterial({
  color: 0x2b2b2b,
  transparent: true,
  opacity: 0.85,
  roughness: 0.95,
});

/**
 * The ceiling (and the floor under the grid): seen from the room only
 * (FrontSide), so a camera above the ceiling looks through it at the lamp.
 */
export const ceilingMaterial = new MeshStandardMaterial({
  color: 0xe9e4dc,
  roughness: 0.9,
  side: FrontSide,
});

/**
 * The wall behind a wall lamp: seen from the room only (FrontSide; the plane
 * faces +y), and pushed back in depth so the wall plate's back face, which
 * lies on it, always wins (no z-fighting).
 */
export const wallMaterial = new MeshStandardMaterial({
  color: 0xdcd6cc,
  roughness: 0.95,
  side: FrontSide,
  polygonOffset: true,
  polygonOffsetFactor: 2,
  polygonOffsetUnits: 2,
});
