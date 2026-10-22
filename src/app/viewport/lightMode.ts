/**
 * The light-on view's decisions, pure (no three.js, no React): which mode the
 * viewport renders in, which material kind each part gets in it, and where
 * the light source's point light sits. The materials themselves are in
 * materials.ts, the scene in LightOn.tsx.
 *
 *   mode      off: the standard materials, the usual lights
 *             physical: transmission shades, a synthetic environment
 *             simple: the low-end fallback (opacity + emissive, no transmission pass)
 *   kind      standard     every part that is not a shade's (and every part when off)
 *             transmission an outer shade, or an inner shade of a dark colour (physical)
 *             translucent  the same shades in the simple mode
 *             reflective   an inner shade of a light colour: metalness 0.9, roughness 0.25
 */
import type { ShadeRole } from '@core/model/project.ts';

export type LightMode = 'off' | 'physical' | 'simple';

/**
 * The light on screen as far as its source position needs it (a
 * `ShownLight` of sceneDerived.ts, world frame): a puck's underside and
 * thickness, a bulb's centre, cap end, Ø and length, a strip's mid-plane and
 * thickness.
 */
export type SourceLight =
  | { kind: 'puck'; z: number; height: number }
  | { kind: 'bulb'; z: number; capZ: number; diameter: number; length: number }
  | { kind: 'strip'; z: number; thickness: number };

export type LightMaterialKind = 'standard' | 'transmission' | 'translucent' | 'reflective';

/** The warm white of the light (≈ 2700 K). */
export const LIGHT_COLOUR = '#ffd6a0';

/** How far in front of a puck's or a strip's light face the point light sits, mm. */
export const SOURCE_OFFSET = 4;

/** Below this Rec. 709 luma (0 … 1) a colour is dark: an inner shade of it does not reflect. */
export const LIGHT_LUMA = 0.6;

/** The mode the viewport renders in: light-on only in the assembled view. */
export function lightModeOf(lightOn: boolean, simple: boolean, bedView: boolean): LightMode {
  if (!lightOn || bedView) return 'off';
  return simple ? 'simple' : 'physical';
}

/** Rec. 709 luma of a `#rrggbb` (or `#rgb`) colour, 0 … 1; 0 for anything else. */
export function lumaOf(colour: string): number {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim())?.[1];
  if (!hex) return 0;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** A light colour (white, cream, pale grey): an inner shade of it reads as a reflector. */
export function isLightColour(colour: string): boolean {
  return lumaOf(colour) >= LIGHT_LUMA;
}

/**
 * The material kind of a part in the light-on view: `role` is the shade the
 * part belongs to (`shadeRoleOfPart`), undefined for the hub, the mount parts
 * and the fit-test pieces.
 */
export function lightMaterialKind(
  mode: LightMode,
  role: ShadeRole | undefined,
  colour: string,
): LightMaterialKind {
  if (mode === 'off' || role === undefined) return 'standard';
  if (role === 'inner' && isLightColour(colour)) return 'reflective';
  return mode === 'physical' ? 'transmission' : 'translucent';
}

/**
 * Where the light's point light sits (world z on the lamp's axis, before the
 * display lift): `facing` is the way the light shines along z (−1 hanging,
 * +1 a standing lamp's turned-over hub). A puck shines from its light face
 * (its underside `z` hanging, its top on a standing lamp), a bulb from the
 * centre of its glass, a strip ring from its face.
 */
export function lightSourceZ(light: SourceLight, facing: 1 | -1): number {
  switch (light.kind) {
    case 'puck': {
      const face = facing < 0 ? light.z : light.z + light.height;
      return face + facing * SOURCE_OFFSET;
    }
    case 'bulb': {
      // As the bulb ghost: the glass sphere at the far end from the cap.
      const r = light.diameter / 2;
      const dir = light.capZ >= light.z ? 1 : -1;
      return light.capZ - dir * (light.length - r);
    }
    case 'strip':
      return light.z + facing * (light.thickness / 2 + SOURCE_OFFSET);
  }
}
