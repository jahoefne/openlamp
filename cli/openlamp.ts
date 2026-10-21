#!/usr/bin/env node
/**
 * openlamp command line: builds STLs with the same core as the web app. Node
 * runs this file directly (type stripping), so it uses erasable syntax only.
 *
 *   node cli/openlamp.ts part classicShade --bottomDiameter 200 --quality fine -o big.stl
 *   node cli/openlamp.ts project my.lamp.json --out prints/
 *   node cli/openlamp.ts samples            # every src/examples/*.lamp.json → samples/
 *   node cli/openlamp.ts list               # printers, examples, parameters
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Module from 'manifold-3d';
import { ZodError, prettifyError } from 'zod';
import {
  CLASSIC_SHADE_DEFS,
  PART_BUILDERS,
  PRINTERS,
  QUALITIES,
  assemble,
  buildPart,
  dispose,
  meshToBinaryStl,
  normalizeClassicShade,
  parseProject,
  partFileName,
  printerLabel,
  type Kernel,
  type PartSpec,
  type PartStats,
  type Project,
  type Quality,
  type Warning,
} from '../src/core/index.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES_DIR = join(ROOT, 'src', 'examples');
const SAMPLES_DIR = join(ROOT, 'samples');
const CLASSIC_STL_HEADER = 'openlamp lamp shade for Bambu Lab LED Lamp Kit-001';

const USAGE = `openlamp – parametric, 3D-printable lamp generator

Usage:
  node cli/openlamp.ts part <kind> [--<param> <value> ...] [-o out.stl] [--json]
  node cli/openlamp.ts project <file.lamp.json> [--out <dir>] [--quality <q>] [--json]
  node cli/openlamp.ts samples [--out <dir>] [--quality <q>]
  node cli/openlamp.ts list
  node cli/openlamp.ts --help

Commands:
  part      Build one part from parameters. Kinds: ${Object.keys(PART_BUILDERS).join(', ')}.
            Every parameter from \`list\` can be passed as --<param> <value>; values are
            clamped to their range and cross-checked. Default output
            samples/openlamp-<kind>.stl.
  project   Build every part of a .lamp.json project at its export quality into
            <dir> (default: the current directory) as openlamp-<project>-<part>.stl.
  samples   Build every example in src/examples into samples/ (git-ignored).
  list      Show the printers, the examples and the classic-shade parameters.

Options:
  -o, --out <path>     Output file (part) or directory (project, samples)
  --quality <q>        Mesh quality: ${QUALITIES.join(', ')} (overrides the project's export quality)
  --json               Print the stats as JSON
  -h, --help           This help

part, project and samples exit with 1 if any mesh is not a valid manifold.`;

class UsageError extends Error {}

// ---------------------------------------------------------------- helpers

let kernelPromise: Promise<Kernel> | undefined;
function getKernel(): Promise<Kernel> {
  kernelPromise ??= Module().then((k) => {
    k.setup();
    return k;
  });
  return kernelPromise;
}

const fmt = (n: number, d = 1) => n.toFixed(d);

/** Relative to the working directory when inside it, else absolute. */
function displayPath(file: string): string {
  const rel = relative(process.cwd(), file);
  return rel && !rel.startsWith('..') ? rel : file;
}

function parseQuality(value: string | undefined): Quality | undefined {
  if (value === undefined) return undefined;
  const q = QUALITIES.find((x) => x === value);
  if (!q) throw new UsageError(`Unknown quality "${value}" (use ${QUALITIES.join(', ')})`);
  return q;
}

function printWarnings(warnings: readonly Warning[]): void {
  for (const w of warnings) console.warn(`${w.severity}: ${w.message}`);
}

interface Built {
  file: string;
  stats: PartStats;
}

/** Build a part, write its STL (only if the mesh is valid) and dispose it. */
async function buildToFile(
  k: Kernel,
  spec: Pick<PartSpec, 'kind' | 'params'>,
  quality: Quality,
  file: string,
  header: string,
): Promise<Built> {
  const { manifold, stats } = buildPart(k, spec, quality);
  try {
    if (stats.status === 'NoError') {
      const stl = meshToBinaryStl(manifold.getMesh(), header);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, new Uint8Array(stl));
    }
  } finally {
    dispose(manifold);
  }
  return { file, stats };
}

function summary({ file, stats }: Built): string {
  const { min, max } = stats.bbox;
  const lines = [
    `${stats.status === 'NoError' ? 'Wrote' : 'FAILED'} ${displayPath(file)}`,
    `  size        ${fmt(max[0] - min[0])} × ${fmt(max[1] - min[1])} × ${fmt(max[2] - min[2])} mm`,
  ];
  const d = stats.derived;
  if (d?.rBoss !== undefined && d.rPocket !== undefined && d.pocketDepth !== undefined) {
    lines.push(
      `  housing     Ø${fmt(2 * d.rBoss)} mm, pocket Ø${fmt(2 * d.rPocket, 2)} × ${fmt(d.pocketDepth)} mm deep`,
    );
  }
  lines.push(
    `  volume      ${fmt(stats.volumeMm3 / 1000)} cm³ (${fmt(stats.volumeMm3, 3)} mm³, ~${fmt(stats.estGramsPla, 0)} g PLA)`,
    `  overhang    max ${fmt(stats.maxOverhangDeg, 0)}° from vertical`,
    `  mesh        ${stats.triangles} triangles, ${stats.vertices} vertices, status ${stats.status}, ${stats.buildMs} ms`,
  );
  return lines.join('\n');
}

function statsJson(built: Built, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { derived, ...stats } = built.stats;
  return { out: built.file, ...extra, ...stats };
}

async function loadProjectFile(file: string): Promise<Project> {
  const text = await readFile(file, 'utf8');
  try {
    return parseProject(text);
  } catch (err) {
    const detail = err instanceof ZodError ? prettifyError(err) : String(err);
    throw new Error(`${file}: not a valid openlamp project\n${detail}`, { cause: err });
  }
}

/** Build every part of a project into `outDir`; returns whether all meshes are valid. */
async function buildProject(
  project: Project,
  outDir: string,
  quality: Quality | undefined,
  json: boolean,
): Promise<{ ok: boolean; results: Record<string, unknown>[] }> {
  const q = quality ?? project.quality.export;
  const assembly = assemble(project, { quality: q });
  printWarnings(assembly.warnings);
  const k = await getKernel();
  let ok = true;
  const results: Record<string, unknown>[] = [];
  for (const part of assembly.parts) {
    const file = join(outDir, partFileName(project, part, 'stl'));
    const header = `openlamp ${part.displayName} - ${project.name}`;
    const built = await buildToFile(k, part, q, file, header);
    if (built.stats.status !== 'NoError') ok = false;
    if (json) results.push(statsJson(built, { project: project.name, part: part.id }));
    else console.log(summary(built));
  }
  return { ok, results };
}

// ---------------------------------------------------------------- commands

async function cmdPart(
  kind: string | undefined,
  flags: Record<string, string | boolean | undefined>,
): Promise<number> {
  if (kind !== 'classicShade') {
    throw new UsageError(
      kind ? `Unknown part kind "${kind}"` : 'Missing part kind (e.g. `part classicShade`)',
    );
  }
  const input: Record<string, unknown> = {};
  for (const def of CLASSIC_SHADE_DEFS) {
    const v = flags[def.key];
    if (typeof v === 'string') input[def.key] = v;
  }
  parseQuality(typeof flags.quality === 'string' ? flags.quality : undefined);
  const { values: params, warnings } = normalizeClassicShade(input);
  printWarnings(warnings);
  const out = resolve(typeof flags.out === 'string' ? flags.out : `samples/openlamp-${kind}.stl`);
  const built = await buildToFile(
    await getKernel(),
    { kind, params },
    params.quality,
    out,
    CLASSIC_STL_HEADER,
  );
  if (flags.json) console.log(JSON.stringify(statsJson(built, { kind, params }), null, 2));
  else console.log(summary(built));
  return built.stats.status === 'NoError' ? 0 : 1;
}

async function cmdProject(
  file: string | undefined,
  flags: Record<string, string | boolean | undefined>,
): Promise<number> {
  if (!file) throw new UsageError('Missing project file (e.g. `project my.lamp.json`)');
  const project = await loadProjectFile(file);
  const outDir = resolve(typeof flags.out === 'string' ? flags.out : '.');
  const quality = parseQuality(typeof flags.quality === 'string' ? flags.quality : undefined);
  const { ok, results } = await buildProject(project, outDir, quality, flags.json === true);
  if (flags.json) console.log(JSON.stringify(results, null, 2));
  return ok ? 0 : 1;
}

async function exampleFiles(): Promise<string[]> {
  return (await readdir(EXAMPLES_DIR))
    .filter((f) => f.endsWith('.lamp.json'))
    .sort()
    .map((f) => join(EXAMPLES_DIR, f));
}

async function cmdSamples(flags: Record<string, string | boolean | undefined>): Promise<number> {
  const outDir = resolve(typeof flags.out === 'string' ? flags.out : SAMPLES_DIR);
  const quality = parseQuality(typeof flags.quality === 'string' ? flags.quality : undefined);
  let ok = true;
  const results: Record<string, unknown>[] = [];
  for (const file of await exampleFiles()) {
    const project = await loadProjectFile(file);
    const r = await buildProject(project, outDir, quality, flags.json === true);
    ok &&= r.ok;
    results.push(...r.results);
  }
  if (flags.json) console.log(JSON.stringify(results, null, 2));
  if (!ok) console.error('Some samples are not valid manifolds.');
  return ok ? 0 : 1;
}

async function cmdList(): Promise<number> {
  console.log('Printers (set in the project file):');
  for (const p of PRINTERS) {
    const bed = p.bed.join(' × ');
    const colour = p.multiColour
      ? `multi-colour${p.notes ? ` (${p.notes})` : ''}`
      : (p.notes ?? '');
    console.log(`  ${p.id.padEnd(24)} ${printerLabel(p).padEnd(30)} ${bed.padEnd(17)} ${colour}`);
  }
  console.log(`\nExamples (${displayPath(EXAMPLES_DIR)}):`);
  for (const file of await exampleFiles()) {
    const project = await loadProjectFile(file);
    console.log(`  ${relative(EXAMPLES_DIR, file).padEnd(28)} ${project.name}`);
  }
  console.log('\nClassic-shade parameters (part classicShade --<param> <value>):');
  for (const p of CLASSIC_SHADE_DEFS) {
    const range =
      p.type === 'select' ? p.options.join('|') : `${p.min}..${p.max} ${p.unit ?? ''}`.trim();
    console.log(
      `  --${p.key.padEnd(20)} ${String(p.default).padEnd(8)} ${range}${p.help ? `   ${p.help}` : ''}`,
    );
  }
  return 0;
}

// ---------------------------------------------------------------- main

async function main(argv: string[]): Promise<number> {
  const options = {
    out: { type: 'string', short: 'o' },
    json: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
    // One string flag per classic-shade parameter (this includes --quality).
    ...Object.fromEntries(CLASSIC_SHADE_DEFS.map((d) => [d.key, { type: 'string' as const }])),
  } as const;
  const { values, positionals } = parseArgs({
    args: argv,
    options,
    allowPositionals: true,
    strict: true,
  });
  const flags = values as Record<string, string | boolean | undefined>;
  const [command, arg] = positionals;
  if (flags.help || command === undefined || command === 'help') {
    console.log(USAGE);
    return 0;
  }
  if (command !== 'part') {
    const misplaced = CLASSIC_SHADE_DEFS.map((d) => d.key).filter(
      (key) => key !== 'quality' && flags[key] !== undefined,
    );
    if (misplaced.length > 0) {
      throw new UsageError(`--${misplaced[0]} only applies to \`part\`; edit the project instead`);
    }
  }
  switch (command) {
    case 'part':
      return cmdPart(arg, flags);
    case 'project':
      return cmdProject(arg, flags);
    case 'samples':
      return cmdSamples(flags);
    case 'list':
      return cmdList();
    default:
      throw new UsageError(`Unknown command "${command}"`);
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (err) {
  const usage =
    err instanceof UsageError ||
    (err instanceof Error && 'code' in err && String(err.code).startsWith('ERR_PARSE_ARGS'));
  console.error(`openlamp: ${err instanceof Error ? err.message : String(err)}`);
  if (usage) console.error('Run `node cli/openlamp.ts --help` for usage.');
  process.exitCode = usage ? 2 : 1;
}
