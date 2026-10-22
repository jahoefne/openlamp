import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  CLASSIC_PARAM_PATHS,
  DEFAULT_HUB_COLOUR,
  HUB_PARAM_PATHS,
  MountSchema,
  PROJECT_VERSION,
  classicParamsToProject,
  createDefaultProject,
  defaultMount,
  loadProject,
  migrate,
  mountFromParams,
  mountParamPath,
  mountToParams,
  parseProject,
  projectToClassicParams,
  projectToHubParams,
  revolvedStyle,
  serializeProject,
  type Project,
} from '@core/model/project.ts';
import {
  CLASSIC_SHADE_DEFAULTS,
  CLASSIC_SHADE_DEFS,
  CLASSIC_SHADE_GROUPS,
  HUB_JOINT_DEFAULTS,
  HUB_JOINT_DEFS,
  HUB_JOINT_GROUPS,
  MOUNT_DEFAULTS,
  MOUNT_DEFS,
  MOUNT_GROUPS,
  MOUNT_KINDS,
  MOUNT_LABELS,
  MOUNT_PARAM_PATHS,
  isParamVisible,
  type ClassicShadeKey,
  type HubJointKey,
} from '@core/schema/defs.ts';
import {
  clampToSchema,
  normalizeClassicShade,
  normalizeHubJoint,
  normalizeMountParams,
} from '@core/schema/normalize.ts';
import { CUSTOM_PRINTER_ID, PRINTERS, findPrinter } from '@core/schema/printers.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');

const get = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, key) => (o as Record<string, unknown>)[key], obj);

const V1_FIXTURES = ['v1-minimal.lamp.json', 'v1-full.lamp.json'];
const V2_FIXTURES = ['v2-minimal.lamp.json', 'v2-full.lamp.json'];
const V3_FIXTURES = [
  'v3-minimal.lamp.json',
  'v3-full.lamp.json',
  'v3-wall-arm.lamp.json',
  'v3-standing.lamp.json',
];

describe('parseProject / serializeProject', () => {
  it.each([...V3_FIXTURES, ...V2_FIXTURES, ...V1_FIXTURES])('round-trips %s', (name) => {
    const project = parseProject(fixture(name));
    const text = serializeProject(project);
    expect(parseProject(text)).toEqual(project);
    expect(serializeProject(parseProject(text))).toBe(text);
  });

  it('writes keys in schema order with sorted colour overrides', () => {
    const text = serializeProject(parseProject(fixture('v2-full.lamp.json')));
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
      'joints',
      'colours',
      'fitTest',
    ]);
    expect(Object.keys(parseProject(text).colours)).toEqual(['hub', 'shade']);
    expect(text).toContain('"bed": [300, 280, 320]');
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('migrates v0 (flat legacy params) to the current version with the right shade dimensions', () => {
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
      shoulderAngle: CLASSIC_SHADE_DEFAULTS.shoulderAngle,
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
    expect(project.hub.fused).toBe(true);
    expect(projectToClassicParams(project)).toEqual(normalizeClassicShade(raw).values);
  });

  it('treats an empty object as a v0 project with every default', () => {
    expect(projectToClassicParams(loadProject({}))).toEqual({ ...CLASSIC_SHADE_DEFAULTS });
  });

  it('leaves current and unknown versions to the schema', () => {
    const v3 = JSON.parse(fixture('v3-minimal.lamp.json')) as unknown;
    expect(migrate(v3)).toBe(v3);
    const future = { version: 99 };
    expect(migrate(future)).toBe(future);
    expect(migrate('nope')).toBe('nope');
  });

  it.each([
    'invalid-version.json',
    'invalid-colour.json',
    'invalid-shade-family.json',
    'invalid-missing-mount.json',
    'invalid-number.json',
    'invalid-two-shades.json',
    'invalid-cord-mount.json',
  ])('rejects %s with a ZodError', (name) => {
    expect(() => parseProject(fixture(name))).toThrow(ZodError);
  });

  it('rejects text that is not JSON with a SyntaxError', () => {
    expect(() => parseProject('{ nope')).toThrow(SyntaxError);
  });
});

describe('migration v1 → v2', () => {
  /** The flat classic-shade params of a raw v1 project (its own paths). */
  const v1Params = (raw: Record<string, Record<string, unknown>>) => {
    const v2Paths = Object.fromEntries(
      Object.entries(CLASSIC_PARAM_PATHS).map(([key, path]) => [
        key,
        path
          .replace('shades.0.style.shoulderAngle', 'hub.shoulderAngle')
          .replace('light.bossWall', 'hub.bossWall')
          .replace('light.pocketExtraDepth', 'hub.pocketExtraDepth'),
      ]),
    );
    return Object.fromEntries(Object.entries(v2Paths).map(([key, path]) => [key, get(raw, path)]));
  };

  it.each(V1_FIXTURES)('keeps the geometry of %s and moves the puck pocket fields', (name) => {
    const raw = JSON.parse(fixture(name)) as Record<string, Record<string, unknown>>;
    const v1Hub = raw.hub!;
    const project = parseProject(fixture(name));
    expect(project.version).toBe(PROJECT_VERSION);
    const flat = projectToClassicParams(project);
    const expected = v1Params(raw);
    for (const def of CLASSIC_SHADE_DEFS) {
      if (def.key === 'quality' || def.key === 'fitTest') continue;
      expect(flat[def.key], def.key).toEqual(expected[def.key]);
    }
    // Moved: the pocket's boss wall and extra depth live on the light now.
    expect(project.light).toMatchObject({
      kind: 'puck',
      bossWall: v1Hub.bossWall,
      pocketExtraDepth: v1Hub.pocketExtraDepth,
    });
    expect('bossWall' in project.hub).toBe(false);
    // Copied: the shade gets the shoulder angle, the hub keeps its own.
    expect(revolvedStyle(project.shades[0]).shoulderAngle).toBe(v1Hub.shoulderAngle);
    expect(project.hub.shoulderAngle).toBe(v1Hub.shoulderAngle);
    // Added with their defaults; still one print.
    expect(project.hub).toMatchObject({
      wallThickness: 2,
      collarWall: 2,
      radialGap: 8,
      ventCount: 0,
      fused: true,
    });
    expect(project.joints).toEqual({
      shadeToHub: 'bayonet',
      tolerance: 0.3,
      threadPitch: 2.5,
      threadDepth: 0.8,
      screw: 'M3',
      heatSet: true,
    });
    expect(project.colours.hub).toBe(DEFAULT_HUB_COLOUR);
    expect(project.shades[0].collarDiameter).toBeUndefined();
  });

  it('turns the dropped classicShade part-kind colour into the shade colour', () => {
    const full = parseProject(fixture('v1-full.lamp.json'));
    expect(full.colours).toEqual({ hub: DEFAULT_HUB_COLOUR, shade: '#ffcc00' });
    const raw = JSON.parse(fixture('v1-minimal.lamp.json')) as Record<string, unknown>;
    raw.colours = { classicShade: '#aabbcc' };
    expect(loadProject(raw).colours).toEqual({ hub: DEFAULT_HUB_COLOUR, shade: '#aabbcc' });
  });

  it('re-saved v1 fixtures equal the current fixtures', () => {
    expect(serializeProject(parseProject(fixture('v1-minimal.lamp.json')))).toBe(
      fixture('v3-minimal.lamp.json'),
    );
  });
});

describe('migration v2 → v3', () => {
  it.each(V2_FIXTURES)('only bumps the version of %s (the strap keeps its shape)', (name) => {
    const raw = JSON.parse(fixture(name)) as Record<string, unknown>;
    const migrated = migrate(raw) as Record<string, unknown>;
    expect(migrated).toEqual({ ...raw, version: 3 });
    const project = loadProject(raw);
    expect(project.version).toBe(3);
    expect(project.mount).toEqual(raw.mount);
  });

  it('re-saved v2 fixtures equal the v3 fixtures', () => {
    expect(serializeProject(parseProject(fixture('v2-minimal.lamp.json')))).toBe(
      fixture('v3-minimal.lamp.json'),
    );
  });

  it('parses every mount variant', () => {
    expect(parseProject(fixture('v3-full.lamp.json')).mount).toMatchObject({
      kind: 'ceilingCord',
      grip: 'collet',
      canopy: { diameter: 100 },
    });
    expect(parseProject(fixture('v3-wall-arm.lamp.json')).mount).toMatchObject({
      kind: 'wallArm',
      arm: { shape: 'curved' },
    });
    expect(parseProject(fixture('v3-standing.lamp.json')).mount).toMatchObject({
      kind: 'standing',
      variant: 'floor',
      base: { lid: 'screws' },
    });
  });
});

describe('mounts', () => {
  it.each(MOUNT_KINDS)(
    '%s: the defaults are a valid mount, its paths cover every field',
    (kind) => {
      const mount = defaultMount(kind);
      expect(MountSchema.parse(mount)).toEqual(mount);
      expect(mount.kind).toBe(kind);
      expect(mountToParams(mount)).toEqual({ ...MOUNT_DEFAULTS[kind] });
      expect(mountFromParams(kind, MOUNT_DEFAULTS[kind])).toEqual(mount);
      // One definition per path, one path per leaf field.
      const leaves = (o: object, prefix = ''): string[] =>
        Object.entries(o).flatMap(([key, v]) =>
          typeof v === 'object' && v !== null
            ? leaves(v as object, `${prefix}${key}.`)
            : [prefix + key],
        );
      const fields = leaves(mount).filter((path) => path !== 'kind');
      expect(Object.values(MOUNT_PARAM_PATHS[kind]).sort()).toEqual(fields.sort());
      expect(MOUNT_DEFS[kind].map((d) => d.key).sort()).toEqual(
        Object.keys(MOUNT_PARAM_PATHS[kind]).sort(),
      );
      expect(MOUNT_GROUPS[kind].length).toBeGreaterThan(0);
      expect(MOUNT_LABELS[kind]).toBeTruthy();
    },
  );

  it('the strap defaults are the classic shade defaults', () => {
    expect(defaultMount('ceilingStrap')).toEqual(createDefaultProject().mount);
  });

  it('gives every mount parameter a project path', () => {
    expect(mountParamPath('ceilingCord', 'canopyDiameter')).toBe('mount.canopy.diameter');
    expect(mountParamPath('ceilingStrap', 'strapWidth')).toBe(CLASSIC_PARAM_PATHS.strapWidth);
    expect(mountParamPath('wallArm', 'canopyDiameter')).toBeUndefined();
  });

  it('clamps mount parameters with their project paths', () => {
    const { values, warnings } = normalizeMountParams('ceilingCord', {
      ...mountToParams(defaultMount('ceilingCord')),
      canopyDiameter: 500,
      grip: 'zip-tie',
    });
    expect(values.canopyDiameter).toBe(160);
    expect(values.grip).toBe('knot');
    expect(warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['invalid-option', 'mount.grip'],
      ['clamped', 'mount.canopy.diameter'],
    ]);
  });

  it('shows the rise angle only for a bent arm', () => {
    const defs = MOUNT_GROUPS.wallArm.flatMap((g) => g.params);
    const shown = (armShape: string) =>
      defs.filter((d) => isParamVisible(d, { armShape })).map((d) => d.key);
    expect(shown('straight')).not.toContain('armRiseAngle');
    expect(shown('angled')).toContain('armRiseAngle');
    expect(shown('curved')).toContain('armRiseAngle');
  });

  it('keeps a mount other than the strap through the classic shade bridge', () => {
    const base = parseProject(fixture('v3-full.lamp.json'));
    const params = projectToClassicParams(base);
    // The strap's flat parameters are its defaults; they do not touch the cord mount.
    expect(params.strapWidth).toBe(CLASSIC_SHADE_DEFAULTS.strapWidth);
    const again = classicParamsToProject({ ...params, strapWidth: 20 }, base);
    expect(again).toEqual(base);
    expect(again.mount).not.toBe(base.mount);
  });
});

describe('project ↔ classic shade params', () => {
  it('the default project holds the default shade on a Bambu Lab A1', () => {
    const project = createDefaultProject({ id: 'p', updatedAt: '2026-10-21T00:00:00.000Z' });
    expect(() => serializeProject(project)).not.toThrow();
    expect(project.printer.id).toBe('bambu-a1');
    expect(project.shades[0].colour).toBe('#f4efe6');
    expect(project.light).toMatchObject({ kind: 'puck', preset: 'bambu-kit-001' });
    expect(project.hub.fused).toBe(true);
    expect(project.colours).toEqual({ hub: '#d9d4cb' });
    expect(projectToClassicParams(project)).toEqual({ ...CLASSIC_SHADE_DEFAULTS });
    expect(projectToHubParams(project)).toEqual({ ...HUB_JOINT_DEFAULTS });
  });

  it('new projects get distinct ids', () => {
    expect(createDefaultProject().id).not.toBe(createDefaultProject().id);
  });

  it('round-trips the flat params and keeps what they do not describe', () => {
    const base = parseProject(fixture('v2-full.lamp.json'));
    const params = projectToClassicParams(base);
    const again = classicParamsToProject(params, base);
    expect(again).toEqual(base);
    expect(projectToClassicParams(again)).toEqual(params);
  });

  it('CLASSIC_PARAM_PATHS point at the values projectToClassicParams reads', () => {
    const project: Project = parseProject(fixture('v2-full.lamp.json'));
    const params = projectToClassicParams(project);
    for (const def of CLASSIC_SHADE_DEFS) {
      const key: ClassicShadeKey = def.key;
      const value = get(project, CLASSIC_PARAM_PATHS[key]);
      expect(key === 'fitTest' ? (value ? 'yes' : 'no') : value, key).toEqual(params[key]);
    }
  });

  it('HUB_PARAM_PATHS point at the values projectToHubParams reads', () => {
    const project: Project = parseProject(fixture('v2-full.lamp.json'));
    const params = projectToHubParams(project);
    for (const def of HUB_JOINT_DEFS) {
      const key: HubJointKey = def.key;
      expect(get(project, HUB_PARAM_PATHS[key]), key).toEqual(params[key]);
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

describe('normalizeHubJoint', () => {
  it('clamps and keeps a thread depth of at most 0.4 × the pitch', () => {
    const { values, warnings } = normalizeHubJoint({
      ...HUB_JOINT_DEFAULTS,
      shadeToHub: 'thread',
      threadPitch: 2,
      threadDepth: 1.2,
      jointTolerance: 5,
    });
    expect(values.jointTolerance).toBe(0.8);
    expect(values.threadDepth).toBe(0.8);
    expect(warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['clamped', 'jointTolerance'],
      ['adjusted', 'threadDepth'],
    ]);
  });

  it('shows the joint rows only while the lamp is split, the thread rows only for threads', () => {
    const defs = HUB_JOINT_GROUPS.flatMap((g) => g.params);
    const shown = (values: Record<string, unknown>) =>
      defs.filter((d) => isParamVisible(d, values)).map((d) => d.key);
    expect(shown({ fused: true, shadeToHub: 'thread' })).toEqual([]);
    expect(shown({ fused: false, shadeToHub: 'bayonet' })).not.toContain('threadPitch');
    expect(shown({ fused: false, shadeToHub: 'thread' })).toContain('threadDepth');
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
