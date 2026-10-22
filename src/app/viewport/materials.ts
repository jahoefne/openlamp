/**
 * Part materials, one per colour (and light-on kind), shared by every mesh of
 * that colour. Each clips against the shared section plane.
 */
import {
  Color,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
} from 'three';
import { LIGHT_COLOUR, type LightMaterialKind } from './lightMode.ts';
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

/** Transmission of a shade in the light-on view (`MeshPhysicalMaterial`). */
export const SHADE_TRANSMISSION = 0.55;
/** Opacity of a shade in the simple light-on view (no transmission). */
export const SIMPLE_OPACITY = 0.6;

const lightMaterials = new Map<string, Material>();

/**
 * A part's material in the light-on view (see `lightMaterialKind`), cached by
 * kind, colour and wall: `transmission` lets the light through the shade
 * (thickness = its wall), `translucent` is the simple fallback (transparent,
 * opacity 0.6, a warm emissive tint), `reflective` the light inner shade
 * (metalness 0.9, roughness 0.25); `standard` is `partMaterial`.
 */
export function lightMaterial(kind: LightMaterialKind, colour: string, wall: number): Material {
  if (kind === 'standard') return partMaterial(colour);
  const thickness = Math.round(wall * 10) / 10;
  const key = `${kind}|${colour}|${kind === 'transmission' ? thickness : ''}`;
  let material = lightMaterials.get(key);
  if (!material) {
    const common = { color: colour, side: DoubleSide, clippingPlanes: [...sectionPlanes] };
    // The light shining through the shade's colour.
    const glow = new Color(colour).multiply(new Color(LIGHT_COLOUR));
    switch (kind) {
      case 'transmission':
        material = new MeshPhysicalMaterial({
          ...common,
          metalness: 0,
          roughness: 0.6,
          transmission: SHADE_TRANSMISSION,
          thickness,
          ior: 1.45,
          attenuationColor: colour,
          emissive: glow,
          emissiveIntensity: 0.3,
        });
        break;
      case 'translucent':
        material = new MeshStandardMaterial({
          ...common,
          roughness: 0.6,
          metalness: 0,
          transparent: true,
          opacity: SIMPLE_OPACITY,
          emissive: glow,
          emissiveIntensity: 0.45,
        });
        break;
      case 'reflective':
        material = new MeshPhysicalMaterial({ ...common, metalness: 0.9, roughness: 0.25 });
        break;
    }
    lightMaterials.set(key, material);
  }
  return material;
}

/** The light source in the light-on view: the puck's face, the bulb's glass, the strip, lit. */
export const glowMaterial = new MeshBasicMaterial({ color: LIGHT_COLOUR });

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
