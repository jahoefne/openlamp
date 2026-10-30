import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { buildPart } from '@core/geometry/build.ts';
import { dispose } from '@core/geometry/kernel.ts';
import type { Assembly } from '@core/model/assembly.ts';
import {
  PROJECT_VERSION,
  parseProject,
  revolvedStyle,
  serializeProject,
} from '@core/model/project.ts';
import { getKernel } from '../../helpers/kernel.ts';

const dir = new URL('../../../src/examples/', import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.lamp.json'))
  .sort();

/** The seven classic shades: one fused print on the velcro strap. */
const CLASSIC = [
  'bell-default',
  'drum',
  'faceted',
  'fluted-twist',
  'straight-cone',
  'trumpet',
  'wide-shallow',
];

const read = (id: string) => parseProject(readFileSync(new URL(`${id}.lamp.json`, dir), 'utf8'));

/** Build every part at draft quality and expect a valid solid. */
async function buildsAll(assembly: Assembly): Promise<void> {
  const k = await getKernel();
  for (const part of assembly.parts) {
    const { manifold, stats } = buildPart(k, part, 'draft');
    try {
      expect(stats.status, part.id).toBe('NoError');
      expect(stats.triangles, part.id).toBeGreaterThan(0);
    } finally {
      dispose(manifold);
    }
  }
}

it('ships the classic, pendant, light and two-shade examples', () => {
  expect(files.length).toBeGreaterThanOrEqual(10);
  expect(files.map((f) => f.replace('.lamp.json', ''))).toEqual(
    expect.arrayContaining([
      ...CLASSIC,
      'pendant-cord',
      'e27-pendant',
      'strip-drum',
      'two-tone-bell',
    ]),
  );
});

describe.each(files)('%s', (file) => {
  const text = readFileSync(new URL(file, dir), 'utf8');

  it('parses and is stored in canonical form', () => {
    const project = parseProject(text);
    expect(project.id).toBe(file.replace('.lamp.json', ''));
    expect(serializeProject(project)).toBe(text);
  });

  it('is a current-version project', () => {
    expect(parseProject(text).version).toBe(PROJECT_VERSION);
  });

  it('assembles without errors and builds every part at draft quality', async () => {
    const assembly = assemble(parseProject(text), { quality: 'draft' });
    expect(assembly.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    await buildsAll(assembly);
  });

  it('also builds split into a hub and a shade at draft quality', async () => {
    const project = parseProject(text);
    project.hub.fused = false;
    const assembly = assemble(project, { quality: 'draft' });
    expect(assembly.parts.map((p) => p.id).slice(0, 2)).toEqual(['hub', 'shade']);
    expect(assembly.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    await buildsAll(assembly);
  });
});

describe('the classic examples', () => {
  it.each(CLASSIC)('%s is one fused shade on the velcro strap', (id) => {
    const project = read(id);
    expect(project.hub.fused).toBe(true);
    expect(project.mount.kind).toBe('ceilingStrap');
    expect(assemble(project, { quality: 'draft' }).parts).toHaveLength(1);
  });
});

describe('the pendant example', () => {
  it('hangs a hub and a shade on a cord from a canopy', () => {
    const project = read('pendant-cord');
    expect(project.name).toBe('Lærke');
    expect(project.mount).toMatchObject({ kind: 'ceilingCord', grip: 'knot' });
    expect(project.hub.fused).toBe(false);
    expect(project.joints.shadeToHub).toBe('bayonet');
    const assembly = assemble(project, { quality: 'draft' });
    expect(assembly.parts.map((p) => [p.id, p.kind])).toEqual([
      ['hub', 'hub'],
      ['shade', 'shade'],
      ['canopy', 'canopy'],
    ]);
    expect(assembly.context.kind).toBe('ceiling');
  });
});

describe('the two-shade example', () => {
  it('hangs a black ribbed bell and a white smooth inner shade from a split hub on a cord', async () => {
    const project = read('two-tone-bell');
    expect(project.name).toBe('Skumring');
    expect(project.mount.kind).toBe('ceilingCord');
    expect(project.light.kind).toBe('puck');
    expect(project.hub.fused).toBe(false);
    expect(project.joints.shadeToHub).toBe('bayonet');
    const [outer, inner] = project.shades;
    expect(outer).toMatchObject({ role: 'outer', colour: '#1f1f23' });
    expect(revolvedStyle(outer).surface.style).toBe('ribbed');
    expect(inner).toMatchObject({ role: 'inner', colour: '#ffffff' });
    expect(revolvedStyle(inner!).surface.style).toBe('smooth');
    const assembly = assemble(project, { quality: 'draft' });
    expect(assembly.parts.map((p) => [p.id, p.colour])).toEqual([
      ['hub', '#1f1f23'],
      ['shade', '#1f1f23'],
      ['innerShade', '#ffffff'],
      ['canopy', '#1f1f23'],
    ]);
    expect(Object.keys(assembly.interfaces)).toEqual(
      expect.arrayContaining(['shadeToHub', 'innerShadeToHub']),
    );
    expect(assembly.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
    await buildsAll(assembly);
  });
});

describe('the light examples', () => {
  it('the E27 pendant hangs an E27 lampholder (shade ring) and vents in its hub', () => {
    const project = read('e27-pendant');
    expect(project.name).toBe('Lys');
    expect(project.light).toMatchObject({ kind: 'bulb', size: 'E27', fitting: 'shadeRing' });
    expect(project.mount.kind).toBe('ceilingCord');
    expect(project.hub).toMatchObject({ fused: false, ventCount: 8 });
    const assembly = assemble(project, { quality: 'draft' });
    expect(assembly.parts.map((p) => p.id)).toEqual(['hub', 'shade', 'canopy']);
    expect(assembly.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
    expect(assembly.derived.bulbZ).toBeLessThan(0);
  });

  it('the strip ring drum carries an LED strip ring under a wide hub', () => {
    const project = read('strip-drum');
    expect(project.name).toBe('Glød');
    expect(project.light.kind).toBe('strip');
    expect(project.mount.kind).toBe('ceilingCord');
    const assembly = assemble(project, { quality: 'draft' });
    expect(assembly.parts.map((p) => p.id)).toEqual(['hub', 'shade', 'canopy']);
    expect(assembly.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
    expect(assembly.derived.stripRingDiameter).toBe(120);
  });
});
