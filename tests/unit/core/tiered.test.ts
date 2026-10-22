/**
 * The tiered (PH-style) family. M3a: a stub that stands in with a plain
 * revolved body and says so. (Owned by M3b's tiered step, which replaces
 * these tests with the tiers' and spacers' own.)
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { SHADE_MODULES } from '@core/assembly/shades/index.ts';
import { buildPart } from '@core/geometry/build.ts';
import { dispose, type Kernel } from '@core/geometry/kernel.ts';
import { parseProject, shadeStyleForFamily } from '@core/model/project.ts';
import { getKernel } from '../../helpers/kernel.ts';

let k: Kernel;

beforeAll(async () => {
  k = await getKernel();
});

const pendant = () =>
  parseProject(
    readFileSync(new URL('../../../src/examples/pendant-cord.lamp.json', import.meta.url), 'utf8'),
  );

describe('the tiered family (stub until M3b)', () => {
  it('is pending and builds tiers and spacers', () => {
    expect(SHADE_MODULES.tiered.pending).toBe(true);
    expect(SHADE_MODULES.tiered.partKinds).toEqual(['tier', 'spacer']);
  });

  it('stands in as a plain revolved body with its diameters and says so', () => {
    const p = pendant();
    p.shades[0].style = shadeStyleForFamily(p.shades[0].style, 'tiered');
    const a = assemble(p, { quality: 'draft' });
    const shade = a.parts.find((x) => x.id === 'shade');
    if (shade?.kind !== 'shade' || shade.params.variant !== 'revolved') throw new Error('stand-in');
    expect(shade.params).toMatchObject({ bottomDiameter: 150, topDiameter: 136, curve: 0 });
    expect(shade.params.surface.style).toBe('smooth');
    expect(a.warnings.find((w) => w.code === 'family-pending')).toMatchObject({
      severity: 'info',
      partId: 'shade',
      paramPath: 'shades.0.style.family',
    });
    expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    for (const part of a.parts) {
      const { manifold, stats } = buildPart(k, part, 'draft');
      try {
        expect(stats.status, part.id).toBe('NoError');
      } finally {
        dispose(manifold);
      }
    }
  });

  it('rounds its counts', () => {
    const p = pendant();
    p.shades[0].style = { ...shadeStyleForFamily(p.shades[0].style, 'tiered'), tiers: 3.6 };
    const a = assemble(p, { quality: 'draft' });
    expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
  });
});
