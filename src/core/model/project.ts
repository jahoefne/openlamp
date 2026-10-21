/**
 * The project: the one thing openlamp ever serialises (files, autosave, share
 * links, examples, the CLI). Versioned; `migrate()` upgrades old versions and
 * `ProjectSchema` (zod) validates the result.
 *
 * Version 1 already has the light / mount / hub / shades structure of the full
 * lamp, but only the variants M1 can build: a puck light, the velcro ceiling
 * strap, one revolved outer shade fused to its hub (the classic shade).
 *
 * Version 0 is the flat classic-shade parameter object of the first app (its
 * `?bottomDiameter=…` links and presets); it has no `version` field.
 */
import { z } from 'zod';
import { QUALITIES, type Quality } from '../geometry/quality.ts';
import { SURFACE_STYLES } from '../geometry/surface.ts';
import {
  CLASSIC_SHADE_DEFAULTS,
  type ClassicShadeKey,
  type ClassicShadeParams,
} from '../schema/defs.ts';
import { normalizeClassicShade } from '../schema/normalize.ts';
import { DEFAULT_PRINTER_ID, PRINTERS, findPrinter, type PrinterSpec } from '../schema/printers.ts';
import type { Hex } from './assembly.ts';

export const PROJECT_VERSION = 1;

export const DEFAULT_SHADE_COLOUR: Hex = '#f4efe6';

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
  /** Wall of the hub. Unused while the hub is fused to the shade (the shade's wall is used). */
  wallThickness: Mm,
  shoulderAngle: Mm,
  bossWall: Mm,
  pocketExtraDepth: Mm,
  /** Hub and outer shade printed as one part (the classic shade). Always true in v1. */
  fused: z.literal(true),
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
  surface: SurfaceSchema,
});

export const ShadeStyleSchema = z.discriminatedUnion('family', [RevolvedStyleSchema]);

export const ShadeSchema = z.object({
  id: z.string().min(1),
  role: z.literal('outer'),
  colour: HexSchema,
  wallThickness: Mm,
  style: ShadeStyleSchema,
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
  /** Exactly one outer shade in v1. */
  shades: z.tuple([ShadeSchema]),
  /** Colour overrides by part id or part kind. */
  colours: z.record(z.string(), HexSchema),
  /** Export only the puck housing ring to test the fit. */
  fitTest: z.boolean(),
});

export type Project = z.infer<typeof ProjectSchema>;
export type LightSource = z.infer<typeof LightSchema>;
export type Mount = z.infer<typeof MountSchema>;
export type Hub = z.infer<typeof HubSchema>;
export type ShadeSpec = z.infer<typeof ShadeSchema>;
export type ShadeStyle = z.infer<typeof ShadeStyleSchema>;
export type SurfaceStyle = z.infer<typeof SurfaceSchema>;

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
  shoulderAngle: 'hub.shoulderAngle',
  style: 'shades.0.style.surface.style',
  patternCount: 'shades.0.style.surface.patternCount',
  ribDepth: 'shades.0.style.surface.ribDepth',
  twist: 'shades.0.style.surface.twist',
  puckDiameter: 'light.diameter',
  puckHeight: 'light.height',
  puckClearance: 'light.clearance',
  pocketExtraDepth: 'hub.pocketExtraDepth',
  lightHoleDiameter: 'light.lightHoleDiameter',
  ledgeThickness: 'light.ledgeThickness',
  bossWall: 'hub.bossWall',
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
  const { light, mount, hub } = project;
  const shade = project.shades[0];
  const { style } = shade;
  return {
    bottomDiameter: style.bottomDiameter,
    topDiameter: style.topDiameter,
    height: style.height,
    curve: style.curve,
    wallThickness: shade.wallThickness,
    shoulderAngle: hub.shoulderAngle,
    style: style.surface.style,
    patternCount: style.surface.patternCount,
    ribDepth: style.surface.ribDepth,
    twist: style.surface.twist,
    puckDiameter: light.diameter,
    puckHeight: light.height,
    puckClearance: light.clearance,
    pocketExtraDepth: hub.pocketExtraDepth,
    lightHoleDiameter: light.lightHoleDiameter,
    ledgeThickness: light.ledgeThickness,
    bossWall: hub.bossWall,
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
 * parameters do not describe (id, name, printer, colours, shade id and colour,
 * export quality) comes from `base`, or from a new default project. Without a
 * base, `params.quality` is used for both preview and export, as in the first
 * app.
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
    },
    mount: {
      kind: 'ceilingStrap',
      strapWidth: p.strapWidth,
      strapThickness: p.strapThickness,
      loopLength: p.loopLength,
      loopWall: p.loopWall,
    },
    hub: {
      wallThickness: p.wallThickness,
      shoulderAngle: p.shoulderAngle,
      bossWall: p.bossWall,
      pocketExtraDepth: p.pocketExtraDepth,
      fused: true,
    },
    shades: [
      {
        id: baseShade?.id ?? 'outer',
        role: 'outer',
        colour: baseShade?.colour ?? DEFAULT_SHADE_COLOUR,
        wallThickness: p.wallThickness,
        style: {
          family: 'revolved',
          bottomDiameter: p.bottomDiameter,
          topDiameter: p.topDiameter,
          height: p.height,
          curve: p.curve,
          surface: {
            style: p.style,
            patternCount: p.patternCount,
            ribDepth: p.ribDepth,
            twist: p.twist,
          },
        },
      },
    ],
    colours: { ...base?.colours },
    fitTest: p.fitTest === 'yes',
  };
}

// ---------------------------------------------------------------- migrations

type RawProject = Record<string, unknown>;

/** v0 (flat classic-shade params, values possibly strings from a URL) → v1. */
function migrateV0(raw: RawProject): RawProject {
  const { values } = normalizeClassicShade(raw);
  return classicParamsToProject(values);
}

/** `MIGRATIONS[v]` turns a version-v project into a version-(v+1) one. */
const MIGRATIONS: Readonly<Record<number, (raw: RawProject) => RawProject>> = {
  0: migrateV0,
};

function isRecord(v: unknown): v is RawProject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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
