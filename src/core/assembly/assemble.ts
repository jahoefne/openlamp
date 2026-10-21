/**
 * project → Assembly: the printable parts with their resolved parameters,
 * cache keys, transforms and bed footprints, the joints between them, plus
 * every warning. Pure, no WASM: it runs on the main thread for every edit.
 *
 * - `hub.fused` (the default): one `shade` part, the classic shade's builder
 *   unchanged (hub and shade as one print), identity transforms.
 * - split: a `hub` (print frame = world: the collar plane at z 0, the mount
 *   face on top) and a revolved `shade` hanging below it, translated by
 *   −zCollar so its collar plane meets the hub at z 0. One shade joint
 *   (`joints.shadeToHub`) in `interfaces`, copied into both parts' params.
 *   Fit-test mode keeps just the hub (the joint test pair comes in M2.5).
 */
import { canonicalJson, cyrb53 } from '../hash.ts';
import {
  classicShadeFootprint,
  classicShadeZOffset,
  derive,
} from '../geometry/parts/classicShade.ts';
import { deriveHub, hubFootprint } from '../geometry/parts/hub.ts';
import { deriveRevolvedShade, revolvedShadeFootprint } from '../geometry/parts/shades/revolved.ts';
import type { Quality } from '../geometry/quality.ts';
import {
  IDENTITY,
  type Assembly,
  type Footprint,
  type JointInterface,
  type Mat4,
  type PartKind,
  type PartParamsByKind,
  type PartSpec,
  type ShadeJointType,
  type Warning,
} from '../model/assembly.ts';
import type { FusedShadeParams, HubParams, RevolvedShadeParams } from '../model/parts.ts';
import {
  CLASSIC_PARAM_PATHS,
  DEFAULT_HUB_COLOUR,
  HUB_PARAM_PATHS,
  classicParamsToProject,
  projectToClassicParams,
  projectToHubParams,
  type Project,
} from '../model/project.ts';
import type { ClassicShadeKey, ClassicShadeParams, HubJointKey } from '../schema/defs.ts';
import { normalizeClassicShade, normalizeHubJoint } from '../schema/normalize.ts';
import { minShadeTopDiameter, resolveShadeJoint } from './interfaces.ts';
import { layoutParts, placementTransform } from './layout.ts';
import { lightEnvelope, lightInsert } from './lights/index.ts';
import { resolveMount, type MountResolution } from './mounts/index.ts';
import { validateBedFit, validateLayout } from './validate.ts';

export interface AssembleOptions {
  /** Mesh quality baked into every part's params and buildKey; default the preview quality. */
  quality?: Quality;
}

const FUSED_PRINT_NOTES = [
  'Print as exported: open end on the bed, housing on top. No supports needed.',
  'Two 0.4 mm perimeters (0.8 mm wall) diffuse the light best; no infill needed.',
];

const FIT_TEST_NOTES = [
  'Fit test: drop the puck into the ring and thread the strap before printing the whole shade.',
];

const HUB_PRINT_NOTES = [
  'Print as exported: collar ring on the bed, mount face up. No supports needed.',
];

const HUB_FIT_TEST_NOTES = [
  'Fit test: drop the puck into the hub and thread the strap before printing the shade.',
];

const SHADE_PRINT_NOTES = [
  'Print as exported: open end on the bed, collar up. No supports needed.',
  'Two 0.4 mm perimeters (0.8 mm wall) diffuse the light best; no infill needed.',
];

const JOINT_NOTES: Readonly<Record<ShadeJointType, string>> = {
  bayonet:
    "Assembly: push the shade's lugs up into the hub's slots and turn the shade clockwise (seen from below) until it stops.",
  snap: "Assembly: press the shade's collar all the way into the hub ring; the crush ribs hold it.",
  thread: 'Assembly: screw the shade into the hub, clockwise seen from below.',
};

function translation(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

/** A flat classic or hub parameter key → its project path (other paths pass through). */
function projectPath(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  if (key in CLASSIC_PARAM_PATHS) return CLASSIC_PARAM_PATHS[key as ClassicShadeKey];
  if (key in HUB_PARAM_PATHS) return HUB_PARAM_PATHS[key as HubJointKey];
  return key;
}

/** Attach a warning to `partId` and translate its flat key into a project path. */
function located(w: Warning, partId: string): Warning {
  const paramPath = projectPath(w.paramPath);
  return paramPath === undefined ? { ...w, partId } : { ...w, partId, paramPath };
}

interface Draft<K extends PartKind> {
  id: string;
  kind: K;
  displayName: string;
  params: PartParamsByKind[K];
  colour: PartSpec['colour'];
  assembledTransform: Mat4;
  footprint: Footprint;
  printNotes: string[];
}

type AnyDraft = { [K in PartKind]: Draft<K> }[PartKind];

/** Cache keys, bed layout, bed-fit and layout warnings: what every assembly does with its parts. */
function finish(
  project: Project,
  drafts: readonly AnyDraft[],
  interfaces: Record<string, JointInterface>,
  derived: Record<string, number>,
  warnings: Warning[],
): Assembly {
  const layout = layoutParts(
    drafts.map((d) => ({ id: d.id, x: d.footprint.x, y: d.footprint.y })),
    project.printer.bed,
  );
  const parts = drafts.map((d): PartSpec => {
    const buildKey = canonicalJson({ kind: d.kind, params: d.params });
    const placement = layout.placements.find((p) => p.id === d.id);
    const common = {
      id: d.id,
      displayName: d.displayName,
      buildKey,
      hash: cyrb53(buildKey),
      colour: d.colour,
      instances: 1,
      assembledTransform: d.assembledTransform,
      printTransform: placement ? placementTransform(placement) : [...IDENTITY],
      bedFootprint: d.footprint,
      printNotes: d.printNotes,
      warnings: [],
    };
    return d.kind === 'hub'
      ? { ...common, kind: 'hub', params: d.params }
      : { ...common, kind: 'shade', params: d.params };
  });
  const bedFit = validateBedFit(parts, project.printer);
  warnings.push(...bedFit);
  warnings.push(...validateLayout(layout, new Set(bedFit.map((w) => w.partId ?? ''))));
  for (const p of parts) p.warnings = warnings.filter((w) => w.partId === p.id);
  return { parts, interfaces, layout, derived, warnings };
}

/** Puck and strap positions for the viewport's ghosts, from the mount face and the housing. */
function ghostDerived(
  mount: MountResolution,
  puck: { z: number; diameter: number; height: number },
  housing: { rBoss: number; zTop: number },
): Record<string, number> {
  const out: Record<string, number> = {
    ceilingZ: housing.zTop,
    ceilingGap: mount.ceilingGap,
    puckZ: puck.z,
    puckDiameter: puck.diameter,
    puckHeight: puck.height,
    rBoss: housing.rBoss,
  };
  if (mount.mountFace.kind === 'strap') {
    const { strapWidth, strapThickness, loopLength } = mount.mountFace;
    Object.assign(out, { strapWidth, strapThickness, loopLength });
  }
  return out;
}

function assembleFused(
  project: Project,
  classic: ClassicShadeParams,
  mount: MountResolution,
  warnings: Warning[],
): Assembly {
  const id = 'shade';
  const params: FusedShadeParams = { variant: 'fused', ...classic };
  const fitTest = params.fitTest === 'yes';
  const d = derive(params);
  const zOffset = classicShadeZOffset(params, d);
  const draft: Draft<'shade'> = {
    id,
    kind: 'shade',
    displayName: fitTest ? 'Fit-test ring' : 'Shade (fused)',
    params,
    colour: project.colours[id] ?? project.shades[0].colour,
    assembledTransform: [...IDENTITY],
    footprint: classicShadeFootprint(params),
    printNotes: [...(fitTest ? FIT_TEST_NOTES : FUSED_PRINT_NOTES)],
  };
  const derived = {
    ...d,
    ...ghostDerived(
      mount,
      { z: d.zFloor + zOffset, diameter: params.puckDiameter, height: params.puckHeight },
      { rBoss: d.rBoss, zTop: d.zTop + zOffset },
    ),
    bottomZ: 0,
  };
  return finish(
    project,
    [draft],
    {},
    derived,
    warnings.map((w) => located(w, id)),
  );
}

/** Which part a flat classic parameter belongs to once the lamp is split. */
function splitPartOf(key: string | undefined): 'hub' | 'shade' {
  const path = projectPath(key) ?? '';
  return path.startsWith('light.') || path.startsWith('mount.') ? 'hub' : 'shade';
}

function assembleSplit(
  project: Project,
  quality: Quality,
  classicIn: ClassicShadeParams,
  classicWarnings: readonly Warning[],
): Assembly {
  const warnings = classicWarnings.map((w) => located(w, splitPartOf(w.paramPath)));
  const hubJoint = normalizeHubJoint(projectToHubParams(project));
  warnings.push(...hubJoint.warnings.map((w) => located(w, 'hub')));
  const h = hubJoint.values;

  // The normalised light, mount and shade, in the project's structure.
  const norm = classicParamsToProject(classicIn, project);
  const shadeSpec = norm.shades[0];
  const envelope = lightEnvelope(norm.light);
  const mount = resolveMount(norm.mount);
  const joint = resolveShadeJoint(
    {
      ...project.joints,
      shadeToHub: h.shadeToHub,
      tolerance: h.jointTolerance,
      threadPitch: h.threadPitch,
      threadDepth: h.threadDepth,
    },
    { collarWall: h.collarWall },
    envelope,
    shadeSpec,
    { male: 'shade', female: 'hub' },
    project.printer.nozzle,
  );
  warnings.push(...joint.warnings);
  const { iface, collar } = joint;

  // The shade's top must clear the hub ring it hangs from.
  let classic = classicIn;
  const minTop = Math.ceil(minShadeTopDiameter(collar) - 1e-9);
  if (classic.topDiameter < minTop) {
    warnings.push({
      severity: 'warning',
      code: 'adjusted',
      partId: 'shade',
      paramPath: CLASSIC_PARAM_PATHS.topDiameter,
      message: `topDiameter raised to ${minTop} mm so the shoulder clears the hub's collar ring`,
    });
    classic = { ...classic, topDiameter: minTop };
  }

  const hubParams: HubParams = {
    insert: lightInsert(norm.light),
    envelope,
    mountFace: mount.mountFace,
    wallThickness: h.hubWallThickness,
    shoulderAngle: h.hubShoulderAngle,
    collar,
    joint: iface,
    quality,
  };
  const shadeParams: RevolvedShadeParams = {
    variant: 'revolved',
    bottomDiameter: classic.bottomDiameter,
    topDiameter: classic.topDiameter,
    height: classic.height,
    curve: classic.curve,
    wallThickness: classic.wallThickness,
    shoulderAngle: classic.shoulderAngle,
    surface: {
      style: classic.style,
      patternCount: classic.patternCount,
      ribDepth: classic.ribDepth,
      twist: classic.twist,
    },
    collar,
    joint: iface,
    quality,
  };
  const hd = deriveHub(hubParams);
  const sd = deriveRevolvedShade(shadeParams);
  const fitTest = project.fitTest;

  const drafts: AnyDraft[] = [
    {
      id: 'hub',
      kind: 'hub',
      displayName: fitTest ? 'Hub (fit test)' : 'Hub',
      params: hubParams,
      colour: project.colours.hub ?? DEFAULT_HUB_COLOUR,
      assembledTransform: [...IDENTITY],
      footprint: hubFootprint(hubParams),
      printNotes: [...HUB_PRINT_NOTES, ...(fitTest ? HUB_FIT_TEST_NOTES : [])],
    },
  ];
  if (!fitTest) {
    drafts.push({
      id: 'shade',
      kind: 'shade',
      displayName: 'Shade',
      params: shadeParams,
      colour: project.colours.shade ?? shadeSpec.colour,
      assembledTransform: translation(0, 0, -sd.zCollar),
      footprint: revolvedShadeFootprint(shadeParams),
      printNotes: [...SHADE_PRINT_NOTES, JOINT_NOTES[h.shadeToHub]],
    });
  }
  const derived = {
    ...ghostDerived(
      mount,
      { z: hd.zFloor, diameter: norm.light.diameter, height: norm.light.height },
      { rBoss: hd.rBoss, zTop: hd.zTop },
    ),
    bottomZ: fitTest ? 0 : -sd.zCollar,
    hubHeight: hd.hubHeight,
    zCollar: sd.zCollar,
    collarDiameter: iface.nominalDiameter,
  };
  return finish(project, drafts, { [iface.id]: iface }, derived, warnings);
}

export function assemble(project: Project, options: AssembleOptions = {}): Assembly {
  const quality = options.quality ?? project.quality.preview;
  const normalised = normalizeClassicShade(projectToClassicParams(project, quality));
  if (project.hub.fused) {
    const norm = classicParamsToProject(normalised.values, project);
    return assembleFused(project, normalised.values, resolveMount(norm.mount), [
      ...normalised.warnings,
    ]);
  }
  return assembleSplit(project, quality, normalised.values, normalised.warnings);
}
