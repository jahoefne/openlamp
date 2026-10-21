import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { buildPart } from '@core/geometry/build.ts';
import { dispose } from '@core/geometry/kernel.ts';
import { parseProject, serializeProject } from '@core/model/project.ts';
import { getKernel } from '../../helpers/kernel.ts';

const dir = new URL('../../../src/examples/', import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.lamp.json'))
  .sort();

it('ships the seven examples', () => {
  expect(files).toHaveLength(7);
});

describe.each(files)('%s', (file) => {
  const text = readFileSync(new URL(file, dir), 'utf8');

  it('parses and is stored in canonical form', () => {
    const project = parseProject(text);
    expect(project.id).toBe(file.replace('.lamp.json', ''));
    expect(serializeProject(project)).toBe(text);
  });

  it('assembles into one part without errors and builds at draft quality', async () => {
    const assembly = assemble(parseProject(text), { quality: 'draft' });
    expect(assembly.parts).toHaveLength(1);
    expect(assembly.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    const k = await getKernel();
    const { manifold, stats } = buildPart(k, assembly.parts[0]!, 'draft');
    try {
      expect(stats.status).toBe('NoError');
      expect(stats.triangles).toBeGreaterThan(0);
    } finally {
      dispose(manifold);
    }
  });
});
