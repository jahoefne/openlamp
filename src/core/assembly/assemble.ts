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
 *   everything in the world.
 * - fit-test mode (`project.fitTest`): the fused print keeps just its puck
 *   housing ring; a split lamp exports the joint's test pair instead of its
 *   parts, a section of the shade collar (`fitMale`) and one of the hub ring
 *   (`fitFemale`), built from the same `shadeToHub` joint (see fitPair.ts).
 * - an inner shade (`shades[1]`) adds the part `innerShade`, hanging from a
 *   second hub ring inside the outer one on its own joint (`innerShadeToHub`);
 *   the outer collar moves out by the radial gap (see `resolveShadeJoints`).
 *   It needs the split lamp: with the fused print it is an error (and not built).
 * - every shade is one `ShadeModule` of its style's family (shades/): it
 *   normalises its style, is widened to clear its hub ring, checks itself and
 *   returns its parts (one, or several: a tiered shade's tiers and spacers,
 *   one spacer part per gap with a copy per socket), each with its transform
 *   (and its copies' transforms) into the shade frame (the hub's); the mount's
 *   placement gives every part and copy of a shade the shade's transform. Only a
 *   revolved outer shade is fused with the hub; any other family splits the
 *   lamp (as every mount but the strap does).
 */
import { canonicalJson, cyrb53 } from '../hash.ts';
import {
  classicShadeFootprint,
  classicShadeZOffset,
  derive,
} from '../geometry/parts/classicShade.ts';
import { FIT_BASE, FIT_GRIP, FIT_SECTION, fitPieceFootprint } from '../geometry/parts/fitPair.ts';
import { deriveHub, hubFootprint } from '../geometry/parts/hub.ts';
import type { Quality } from '../geometry/quality.ts';
import {
  IDENTITY,
  type Assembly,
  type Hex,
  type JointInterface,
  type Mat4,
  type MountContext,
  type PartDraft,
  type PartSpec,
  type ShadeJointType,
  type Warning,
} from '../model/assembly.ts';
import type { CollarDims, FitPieceParams, FusedShadeParams, HubParams } from '../model/parts.ts';
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
  type LightSource,
  type MountOf,
  type Project,
  type ShadeRole,
  type ShadeSpec,
} from '../model/project.ts';
import {
  FLAT_SHADE_KEYS,
  type ClassicShadeKey,
  type ClassicShadeParams,
  type HubJointKey,
  type MountKind,
} from '../schema/defs.ts';
import {
  normalizeClassicShade,
  normalizeHubJoint,
  normalizeMountParams,
} from '../schema/normalize.ts';
import {
  minShadeTopDiameter,
  resolveShadeJoints,
  type ShadeJointResolution,
} from './interfaces.ts';
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
import type { MountCtx, MountHubCtx, MountShade } from './mounts/types.ts';
import { SHADE_PART_IDS, resolveShade, type ResolvedShade } from './shades/index.ts';
import type { ShadeCtx } from './shades/types.ts';
import { translation } from './transforms.ts';
import { validateBedFit, validateInnerShade, validateLayout } from './validate.ts';

/** The part id of the outer shade (its collar part; the fused print has it too). */
export const OUTER_SHADE_ID = SHADE_PART_IDS.outer;
/** The part id of the inner shade (its collar part). */
export const INNER_SHADE_ID = SHADE_PART_IDS.inner;

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

/** Part ids of the fit-test pair. */
export const FIT_MALE_ID = 'fitMale';
export const FIT_FEMALE_ID = 'fitFemale';

const FIT_PAIR_NOTE =
  'Fit test: print both test pieces and join them as the shade joins the hub, before printing the lamp.';

const FIT_JOIN_NOTES: Readonly<Record<ShadeJointType, string>> = {
  bayonet:
    'Push the ring piece onto the collar piece with the lugs in its slots and twist it until it stops (the shade locks into the hub the same way).',
  snap: 'Press the ring piece onto the collar piece all the way; the crush ribs should hold it firmly without forcing it.',
  thread:
    'Screw the ring piece onto the collar piece until it sits on the base disc (the shade screws into the hub the same way).',
};

/** How to act on the fit: the joint clearance it was printed with. */
function fitAdjustNote(tolerance: number): string {
  const mm = Math.round(tolerance * 100) / 100;
  return `Too tight: raise the joint clearance (Hub & joints, now ${mm} mm); too loose: lower it. Then print the pair again.`;
}

const OUTER_AFTER_INNER_NOTE = 'Hang the inner shade first, then this (outer) shade.';
const INNER_FIRST_NOTE =
  'Hang this inner shade from the inner collar ring first, then the outer shade around it.';

/** An inner shade with the single-piece print: there is no hub to hang it from. */
const INNER_FUSED_ERROR: Warning = {
  severity: 'error',
  code: 'inner-shade-fused',
  paramPath: 'hub.fused',
  message:
    'An inner shade needs a separate hub: turn off the single-piece print (fused) to print the hub and both shades.',
};

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
  /** Print frame → world of each copy, if the part has several (default: all at `assembledTransform`). */
  instanceTransforms?: Mat4[] | undefined;
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
    placed.map(({ draft: d }) => ({
      id: d.id,
      x: d.footprint.x,
      y: d.footprint.y,
      instances: d.instances ?? 1,
    })),
    project.printer.bed,
  );
  const parts = placed.map(({ draft: d, assembledTransform, instanceTransforms }): PartSpec => {
    const buildKey = canonicalJson({ kind: d.kind, params: d.params });
    const placement = layout.placements.find((p) => p.id === d.id);
    const instances = d.instances ?? 1;
    const common = {
      id: d.id,
      displayName: d.displayName,
      buildKey,
      hash: cyrb53(buildKey),
      colour: d.colour,
      instances,
      assembledTransform,
      instanceTransforms:
        instanceTransforms ?? Array.from({ length: instances }, () => [...assembledTransform]),
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
  /** The normalised light, mount and outer shade (the inner one as given), in the project's structure. */
  norm: Project;
  joints: Joints;
  hub: { wallThickness: number; shoulderAngle: number; collarWall: number; ventCount: number };
  /** Air between the outer and an inner shade's collar rings, as clamped. */
  radialGap: number;
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
    radialGap: h.radialGap,
    warnings,
  };
  return assembleMounted(norm.mount.kind, norm.mount, base);
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

/**
 * Fit-test mode of a split lamp: the joint's test pair instead of the lamp's
 * parts, built from the outer shade's collar and joint (`shadeToHub`, its ids
 * relabelled to the pair). Assembled as the shade hangs from the hub: the ring
 * piece (`fitFemale`) at the hub's place with its mouth on the collar plane
 * (z 0), the collar piece (`fitMale`) below it, standing on the floor.
 */
function assembleFitPair(
  project: Project,
  shadeJoint: JointInterface,
  collar: CollarDims,
  quality: Quality,
  colours: { shadeColour: Hex; hubColour: Hex },
  warnings: Warning[],
): Assembly {
  const joint: JointInterface = { ...shadeJoint, male: FIT_MALE_ID, female: FIT_FEMALE_ID };
  const params: FitPieceParams = {
    collar,
    joint,
    height: FIT_SECTION,
    base: FIT_BASE,
    baseRadius: collar.seatRadius + FIT_GRIP,
    quality,
  };
  const type = joint.type as ShadeJointType;
  const common = [FIT_PAIR_NOTE, FIT_JOIN_NOTES[type], fitAdjustNote(joint.tolerance)];
  const placed: Placed[] = [
    {
      draft: {
        id: FIT_MALE_ID,
        kind: 'fitMale',
        displayName: 'Collar test piece',
        params,
        colour: colours.shadeColour,
        footprint: fitPieceFootprint(params),
        printNotes: [
          'Print as exported: base disc on the bed, collar up (as the shade prints). No supports needed.',
          ...common,
        ],
      },
      assembledTransform: translation(0, 0, -FIT_BASE),
    },
    {
      draft: {
        id: FIT_FEMALE_ID,
        kind: 'fitFemale',
        displayName: 'Ring test piece',
        params,
        colour: colours.hubColour,
        footprint: fitPieceFootprint(params),
        printNotes: [
          'Print as exported: ring base on the bed, mouth down (as the hub prints). No supports needed.',
          ...common,
        ],
      },
      assembledTransform: [...IDENTITY],
    },
  ];
  const derived = {
    bottomZ: -FIT_BASE,
    collarDiameter: joint.nominalDiameter,
    fitBase: FIT_BASE,
    fitHeight: FIT_BASE + FIT_SECTION,
  };
  return finish(
    project,
    placed,
    { [joint.id]: joint },
    derived,
    { kind: 'floor', floorZ: -FIT_BASE },
    warnings,
  );
}

/** What every shade of the lamp shares, for its `ShadeCtx`. */
interface ShadeShared {
  project: Project;
  light: LightSource;
  envelope: ShadeCtx['envelope'];
  joints: Joints;
  quality: Quality;
}

/** A shade through its family's module, on its collar joint. */
function resolveShadeOf(
  role: ShadeRole,
  spec: ShadeSpec,
  joint: ShadeJointResolution,
  shared: ShadeShared,
): ResolvedShade {
  const id = SHADE_PART_IDS[role];
  const { project } = shared;
  return resolveShade({
    role,
    id,
    style: spec.style,
    wallThickness: spec.wallThickness,
    colour: project.colours[id] ?? spec.colour,
    colours: project.colours,
    collar: joint.collar,
    joint: joint.iface,
    minTopDiameter: Math.ceil(minShadeTopDiameter(joint.collar) - 1e-9),
    light: shared.light,
    envelope: shared.envelope,
    joints: shared.joints,
    printer: project.printer,
    quality: shared.quality,
  });
}

/** A resolved shade as the mount's placement sees it. */
function mountShade(shade: ResolvedShade): MountShade {
  return {
    id: shade.id,
    zCollar: shade.parts.zCollar,
    zBottom: shade.parts.zBottom,
    parts: shade.parts.parts.map((p) => ({
      id: p.draft.id,
      transform: p.transform,
      ...(p.instanceTransforms ? { instanceTransforms: p.instanceTransforms } : {}),
    })),
  };
}

function assembleMounted<K extends MountKind>(
  kind: K,
  mountIn: MountOf<K>,
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

  const innerSpec = norm.shades[1];
  const shadeJoints = resolveShadeJoints(
    joints,
    { collarWall: base.hub.collarWall, radialGap: base.radialGap },
    envelope,
    { outer: shadeSpec, inner: innerSpec },
    { outer: OUTER_SHADE_ID, inner: INNER_SHADE_ID, female: 'hub' },
    project.printer.nozzle,
  );
  warnings.push(...shadeJoints.warnings);
  const { iface, collar } = shadeJoints.outer;
  const innerJoint = shadeJoints.inner;

  // Every shade through its family's module: normalised, its top widened to
  // clear the hub ring it hangs from, checked, its parts.
  const shared: ShadeShared = { project, light, envelope, joints, quality };
  const outer = resolveShadeOf('outer', shadeSpec, shadeJoints.outer, shared);
  warnings.push(...outer.warnings);
  const inner =
    innerSpec && innerJoint ? resolveShadeOf('inner', innerSpec, innerJoint, shared) : undefined;
  if (inner) warnings.push(...inner.warnings);

  const hubParams: HubParams = {
    insert: lightInsert(light, lightHub),
    envelope,
    mountFace,
    wallThickness: base.hub.wallThickness,
    shoulderAngle: base.hub.shoulderAngle,
    collar,
    joint: iface,
    ...(innerJoint ? { innerCollar: innerJoint.collar, innerJoint: innerJoint.iface } : {}),
    quality,
  };
  const hd = deriveHub(hubParams);
  warnings.push(...validateLight(light, mountFace, envelope));
  if (inner) {
    const check = (r: ResolvedShade) => ({
      family: r.family,
      depth: -r.parts.zBottom,
      profile: r.profile,
    });
    warnings.push(
      ...validateInnerShade(check(outer), check(inner), hubParams, {
        outer: OUTER_SHADE_ID,
        inner: INNER_SHADE_ID,
        hub: 'hub',
      }),
    );
  }
  if (project.fitTest) {
    const shadeColour = project.colours.shade ?? shadeSpec.colour;
    const hubColour = project.colours.hub ?? DEFAULT_HUB_COLOUR;
    return assembleFitPair(project, iface, collar, quality, { shadeColour, hubColour }, warnings);
  }

  const shades = inner ? [outer, inner] : [outer];
  const hubCtx: MountHubCtx<K> = {
    ...ctx,
    hub: { params: hubParams, derived: hd },
    shades: shades.map(mountShade),
  };
  const mountParts = module.parts(hubCtx);
  warnings.push(...(mountParts.warnings ?? []));
  const placement = module.placement(hubCtx, mountParts);

  const placed: Placed[] = [
    {
      draft: {
        id: 'hub',
        kind: 'hub',
        displayName: 'Hub',
        params: hubParams,
        colour: project.colours.hub ?? DEFAULT_HUB_COLOUR,
        footprint: hubFootprint(hubParams),
        printNotes:
          light.kind === 'puck'
            ? hubPrintNotes(mountFace.kind)
            : [...HUB_PRINT_NOTES, ...lightPrintNotes(light, mountFace, hd)],
      },
      assembledTransform: placement.hubTransform,
    },
  ];
  for (const shade of shades) {
    // The collar part says how the shade joins the hub (and which shade goes first).
    const order =
      shade.role === 'inner' ? [INNER_FIRST_NOTE] : inner ? [OUTER_AFTER_INNER_NOTE] : [];
    shade.parts.parts.forEach(({ draft, transform }, i) => {
      placed.push({
        draft:
          i === 0
            ? {
                ...draft,
                printNotes: [...draft.printNotes, JOINT_NOTES[joints.shadeToHub], ...order],
              }
            : draft,
        assembledTransform: placement.shadeTransforms[draft.id] ?? transform,
        // Every copy of a part with copies (`ShadePart.instanceTransforms`), with the
        // shade's transform composed onto each by the mount (`shadeInstanceTransforms`).
        instanceTransforms: placement.instanceTransforms?.[draft.id],
      });
    });
  }
  for (const draft of mountParts.parts) {
    placed.push({
      draft,
      assembledTransform: placement.partTransforms[draft.id] ?? [...IDENTITY],
      instanceTransforms: placement.instanceTransforms?.[draft.id],
    });
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
    zCollar: outer.parts.zCollar,
    collarDiameter: iface.nominalDiameter,
    ...(innerJoint && inner
      ? { innerZCollar: inner.parts.zCollar, innerCollarDiameter: innerJoint.iface.nominalDiameter }
      : {}),
  };
  // The ghost puck is the puck's (a standing lamp's placement places it too).
  if (light.kind !== 'puck') {
    delete derived.puckZ;
    delete derived.puckDiameter;
    delete derived.puckHeight;
  }
  const interfaces: Record<string, JointInterface> = { [iface.id]: iface };
  if (innerJoint) interfaces[innerJoint.iface.id] = innerJoint.iface;
  for (const shade of shades) for (const j of shade.parts.interfaces) interfaces[j.id] = j;
  for (const j of mountParts.interfaces) interfaces[j.id] = j;
  return finish(project, placed, interfaces, derived, placement.context, warnings);
}

/** The classic shade's keys that describe the outer shade itself (its shape and surface). */
const CLASSIC_SHADE_KEYS: ReadonlySet<string> = new Set(FLAT_SHADE_KEYS);

export function assemble(project: Project, options: AssembleOptions = {}): Assembly {
  const quality = options.quality ?? project.quality.preview;
  const puck = project.light.kind === 'puck';
  const revolved = project.shades[0].style.family === 'revolved';
  const normalised = normalizeClassicShade(projectToClassicParams(project, quality), { puck });
  // Only the strap with a puck and a revolved shade has a single-piece print
  // (the classic shade, with its tunnels); anything else splits silently.
  if (project.hub.fused && project.mount.kind === 'ceilingStrap' && puck && revolved) {
    const warnings = [...normalised.warnings];
    if (project.shades[1]) warnings.push({ ...INNER_FUSED_ERROR });
    return assembleFused(project, normalised.values, warnings);
  }
  // Another family's outer shade is not the classic shade's: its rules do not apply to it.
  const classicWarnings = revolved
    ? normalised.warnings
    : normalised.warnings.filter((w) => !CLASSIC_SHADE_KEYS.has(w.paramPath ?? ''));
  return assembleSplit(project, quality, normalised.values, classicWarnings);
}
