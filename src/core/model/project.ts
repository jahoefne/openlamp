/**
 * The project: the one thing openlamp ever serialises (files, autosave, share
 * links, examples, the CLI). Versioned; `migrate()` upgrades old versions and
 * `ProjectSchema` (zod) validates the result.
 *
 * Version 2 (M2) splits the lamp into a hub and a shade joined by a collar
 * joint (`joints`), unless `hub.fused` keeps them one print (the classic
 * shade, still the default). Only the variants built so far are allowed: a
 * puck light, the velcro ceiling strap, one revolved outer shade.
 *
 * Version 1 had the same structure with the puck pocket's `bossWall` and
 * `pocketExtraDepth` on the hub, the shade's shoulder angle on the hub and
 * `fused` always true. Version 0 is the flat classic-shade parameter object of
 * the first app (its `?bottomDiameter=…` links and presets); it has no
 * `version` field.
 */
import { z } from 'zod';
import { QUALITIES, type Quality } from '../geometry/quality.ts';
import { SURFACE_STYLES } from '../geometry/surface.ts';
import {
  CLASSIC_SHADE_DEFAULTS,
  HUB_JOINT_DEFAULTS,
  type ClassicShadeKey,
  type ClassicShadeParams,
  type HubJointKey,
  type HubJointParams,
} from '../schema/defs.ts';
import { normalizeClassicShade } from '../schema/normalize.ts';
import { DEFAULT_PRINTER_ID, PRINTERS, findPrinter, type PrinterSpec } from '../schema/printers.ts';
import { SHADE_JOINT_TYPES, type Hex } from './assembly.ts';

export const PROJECT_VERSION = 2;

export const DEFAULT_SHADE_COLOUR: Hex = '#f4efe6';
/** The hub's colour in new and migrated projects (`colours.hub`). */
export const DEFAULT_HUB_COLOUR: Hex = '#d9d4cb';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const HexSchema = z.custom<Hex>((v) => typeof v === 'string' && HEX_RE.test(v), {
  message: 'Expected a colour like #f4efe6',
});
const Mm = z.number();
const QualitySchema = z.enum(QUALITIES);

export const PrinterSpecSchema = z.object({
  id: z.string().min(1),
  vendor: z.string(),
  name: z.string(),
  bed: z.tuple([Mm.positive(), Mm.positive(), Mm.positive()]),
  nozzle: Mm.positive(),
  multiColour: z.boolean(),
  notes: z.string().optional(),
}) satisfies z.ZodType<PrinterSpec>;

export const PuckLightSchema = z.object({
  kind: z.literal('puck'),
  preset: z.enum(['bambu-kit-001', 'custom']),
  diameter: Mm,
  height: Mm,
  clearance: Mm,
  lightHoleDiameter: Mm,
  ledgeThickness: Mm,
  cableWidth: Mm,
  /** Wall of the housing around the pocket. */
  bossWall: Mm,
  /** The pocket is this much deeper than the puck, so the strap lies flat. */
  pocketExtraDepth: Mm,
});

export const LightSchema = z.discriminatedUnion('kind', [PuckLightSchema]);

export const CeilingStrapMountSchema = z.object({
  kind: z.literal('ceilingStrap'),
  strapWidth: Mm,
  strapThickness: Mm,
  loopLength: Mm,
  loopWall: Mm,
});

export const MountSchema = z.discriminatedUnion('kind', [CeilingStrapMountSchema]);

export const HubSchema = z.object({
  /** Wall of the hub's shoulder cone (unused while fused: the shade's wall is used). */
  wallThickness: Mm,
  /** The hub's own shoulder, from its collar ring up to the light housing. */
  shoulderAngle: Mm,
  /** Wall of the shade collar and of the hub ring around it. */
  collarWall: Mm,
  /** Gap between the outer and an inner shade collar (inner shades: M2.4). */
  radialGap: Mm,
  /** Vents in the hub's cone (bulb lights, M2.3). */
  ventCount: z.number().int().nonnegative(),
  /** Hub and outer shade printed as one part (the classic shade). */
  fused: z.boolean(),
});

export const SurfaceSchema = z.object({
  style: z.enum(SURFACE_STYLES),
  patternCount: z.number(),
  ribDepth: Mm,
  twist: z.number(),
});

export const RevolvedStyleSchema = z.object({
  family: z.literal('revolved'),
  bottomDiameter: Mm,
  topDiameter: Mm,
  height: Mm,
  curve: z.number(),
  /** The shade's own shoulder, from the wall up to the collar (or the housing when fused). */
  shoulderAngle: Mm,
  surface: SurfaceSchema,
});

export const ShadeStyleSchema = z.discriminatedUnion('family', [RevolvedStyleSchema]);

export const ShadeSchema = z.object({
  id: z.string().min(1),
  role: z.literal('outer'),
  colour: HexSchema,
  wallThickness: Mm,
  /** Collar diameter; automatic (from the light) unless set, and it may only enlarge it. */
  collarDiameter: Mm.optional(),
  style: ShadeStyleSchema,
});

export const JointsSchema = z.object({
  /** How the shade hangs from the hub. */
  shadeToHub: z.enum(SHADE_JOINT_TYPES),
  /** Radial clearance of the collar joints. */
  tolerance: Mm,
  threadPitch: Mm,
  threadDepth: Mm,
  /** Screws of the mounts' screw joints. */
  screw: z.literal('M3'),
  /** Heat-set inserts (else the screws tap into plain holes). */
  heatSet: z.boolean(),
});

export const ProjectSchema = z.object({
  version: z.literal(PROJECT_VERSION),
  id: z.string().min(1),
  name: z.string(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }),
  printer: PrinterSpecSchema,
  quality: z.object({ preview: QualitySchema, export: QualitySchema }),
  light: LightSchema,
  mount: MountSchema,
  hub: HubSchema,
  /** Exactly one outer shade so far. */
  shades: z.tuple([ShadeSchema]),
  joints: JointsSchema,
  /** Colours by part id or part kind (the shade falls back to its own colour). */
  colours: z.record(z.string(), HexSchema),
  /** Export only the fit-test pieces (the housing ring when fused, else the hub). */
  fitTest: z.boolean(),
});

export type Project = z.infer<typeof ProjectSchema>;
export type LightSource = z.infer<typeof LightSchema>;
export type Mount = z.infer<typeof MountSchema>;
export type Hub = z.infer<typeof HubSchema>;
export type ShadeSpec = z.infer<typeof ShadeSchema>;
export type ShadeStyle = z.infer<typeof ShadeStyleSchema>;
export type SurfaceStyle = z.infer<typeof SurfaceSchema>;
export type Joints = z.infer<typeof JointsSchema>;

// ---------------------------------------------------------------- defaults

function copyPrinter(p: PrinterSpec): PrinterSpec {
  return { ...p, bed: [p.bed[0], p.bed[1], p.bed[2]] };
}

function defaultPrinter(): PrinterSpec {
  // The curated list always contains the default printer.
  return findPrinter(DEFAULT_PRINTER_ID) ?? copyPrinter(PRINTERS[0]!);
}

function newProjectId(): string {
  return `lamp-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
}

export interface NewProjectInit {
  id?: string;
  name?: string;
  updatedAt?: string;
}

/** The hub of a new project: fused (one print), the split hub's defaults ready. */
function defaultHub(): Hub {
  const d = HUB_JOINT_DEFAULTS;
  return {
    wallThickness: d.hubWallThickness,
    shoulderAngle: d.hubShoulderAngle,
    collarWall: d.collarWall,
    radialGap: d.radialGap,
    ventCount: d.ventCount,
    fused: true,
  };
}

function defaultJoints(): Joints {
  const d = HUB_JOINT_DEFAULTS;
  return {
    shadeToHub: d.shadeToHub,
    tolerance: d.jointTolerance,
    threadPitch: d.threadPitch,
    threadDepth: d.threadDepth,
    screw: 'M3',
    heatSet: true,
  };
}

/** A new project with today's default shade on a Bambu Lab A1. */
export function createDefaultProject(init: NewProjectInit = {}): Project {
  return classicParamsToProject({ ...CLASSIC_SHADE_DEFAULTS }, undefined, init);
}

// ---------------------------------------------------------------- classic shade bridge

/**
 * Where each flat classic-shade parameter lives in the project, as a dotted
 * path. `quality` maps to `quality.preview` (the export quality is separate).
 */
export const CLASSIC_PARAM_PATHS: Readonly<Record<ClassicShadeKey, string>> = {
  bottomDiameter: 'shades.0.style.bottomDiameter',
  topDiameter: 'shades.0.style.topDiameter',
  height: 'shades.0.style.height',
  curve: 'shades.0.style.curve',
  wallThickness: 'shades.0.wallThickness',
  shoulderAngle: 'shades.0.style.shoulderAngle',
  style: 'shades.0.style.surface.style',
  patternCount: 'shades.0.style.surface.patternCount',
  ribDepth: 'shades.0.style.surface.ribDepth',
  twist: 'shades.0.style.surface.twist',
  puckDiameter: 'light.diameter',
  puckHeight: 'light.height',
  puckClearance: 'light.clearance',
  pocketExtraDepth: 'light.pocketExtraDepth',
  lightHoleDiameter: 'light.lightHoleDiameter',
  ledgeThickness: 'light.ledgeThickness',
  bossWall: 'light.bossWall',
  cableSlotWidth: 'light.cableWidth',
  strapWidth: 'mount.strapWidth',
  strapThickness: 'mount.strapThickness',
  loopLength: 'mount.loopLength',
  loopWall: 'mount.loopWall',
  quality: 'quality.preview',
  fitTest: 'fitTest',
};

/**
 * The flat parameters the classic-shade builder takes, read from the project.
 * Not normalised: `assemble()` (or `normalizeClassicShade`) does that.
 */
export function projectToClassicParams(
  project: Project,
  quality: Quality = project.quality.preview,
): ClassicShadeParams {
  const { light, mount } = project;
  const shade = project.shades[0];
  const { style } = shade;
  return {
    bottomDiameter: style.bottomDiameter,
    topDiameter: style.topDiameter,
    height: style.height,
    curve: style.curve,
    wallThickness: shade.wallThickness,
    shoulderAngle: style.shoulderAngle,
    style: style.surface.style,
    patternCount: style.surface.patternCount,
    ribDepth: style.surface.ribDepth,
    twist: style.surface.twist,
    puckDiameter: light.diameter,
    puckHeight: light.height,
    puckClearance: light.clearance,
    pocketExtraDepth: light.pocketExtraDepth,
    lightHoleDiameter: light.lightHoleDiameter,
    ledgeThickness: light.ledgeThickness,
    bossWall: light.bossWall,
    cableSlotWidth: light.cableWidth,
    strapWidth: mount.strapWidth,
    strapThickness: mount.strapThickness,
    loopLength: mount.loopLength,
    loopWall: mount.loopWall,
    quality,
    fitTest: project.fitTest ? 'yes' : 'no',
  };
}

/**
 * A project holding these flat classic-shade parameters. Everything the flat
 * parameters do not describe (id, name, printer, colours, shade id, colour and
 * collar, the hub and the joints, export quality) comes from `base`, or from a
 * new default project. Without a base, `params.quality` is used for both
 * preview and export, as in the first app.
 */
export function classicParamsToProject(
  params: ClassicShadeParams,
  base?: Project,
  init: NewProjectInit = {},
): Project {
  const p = params;
  const baseShade = base?.shades[0];
  const printer = base ? copyPrinter(base.printer) : defaultPrinter();
  const kitPuck =
    p.puckDiameter === CLASSIC_SHADE_DEFAULTS.puckDiameter &&
    p.puckHeight === CLASSIC_SHADE_DEFAULTS.puckHeight;
  return {
    version: PROJECT_VERSION,
    id: init.id ?? base?.id ?? newProjectId(),
    name: init.name ?? base?.name ?? 'Untitled lamp',
    revision: base?.revision ?? 0,
    updatedAt: init.updatedAt ?? base?.updatedAt ?? new Date().toISOString(),
    printer,
    quality: { preview: p.quality, export: base?.quality.export ?? p.quality },
    light: {
      kind: 'puck',
      preset: kitPuck ? 'bambu-kit-001' : 'custom',
      diameter: p.puckDiameter,
      height: p.puckHeight,
      clearance: p.puckClearance,
      lightHoleDiameter: p.lightHoleDiameter,
      ledgeThickness: p.ledgeThickness,
      cableWidth: p.cableSlotWidth,
      bossWall: p.bossWall,
      pocketExtraDepth: p.pocketExtraDepth,
    },
    mount: {
      kind: 'ceilingStrap',
      strapWidth: p.strapWidth,
      strapThickness: p.strapThickness,
      loopLength: p.loopLength,
      loopWall: p.loopWall,
    },
    hub: base ? { ...base.hub } : defaultHub(),
    shades: [
      {
        id: baseShade?.id ?? 'outer',
        role: 'outer',
        colour: baseShade?.colour ?? DEFAULT_SHADE_COLOUR,
        wallThickness: p.wallThickness,
        ...(baseShade?.collarDiameter !== undefined
          ? { collarDiameter: baseShade.collarDiameter }
          : {}),
        style: {
          family: 'revolved',
          bottomDiameter: p.bottomDiameter,
          topDiameter: p.topDiameter,
          height: p.height,
          curve: p.curve,
          shoulderAngle: p.shoulderAngle,
          surface: {
            style: p.style,
            patternCount: p.patternCount,
            ribDepth: p.ribDepth,
            twist: p.twist,
          },
        },
      },
    ],
    joints: base ? { ...base.joints } : defaultJoints(),
    colours: base ? { ...base.colours } : { hub: DEFAULT_HUB_COLOUR },
    fitTest: p.fitTest === 'yes',
  };
}

// ---------------------------------------------------------------- hub & joint bridge

/** Where each flat hub / joint parameter (`HUB_JOINT_DEFS`) lives in the project. */
export const HUB_PARAM_PATHS: Readonly<Record<HubJointKey, string>> = {
  shadeToHub: 'joints.shadeToHub',
  jointTolerance: 'joints.tolerance',
  threadPitch: 'joints.threadPitch',
  threadDepth: 'joints.threadDepth',
  collarWall: 'hub.collarWall',
  radialGap: 'hub.radialGap',
  hubShoulderAngle: 'hub.shoulderAngle',
  hubWallThickness: 'hub.wallThickness',
  ventCount: 'hub.ventCount',
};

/** The flat hub / joint parameters of a project. Not normalised (see `normalizeHubJoint`). */
export function projectToHubParams(project: Project): HubJointParams {
  const { hub, joints } = project;
  return {
    shadeToHub: joints.shadeToHub,
    jointTolerance: joints.tolerance,
    threadPitch: joints.threadPitch,
    threadDepth: joints.threadDepth,
    collarWall: hub.collarWall,
    radialGap: hub.radialGap,
    hubShoulderAngle: hub.shoulderAngle,
    hubWallThickness: hub.wallThickness,
    ventCount: hub.ventCount,
  };
}

// ---------------------------------------------------------------- migrations

type RawProject = Record<string, unknown>;

function isRecord(v: unknown): v is RawProject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * v0 (flat classic-shade params, values possibly strings from a URL) → the
 * current version directly (the classic-shade bridge builds current projects).
 */
function migrateV0(raw: RawProject): RawProject {
  const { values } = normalizeClassicShade(raw);
  return classicParamsToProject(values);
}

/**
 * v1 → v2, same geometry: the puck pocket's `bossWall` and `pocketExtraDepth`
 * move from the hub to the light, the hub's shoulder angle is copied into the
 * shade's style (the hub keeps its own for the split hub), the hub gains its
 * collar, gap and vent fields (its wall, which v1 only mirrored from the
 * shade, gets the split hub's default), `joints` and `colours.hub` get their
 * defaults and a `classicShade` colour becomes the `shade` colour (the part
 * kind is gone). Whatever is missing or malformed is left for the schema to
 * reject.
 */
function migrateV1(raw: RawProject): RawProject {
  const hub = isRecord(raw.hub) ? raw.hub : {};
  const light = isRecord(raw.light)
    ? { ...raw.light, bossWall: hub.bossWall, pocketExtraDepth: hub.pocketExtraDepth }
    : raw.light;
  const shades = Array.isArray(raw.shades)
    ? raw.shades.map((shade: unknown) =>
        isRecord(shade) && isRecord(shade.style)
          ? { ...shade, style: { ...shade.style, shoulderAngle: hub.shoulderAngle } }
          : shade,
      )
    : raw.shades;
  let colours = raw.colours;
  if (isRecord(colours)) {
    const { classicShade, ...rest } = colours;
    colours = {
      hub: DEFAULT_HUB_COLOUR,
      ...(classicShade !== undefined && !('shade' in rest) ? { shade: classicShade } : {}),
      ...rest,
    };
  }
  const defaults = defaultHub();
  return {
    ...raw,
    version: 2,
    light,
    hub: {
      wallThickness: defaults.wallThickness,
      shoulderAngle: hub.shoulderAngle,
      collarWall: defaults.collarWall,
      radialGap: defaults.radialGap,
      ventCount: defaults.ventCount,
      fused: hub.fused,
    },
    shades,
    joints: defaultJoints(),
    colours,
  };
}

/** `MIGRATIONS[v]` turns a version-v project into a later version (v + 1, or the current one). */
const MIGRATIONS: Readonly<Record<number, (raw: RawProject) => RawProject>> = {
  0: migrateV0,
  1: migrateV1,
};

function versionOf(raw: RawProject): unknown {
  return 'version' in raw ? raw.version : 0;
}

/**
 * Upgrade a parsed project of any known version to the current one. Anything it
 * cannot interpret is returned unchanged for `ProjectSchema` to reject.
 */
export function migrate(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  let current = raw;
  let version = versionOf(current);
  while (typeof version === 'number' && version < PROJECT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    current = step(current);
    const next = versionOf(current);
    if (typeof next !== 'number' || next <= version) {
      throw new Error(`Migration from project version ${version} did not advance the version`);
    }
    version = next;
  }
  return current;
}

// ---------------------------------------------------------------- (de)serialisation

/** Migrate and validate an already JSON-parsed project. Throws a ZodError if invalid. */
export function loadProject(raw: unknown): Project {
  return ProjectSchema.parse(migrate(raw));
}

/** JSON.parse → migrate → validate. Throws SyntaxError or ZodError. */
export function parseProject(text: string): Project {
  return loadProject(JSON.parse(text));
}

/**
 * Stable JSON for a project: keys in schema order (colour overrides sorted),
 * 2-space indent, short arrays of numbers on one line (as Prettier formats
 * JSON), trailing newline. Validates the project first.
 */
export function serializeProject(project: Project): string {
  const clean = ProjectSchema.parse(project);
  clean.colours = Object.fromEntries(
    Object.entries(clean.colours).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return `${formatJson(clean, '')}\n`;
}

function formatJson(value: unknown, indent: string): string {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object')) {
      const line = `[${value.map((v) => JSON.stringify(v ?? null)).join(', ')}]`;
      if (indent.length + line.length <= 60) return line;
    }
    return `[\n${value.map((v) => inner + formatJson(v, inner)).join(',\n')}\n${indent}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const body = entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatJson(v, inner)}`);
    return `{\n${body.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
