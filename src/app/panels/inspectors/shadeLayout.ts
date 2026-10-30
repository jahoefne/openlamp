import { SHADE_FAMILY_GROUPS, type ParamGroup, type ShadeFamily } from '@core/schema/defs.ts';

const SHAPE_KEYS: Readonly<Record<ShadeFamily, readonly string[]>> = {
  revolved: ['bottomDiameter', 'height', 'topDiameter', 'curve'],
  slatted: ['bottomDiameter', 'height', 'topDiameter'],
  tiered: ['bottomDiameter', 'tiers', 'tierDrop', 'topDiameter', 'tierCurve'],
  geometric: ['bottomDiameter', 'height', 'topDiameter'],
};
const CONSTRUCTION = new Set([
  'wallThickness',
  'shoulderAngle',
  'ringHeight',
  'slatThickness',
  'tierSpacers',
]);
const PATTERN_DETAILS = new Set(['ribDepth', 'tierOverlap', 'holePitch']);

/** UI ordering only: ranges, visibility rules and parameter paths stay in the core schema. */
function layoutOf(family: ShadeFamily) {
  const defs = SHADE_FAMILY_GROUPS[family].flatMap((g) => g.params);
  const shapeKeys = SHAPE_KEYS[family];
  const shape: ParamGroup = {
    id: 'shape',
    label: 'Shape',
    params: shapeKeys.flatMap((key) => defs.filter((d) => d.key === key)),
  };
  const appearance = SHADE_FAMILY_GROUPS[family]
    .map((g) => ({
      ...g,
      label: g.id === 'geometricShape' ? 'Form' : g.label,
      params: g.params.filter(
        (d) =>
          !shapeKeys.includes(d.key) && !CONSTRUCTION.has(d.key) && !PATTERN_DETAILS.has(d.key),
      ),
    }))
    .filter((g) => g.params.length > 0);
  const construction: ParamGroup = {
    id: 'construction',
    label: 'Construction',
    params: defs.filter((d) => CONSTRUCTION.has(d.key)),
  };
  const pattern: ParamGroup = {
    id: 'pattern-detail',
    label: 'Pattern details',
    params: defs.filter((d) => PATTERN_DETAILS.has(d.key)),
  };
  return { shape: [shape], appearance, construction: [construction], pattern: [pattern] };
}

export const SHADE_LAYOUT = {
  revolved: layoutOf('revolved'),
  slatted: layoutOf('slatted'),
  tiered: layoutOf('tiered'),
  geometric: layoutOf('geometric'),
};
