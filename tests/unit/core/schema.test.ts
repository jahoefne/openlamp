import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  CLASSIC_PARAM_PATHS,
  PROJECT_VERSION,
  classicParamsToProject,
  createDefaultProject,
  loadProject,
  migrate,
  parseProject,
  projectToClassicParams,
  serializeProject,
  type Project,
} from '@core/model/project.ts';
import {
  CLASSIC_SHADE_DEFAULTS,
  CLASSIC_SHADE_DEFS,
  CLASSIC_SHADE_GROUPS,
  isParamVisible,
  type ClassicShadeKey,
} from '@core/schema/defs.ts';
import { clampToSchema, normalizeClassicShade } from '@core/schema/normalize.ts';
import { CUSTOM_PRINTER_ID, PRINTERS, findPrinter } from '@core/schema/printers.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');

const get = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, key) => (o as Record<string, unknown>)[key], obj);

describe('parseProject / serializeProject', () => {
  it.each(['v1-minimal.lamp.json', 'v1-full.lamp.json'])('round-trips %s', (name) => {
    const project = parseProject(fixture(name));
    const text = serializeProject(project);
    expect(parseProject(text)).toEqual(project);
    expect(serializeProject(parseProject(text))).toBe(text);
  });

  it('writes keys in schema order with sorted colour overrides', () => {
    const text = serializeProject(parseProject(fixture('v1-full.lamp.json')));
    expect(Object.keys(JSON.parse(text))).toEqual([
      'version',
      'id',
      'name',
      'revision',
      'updatedAt',
      'printer',
      'quality',
      'light',
      'mount',
      'hub',
      'shades',
      'colours',
      'fitTest',
    ]);
    expect(Object.keys(parseProject(text).colours)).toEqual(['classicShade', 'shade']);
    expect(text).toContain('"bed": [300, 280, 320]');
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('migrates v0 (flat legacy params) to v1 with the right shade dimensions', () => {
    const raw = JSON.parse(fixture('v0-legacy-params.json')) as Record<string, unknown>;
    const project = parseProject(fixture('v0-legacy-params.json'));
    expect(project.version).toBe(PROJECT_VERSION);
    const [shade] = project.shades;
    expect(shade.role).toBe('outer');
    expect(shade.style).toEqual({
      family: 'revolved',
      bottomDiameter: 200,
      topDiameter: CLASSIC_SHADE_DEFAULTS.topDiameter,
      height: 150,
      curve: -0.4,
      surface: {
        style: 'faceted',
        patternCount: 8,
        ribDepth: CLASSIC_SHADE_DEFAULTS.ribDepth,
        twist: 30,
      },
    });
    expect(project.light).toMatchObject({ kind: 'puck', preset: 'custom', height: 18 });
    expect(project.mount.kind).toBe('ceilingStrap');
    expect(project.quality).toEqual({ preview: 'fine', export: 'fine' });
    expect(project.printer.id).toBe('bambu-a1');
    expect(project.fitTest).toBe(false);
    expect(projectToClassicParams(project)).toEqual(normalizeClassicShade(raw).values);
  });

  it('treats an empty object as a v0 project with every default', () => {
    expect(projectToClassicParams(loadProject({}))).toEqual({ ...CLASSIC_SHADE_DEFAULTS });
  });

  it('leaves current and unknown versions to the schema', () => {
    const v1 = JSON.parse(fixture('v1-minimal.lamp.json')) as unknown;
    expect(migrate(v1)).toBe(v1);
    expect(migrate('nope')).toBe('nope');
  });

  it.each([
    'invalid-version.json',
    'invalid-colour.json',
    'invalid-shade-family.json',
    'invalid-missing-mount.json',
    'invalid-number.json',
    'invalid-two-shades.json',
  ])('rejects %s with a ZodError', (name) => {
    expect(() => parseProject(fixture(name))).toThrow(ZodError);
  });

  it('rejects text that is not JSON with a SyntaxError', () => {
    expect(() => parseProject('{ nope')).toThrow(SyntaxError);
  });
});

describe('project ↔ classic shade params', () => {
  it('the default project holds the default shade on a Bambu Lab A1', () => {
    const project = createDefaultProject({ id: 'p', updatedAt: '2026-10-21T00:00:00.000Z' });
    expect(() => serializeProject(project)).not.toThrow();
    expect(project.printer.id).toBe('bambu-a1');
    expect(project.shades[0].colour).toBe('#f4efe6');
    expect(project.light.preset).toBe('bambu-kit-001');
    expect(projectToClassicParams(project)).toEqual({ ...CLASSIC_SHADE_DEFAULTS });
  });

  it('new projects get distinct ids', () => {
    expect(createDefaultProject().id).not.toBe(createDefaultProject().id);
  });

  it('round-trips the flat params and keeps what they do not describe', () => {
    const base = parseProject(fixture('v1-full.lamp.json'));
    const params = projectToClassicParams(base);
    const again = classicParamsToProject(params, base);
    expect(again).toEqual({ ...base, hub: { ...base.hub, wallThickness: params.wallThickness } });
    expect(projectToClassicParams(again)).toEqual(params);
  });

  it('CLASSIC_PARAM_PATHS point at the values projectToClassicParams reads', () => {
    const project: Project = parseProject(fixture('v1-full.lamp.json'));
    const params = projectToClassicParams(project);
    for (const def of CLASSIC_SHADE_DEFS) {
      const key: ClassicShadeKey = def.key;
      const value = get(project, CLASSIC_PARAM_PATHS[key]);
      expect(key === 'fitTest' ? (value ? 'yes' : 'no') : value, key).toEqual(params[key]);
    }
  });
});

describe('clampToSchema / normalizeClassicShade', () => {
  it('coerces strings, clamps ranges and rejects unknown options with warnings', () => {
    const { values, warnings } = clampToSchema(CLASSIC_SHADE_DEFS, {
      bottomDiameter: '500',
      height: 'tall',
      style: 'wobbly',
      curve: -0.5,
      unknownKey: 3,
    });
    expect(values.bottomDiameter).toBe(320);
    expect(values.height).toBe(CLASSIC_SHADE_DEFAULTS.height);
    expect(values.style).toBe(CLASSIC_SHADE_DEFAULTS.style);
    expect(values.curve).toBe(-0.5);
    expect('unknownKey' in values).toBe(false);
    expect(warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['clamped', 'bottomDiameter'],
      ['not-a-number', 'height'],
      ['invalid-option', 'style'],
    ]);
    expect(warnings[0]!.message).toBe('bottomDiameter: 500 clamped to 320');
  });

  it('applies the cross-parameter constraints', () => {
    const { values, warnings } = normalizeClassicShade({
      topDiameter: 66,
      lightHoleDiameter: 88,
      strapWidth: 60,
    });
    expect(values.topDiameter).toBe(68); // housing Ø65.2 + 2, rounded up
    expect(values.lightHoleDiameter).toBeCloseTo(57.4, 9); // pocket Ø60.4 − 2 × 1.5
    expect(values.strapWidth).toBe(58); // floor(65.2 − 2 − 2 × 2.4)
    expect(warnings.map((w) => w.paramPath)).toEqual([
      'topDiameter',
      'lightHoleDiameter',
      'strapWidth',
    ]);
  });
});

describe('param definitions', () => {
  it('hide the pattern rows for smooth and the rib depth for faceted', () => {
    const defs = CLASSIC_SHADE_GROUPS.flatMap((g) => g.params);
    const hidden = (style: string) =>
      defs.filter((d) => !isParamVisible(d, { style })).map((d) => d.key);
    expect(hidden('smooth')).toEqual(['patternCount', 'ribDepth', 'twist']);
    expect(hidden('faceted')).toEqual(['ribDepth']);
    expect(hidden('ribbed')).toEqual([]);
  });
});

describe('printers', () => {
  it('lists unique ids with positive build volumes and a 0.4 mm nozzle', () => {
    const ids = PRINTERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(CUSTOM_PRINTER_ID);
    for (const p of PRINTERS) {
      expect(p.bed.every((v) => v > 0)).toBe(true);
      expect(p.nozzle).toBe(0.4);
    }
    expect(findPrinter('bambu-a1-mini')?.bed).toEqual([180, 180, 180]);
    expect(findPrinter('nope')).toBeUndefined();
  });
});
