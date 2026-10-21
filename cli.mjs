#!/usr/bin/env node
/**
 * openlamp command-line STL generator.
 *
 *   node cli.mjs                          # default shade → samples/shade.stl
 *   node cli.mjs -o my.stl --bottomDiameter 180 --style faceted --patternCount 8
 *   node cli.mjs --preset "Fluted twist" --quality fine
 *   node cli.mjs --list                   # show all parameters and presets
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import Module from 'manifold-3d';
import { PARAMS, PRESETS, normalizeParams } from './src/params.ts';
import { buildShade } from './src/geometry.ts';
import { meshToBinaryStl } from './src/stl.ts';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') {
      out.out = argv[++i];
      continue;
    }
    if (a === '--list' || a === '-l') {
      out.list = true;
      continue;
    }
    if (a === '--help' || a === '-h') {
      out.help = true;
      continue;
    }
    if (a === '--json') {
      out.json = true;
      continue;
    }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
      continue;
    }
    out._.push(a);
  }
  return out;
}

function usage() {
  console.log(`openlamp – parametric lamp shade for the Bambu Lab LED Lamp Kit-001

Usage: node cli.mjs [options] [--<param> <value> ...]

Options:
  -o, --out <file>      Output STL path (default samples/shade.stl)
  --preset <name>       Start from a preset (see --list)
  --json                Print the stats as JSON
  -l, --list            List parameters and presets
  -h, --help            This help

Any parameter key from --list can be passed as --key value.`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
  process.exit(0);
}
if (args.list) {
  console.log('Parameters:');
  for (const p of PARAMS) {
    const range = p.type === 'select' ? p.options.join('|') : `${p.min}..${p.max} ${p.unit}`.trim();
    console.log(
      `  --${p.key.padEnd(20)} ${String(p.default).padEnd(8)} ${range}${p.help ? '   ' + p.help : ''}`,
    );
  }
  console.log('\nPresets:');
  for (const name of Object.keys(PRESETS)) console.log(`  "${name}"`);
  process.exit(0);
}

let input = {};
if (args.preset) {
  if (!(args.preset in PRESETS)) {
    console.error(`Unknown preset "${args.preset}". See --list.`);
    process.exit(2);
  }
  input = { ...PRESETS[args.preset] };
}
for (const p of PARAMS) if (args[p.key] !== undefined) input[p.key] = args[p.key];
const { params, warnings } = normalizeParams(input);
for (const w of warnings) console.warn('warning:', w);

const wasm = await Module();
wasm.setup();
const t0 = performance.now();
const { manifold, stats } = buildShade(wasm, params);
if (stats.status !== 'NoError') {
  console.error('Geometry error:', stats.status);
  process.exit(1);
}
const mesh = manifold.getMesh();
const stl = meshToBinaryStl(mesh, 'openlamp lamp shade for Bambu Lab LED Lamp Kit-001');
const out = args.out || 'samples/shade.stl';
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.from(stl));
const ms = Math.round(performance.now() - t0);

if (args.json) {
  const { derived, ...rest } = stats;
  console.log(JSON.stringify({ out, params, ...rest, buildMs: ms }, null, 2));
} else {
  console.log(`Wrote ${out}`);
  console.log(
    `  size        ${stats.size.x.toFixed(1)} × ${stats.size.y.toFixed(1)} × ${stats.size.z.toFixed(1)} mm`,
  );
  console.log(
    `  housing     Ø${stats.housingDiameter.toFixed(1)} mm, pocket Ø${stats.pocketDiameter.toFixed(2)} × ${stats.pocketDepth.toFixed(1)} mm deep`,
  );
  console.log(
    `  volume      ${(stats.volumeMm3 / 1000).toFixed(1)} cm³  (~${stats.estGramsPla.toFixed(0)} g PLA)`,
  );
  console.log(`  overhang    max ${stats.maxOverhangDeg.toFixed(0)}° from vertical`);
  console.log(
    `  mesh        ${stats.triangles} triangles, ${stats.vertices} vertices, status ${stats.status}, ${ms} ms`,
  );
}
manifold.delete();
