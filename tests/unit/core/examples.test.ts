import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { buildPart } from '@core/geometry/build.ts';
import { dispose } from '@core/geometry/kernel.ts';
import type { Assembly } from '@core/model/assembly.ts';
import { PROJECT_VERSION, parseProject, serializeProject } from '@core/model/project.ts';
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

it('ships the classic and pendant examples', () => {
  expect(files.length).toBeGreaterThanOrEqual(8);
  expect(files.map((f) => f.replace('.lamp.json', ''))).toEqual(
    expect.arrayContaining([...CLASSIC, 'pendant-cord']),
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
    expect(project.name).toBe('Pendant on a cord');
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
