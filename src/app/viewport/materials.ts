/**
 * Part materials, one per colour, shared by every mesh of that colour. Each
 * clips against the shared section plane.
 */
import { DoubleSide, MeshStandardMaterial } from 'three';
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

export const ceilingMaterial = new MeshStandardMaterial({
  color: 0xe9e4dc,
  roughness: 0.9,
  side: DoubleSide,
});
