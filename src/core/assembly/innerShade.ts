/**
 * Adding and removing the inner shade (`project.shades[1]`). Pure, no WASM.
 *
 * A new inner shade copies the outer shade's revolved style, scaled to fit
 * inside it with the radial gap (and the outer wall) to spare all round,
 * 10 mm shorter and smooth, in white; its top is at least what its collar
 * ring needs. Adding one turns the single-piece print off: the inner shade
 * hangs from a second ring of a separate hub.
 */
import type { InnerShadeSpec, Project } from '../model/project.ts';
import { DEFAULT_INNER_SHADE_COLOUR } from '../model/project.ts';
import { SHADE_DEFS, type FlatShadeKey } from '../schema/defs.ts';
import { minShadeTopDiameter, resolveShadeJoint } from './interfaces.ts';
import { lightEnvelope } from './lights/index.ts';

/** How much shorter a new inner shade's wall is than the outer one's, mm. */
export const INNER_SHADE_SHORTER = 10;

/** `v` clamped to the range of the shade parameter `key`. */
function clampShade(key: FlatShadeKey, v: number): number {
  const def = SHADE_DEFS.find((d) => d.key === key);
  if (!def || def.type === 'select') return v;
  return Math.min(def.max, Math.max(def.min, v));
}

/**
 * The inner shade `project` gets when one is added: bottom and top Ø the
 * outer's less `2·radialGap + 2·wall` (whole mm; the top at least what the
 * inner collar ring needs), the wall 10 mm shorter, the same curve, shoulder
 * and wall thickness, a smooth surface, white.
 */
export function defaultInnerShade(project: Project): InnerShadeSpec {
  const outer = project.shades[0];
  const s = outer.style;
  const inset = 2 * project.hub.radialGap + 2 * outer.wallThickness;
  const envelope = lightEnvelope(project.light, {
    wallThickness: project.hub.wallThickness,
    collarWall: project.hub.collarWall,
    ventCount: project.hub.ventCount,
    mount: project.mount.kind,
  });
  const { collar } = resolveShadeJoint(
    project.joints,
    project.hub,
    envelope,
    {},
    { male: 'innerShade', female: 'hub' },
  );
  const minTop = Math.ceil(minShadeTopDiameter(collar) - 1e-9);
  return {
    id: 'inner',
    role: 'inner',
    colour: DEFAULT_INNER_SHADE_COLOUR,
    wallThickness: outer.wallThickness,
    style: {
      ...s,
      bottomDiameter: clampShade('bottomDiameter', Math.floor(s.bottomDiameter - inset)),
      topDiameter: clampShade('topDiameter', Math.max(minTop, Math.floor(s.topDiameter - inset))),
      height: clampShade('height', s.height - INNER_SHADE_SHORTER),
      surface: { ...s.surface, style: 'smooth' },
    },
  };
}

/** `project` with a new inner shade (`defaultInnerShade`) and a separate hub; unchanged if it has one. */
export function withInnerShade(project: Project): Project {
  if (project.shades[1]) return project;
  return {
    ...project,
    hub: { ...project.hub, fused: false },
    shades: [project.shades[0], defaultInnerShade(project)],
  };
}

/** `project` without its inner shade; unchanged if it has none. */
export function withoutInnerShade(project: Project): Project {
  if (!project.shades[1]) return project;
  return { ...project, shades: [project.shades[0]] };
}
