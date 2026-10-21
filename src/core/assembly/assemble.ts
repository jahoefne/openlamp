/**
 * project → Assembly: the printable parts with their resolved parameters,
 * cache keys, transforms and bed footprints, the joints between them, plus
 * every warning. Pure, no WASM: it runs on the main thread for every edit.
 *
 * - `hub.fused` with the velcro strap and a puck (the default): one `shade`
 *   part, the classic shade's builder unchanged (hub and shade as one print),
 *   identity transforms. Every other mount or light ignores `fused`.
 * - split: a `hub` and a revolved `shade` hanging from it on one shade joint
 *   (`joints.shadeToHub`, copied into both parts' params), plus whatever the
 *   mount adds. The mount is one `MountModule` (mounts/), which says what the
 *   hub carries on its mount face, adds its own parts and joints and places
 *   everything in the world. Fit-test mode keeps just the hub (the joint test
 *   pair comes in M2.5).
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
  type JointInterface,
  type Mat4,
  type MountContext,
  type PartDraft,
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
  mountFromParams,
  mountToParams,
  projectToClassicParams,
  projectToHubParams,
  type Joints,
  type MountOf,
  type Project,
} from '../model/project.ts';
import type {
  ClassicShadeKey,
  ClassicShadeParams,
  HubJointKey,
  MountKind,
} from '../schema/defs.ts';
import {
  normalizeClassicShade,
  normalizeHubJoint,
  normalizeMountParams,
} from '../schema/normalize.ts';
import { minShadeTopDiameter, resolveShadeJoint } from './interfaces.ts';
import { layoutParts, placementTransform } from './layout.ts';
import {
  lightBottomZ,
  lightDerived,
  lightEnvelope,
  lightInsert,
  lightPrintNotes,
  normalizeLight,
  validateLight,
} from './lights/index.ts';
import { STRAP_CEILING_GAP, strapDerived } from './mounts/ceilingStrap.ts';
import { mountModule } from './mounts/index.ts';
import type { MountCtx, MountHubCtx, MountParts } from './mounts/types.ts';
import { translation } from './transforms.ts';
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

/** The hub's print notes about a puck: how it goes in, and the mount face. */
function hubPrintNotes(face: HubParams['mountFace']['kind']): string[] {
  switch (face) {
    case 'strap':
      return HUB_PRINT_NOTES;
    case 'cordBoss':
      return [
        ...HUB_PRINT_NOTES,
        'Feed the cord down through the boss, pull it out through the light opening, tie a knot and pull it back up into the knot cavity; then press the puck in from below until it stops (crush ribs hold it).',
      ];
    case 'threadMale':
    case 'threadFemale':
      return [
        ...HUB_PRINT_NOTES,
        'Press the puck in from below until it stops (crush ribs hold it); its cable runs up through the bore in the mount face.',
      ];
  }
}

const HUB_FIT_TEST_NOTES = [
  'Fit test: drop the puck into the hub and thread the strap before printing the shade.',
];

const CLOSED_HUB_FIT_TEST_NOTES = [
  'Fit test: press the puck into the hub and try the mount before printing the shade.',
];

const LIGHT_HUB_FIT_TEST_NOTES = [
  'Fit test: fit the light (lampholder or strip) and try the mount before printing the shade.',
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

/** A part with its place in the assembled lamp. */
interface Placed {
  draft: PartDraft;
  /** Print frame → world. */
  assembledTransform: Mat4;
}

/** Cache keys, bed layout, bed-fit and layout warnings: what every assembly does with its parts. */
function finish(
  project: Project,
  placed: readonly Placed[],
  interfaces: Record<string, JointInterface>,
  derived: Record<string, number>,
  context: MountContext,
  warnings: Warning[],
): Assembly {
  const layout = layoutParts(
    placed.map(({ draft: d }) => ({ id: d.id, x: d.footprint.x, y: d.footprint.y })),
    project.printer.bed,
  );
  const parts = placed.map(({ draft: d, assembledTransform }): PartSpec => {
    const buildKey = canonicalJson({ kind: d.kind, params: d.params });
    const placement = layout.placements.find((p) => p.id === d.id);
    const common = {
      id: d.id,
      displayName: d.displayName,
      buildKey,
      hash: cyrb53(buildKey),
      colour: d.colour,
      instances: d.instances ?? 1,
      assembledTransform,
      printTransform: placement ? placementTransform(placement) : [...IDENTITY],
      bedFootprint: d.footprint,
      printNotes: d.printNotes,
      warnings: [],
    };
    // `kind` and `params` come from one draft, so they match (TS cannot see
    // that through the union).
    return { ...common, kind: d.kind, params: d.params } as PartSpec;
  });
  const bedFit = validateBedFit(parts, project.printer);
  warnings.push(...bedFit);
  warnings.push(...validateLayout(layout, new Set(bedFit.map((w) => w.partId ?? ''))));
  for (const p of parts) p.warnings = warnings.filter((w) => w.partId === p.id);
  return { parts, interfaces, layout, derived, context, warnings };
}

function assembleFused(
  project: Project,
  classic: ClassicShadeParams,
  warnings: Warning[],
): Assembly {
  const id = 'shade';
  const params: FusedShadeParams = { variant: 'fused', ...classic };
  const fitTest = params.fitTest === 'yes';
  const d = derive(params);
  const zOffset = classicShadeZOffset(params, d);
  const draft: PartDraft = {
    id,
    kind: 'shade',
    displayName: fitTest ? 'Fit-test ring' : 'Shade (fused)',
    params,
    colour: project.colours[id] ?? project.shades[0].colour,
    footprint: classicShadeFootprint(params),
    printNotes: [...(fitTest ? FIT_TEST_NOTES : FUSED_PRINT_NOTES)],
  };
  // The classic shade's housing top is its mount face (the strap's tunnels).
  const zFace = d.zTop + zOffset;
  const strap = { kind: 'ceilingStrap' as const, ...pickStrap(classic) };
  const derived = {
    ...d,
    ...strapDerived(strap, zFace),
    puckZ: d.zFloor + zOffset,
    puckDiameter: params.puckDiameter,
    puckHeight: params.puckHeight,
    rBoss: d.rBoss,
    bottomZ: 0,
  };
  return finish(
    project,
    [{ draft, assembledTransform: [...IDENTITY] }],
    {},
    derived,
    { kind: 'ceiling', ceilingZ: zFace + STRAP_CEILING_GAP },
    warnings.map((w) => located(w, id)),
  );
}

function pickStrap(c: ClassicShadeParams) {
  const { strapWidth, strapThickness, loopLength, loopWall } = c;
  return { strapWidth, strapThickness, loopLength, loopWall };
}

/** Which part a flat classic parameter belongs to once the lamp is split. */
function splitPartOf(key: string | undefined): 'hub' | 'shade' {
  const path = projectPath(key) ?? '';
  return path.startsWith('light.') || path.startsWith('mount.') ? 'hub' : 'shade';
}

/** What the split assembly has resolved before the mount comes in. */
interface SplitBase {
  project: Project;
  quality: Quality;
  /** The normalised light, mount and shade, in the project's structure. */
  norm: Project;
  joints: Joints;
  hub: { wallThickness: number; shoulderAngle: number; collarWall: number; ventCount: number };
  warnings: Warning[];
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
  const norm = classicParamsToProject(classicIn, project);
  const base: SplitBase = {
    project,
    quality,
    norm,
    joints: {
      ...project.joints,
      shadeToHub: h.shadeToHub,
      tolerance: h.jointTolerance,
      threadPitch: h.threadPitch,
      threadDepth: h.threadDepth,
    },
    hub: {
      wallThickness: h.hubWallThickness,
      shoulderAngle: h.hubShoulderAngle,
      collarWall: h.collarWall,
      ventCount: h.ventCount,
    },
    warnings,
  };
  return assembleMounted(norm.mount.kind, norm.mount, classicIn, base);
}

/** The mount's parameters clamped to their definitions and its own rules. */
function normalizeMount<K extends MountKind>(
  kind: K,
  mount: MountOf<K>,
): { mount: MountOf<K>; warnings: Warning[] } {
  const warnings: Warning[] = [];
  let out = mount;
  // The strap was normalised with the classic shade's parameters.
  if (kind !== 'ceilingStrap') {
    const clamped = normalizeMountParams(kind, mountToParams<K>(mount));
    warnings.push(...clamped.warnings);
    out = mountFromParams(kind, clamped.values);
  }
  const rules = mountModule(kind).normalize?.(out);
  if (rules) {
    warnings.push(...rules.warnings);
    out = rules.mount;
  }
  return { mount: out, warnings };
}

function assembleMounted<K extends MountKind>(
  kind: K,
  mountIn: MountOf<K>,
  classicIn: ClassicShadeParams,
  base: SplitBase,
): Assembly {
  const { project, quality, norm, joints, warnings } = base;
  const module = mountModule(kind);
  const normMount = normalizeMount(kind, mountIn);
  warnings.push(...normMount.warnings);
  const shadeSpec = norm.shades[0];
  // The light: a puck was normalised with the classic shade; a bulb or a strip here.
  const lightHub = { ...base.hub, mount: kind };
  const normLight = normalizeLight(norm.light, lightHub);
  warnings.push(...normLight.warnings.map((w) => ({ ...w, partId: 'hub' })));
  const light = normLight.light;
  const envelope = lightEnvelope(light, lightHub);
  const ctx: MountCtx<K> = {
    mount: normMount.mount,
    light,
    envelope,
    joints,
    printer: project.printer,
    colours: project.colours,
    quality,
  };
  warnings.push(...module.validate(ctx));
  const mountFace = module.hubFace(ctx);

  const joint = resolveShadeJoint(
    joints,
    { collarWall: base.hub.collarWall },
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
    insert: lightInsert(light, lightHub),
    envelope,
    mountFace,
    wallThickness: base.hub.wallThickness,
    shoulderAngle: base.hub.shoulderAngle,
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
  warnings.push(...validateLight(light, mountFace, envelope));

  const hubCtx: MountHubCtx<K> = {
    ...ctx,
    hub: { params: hubParams, derived: hd },
    shades: fitTest ? [] : [{ id: 'shade', zCollar: sd.zCollar }],
    fitTest,
  };
  const mountParts: MountParts = fitTest ? { parts: [], interfaces: [] } : module.parts(hubCtx);
  warnings.push(...(mountParts.warnings ?? []));
  const placement = module.placement(hubCtx, mountParts);

  const placed: Placed[] = [
    {
      draft: {
        id: 'hub',
        kind: 'hub',
        displayName: fitTest ? 'Hub (fit test)' : 'Hub',
        params: hubParams,
        colour: project.colours.hub ?? DEFAULT_HUB_COLOUR,
        footprint: hubFootprint(hubParams),
        printNotes: [
          ...(light.kind === 'puck'
            ? hubPrintNotes(mountFace.kind)
            : [...HUB_PRINT_NOTES, ...lightPrintNotes(light, mountFace, hd)]),
          ...(fitTest
            ? light.kind !== 'puck'
              ? LIGHT_HUB_FIT_TEST_NOTES
              : mountFace.kind === 'strap'
                ? HUB_FIT_TEST_NOTES
                : CLOSED_HUB_FIT_TEST_NOTES
            : []),
        ],
      },
      assembledTransform: placement.hubTransform,
    },
  ];
  if (!fitTest) {
    placed.push({
      draft: {
        id: 'shade',
        kind: 'shade',
        displayName: 'Shade',
        params: shadeParams,
        colour: project.colours.shade ?? shadeSpec.colour,
        footprint: revolvedShadeFootprint(shadeParams),
        printNotes: [...SHADE_PRINT_NOTES, JOINT_NOTES[joints.shadeToHub]],
      },
      assembledTransform: placement.shadeTransforms.shade ?? translation(0, 0, -sd.zCollar),
    });
    for (const draft of mountParts.parts) {
      placed.push({
        draft,
        assembledTransform: placement.partTransforms[draft.id] ?? [...IDENTITY],
      });
    }
  }
  const derived: Record<string, number> = {
    ...lightDerived(light, hd, placement.hubTransform, envelope),
    rBoss: hd.rBoss,
    ...placement.derived,
    // A bulb may hang below the shade: the lamp's lowest point includes it.
    bottomZ: Math.min(
      placement.bottomZ,
      lightBottomZ(light, placement.hubTransform) ?? placement.bottomZ,
    ),
    hubHeight: hd.hubHeight,
    zCollar: sd.zCollar,
    collarDiameter: iface.nominalDiameter,
  };
  // The ghost puck is the puck's (a standing lamp's placement places it too).
  if (light.kind !== 'puck') {
    delete derived.puckZ;
    delete derived.puckDiameter;
    delete derived.puckHeight;
  }
  const interfaces: Record<string, JointInterface> = { [iface.id]: iface };
  for (const j of mountParts.interfaces) interfaces[j.id] = j;
  return finish(project, placed, interfaces, derived, placement.context, warnings);
}

export function assemble(project: Project, options: AssembleOptions = {}): Assembly {
  const quality = options.quality ?? project.quality.preview;
  const puck = project.light.kind === 'puck';
  const normalised = normalizeClassicShade(projectToClassicParams(project, quality), { puck });
  // Only the strap with a puck has a single-piece print (the classic shade's tunnels).
  if (project.hub.fused && project.mount.kind === 'ceilingStrap' && puck) {
    return assembleFused(project, normalised.values, [...normalised.warnings]);
  }
  return assembleSplit(project, quality, normalised.values, normalised.warnings);
}
