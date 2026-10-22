/**
 * The shade style families (M3a): the four style variants in the project,
 * the family switch, the `ShadeModule` registry and dispatch, the fused rule,
 * the tiered and geometric stand-ins, an inner shade of another family, and
 * multi-part shades placed by the mounts.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INNER_SHADE_ID, assemble } from '@core/assembly/assemble.ts';
import { withInnerShade } from '@core/assembly/innerShade.ts';
import {
  SHADE_MODULES,
  revolvedShadeParts,
  shadeModule,
  shadePartId,
  shadeRoleOfPart,
  standInRevolvedStyle,
  type ShadeModule,
  type ShadePart,
} from '@core/assembly/shades/index.ts';
import { applyToPoint, compose, rotationZ, translation } from '@core/assembly/transforms.ts';
import { buildPart } from '@core/geometry/build.ts';
import { dispose, type Kernel } from '@core/geometry/kernel.ts';
import { deriveHub } from '@core/geometry/parts/hub.ts';
import type { Assembly, PartSpec } from '@core/model/assembly.ts';
import type { HubParams, ShadeParams } from '@core/model/parts.ts';
import {
  PROJECT_VERSION,
  createDefaultProject,
  defaultMount,
  defaultShadeStyle,
  parseProject,
  revolvedStyle,
  serializeProject,
  shadeParamPath,
  shadeStyleForFamily,
  shadeToParams,
  type Project,
  type RevolvedStyle,
} from '@core/model/project.ts';
import {
  SHADE_FAMILIES,
  SHADE_FAMILY_DEFAULTS,
  SHADE_FAMILY_GROUPS,
  SHADE_FAMILY_PARAM_PATHS,
  isParamVisible,
  type ShadeFamily,
} from '@core/schema/defs.ts';
import { extraShadeParts, nodeOfPart, structuralParts } from '../../../src/app/store/nodes.ts';
import { getKernel } from '../../helpers/kernel.ts';

let k: Kernel;

beforeAll(async () => {
  k = await getKernel();
});

const example = (id: string): Project =>
  parseProject(
    readFileSync(new URL(`../../../src/examples/${id}.lamp.json`, import.meta.url), 'utf8'),
  );

/** The pendant example (cord, puck, bayonet) with the outer shade of `family`. */
function pendantAs(family: ShadeFamily, edit: (p: Project) => void = () => {}): Project {
  const p = example('pendant-cord');
  p.shades[0].style = shadeStyleForFamily(p.shades[0].style, family);
  edit(p);
  return p;
}

function shadeParams(a: Assembly, id = 'shade'): ShadeParams {
  const part = a.parts.find((p) => p.id === id);
  if (part?.kind !== 'shade') throw new Error(`no ${id}`);
  return part.params;
}

function part(a: Assembly, id: string): PartSpec {
  const p = a.parts.find((x) => x.id === id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

const codes = (a: Assembly) => a.warnings.map((w) => w.code);

function buildsAll(a: Assembly): void {
  for (const p of a.parts) {
    const { manifold, stats } = buildPart(k, p, 'draft');
    try {
      expect(stats.status, p.id).toBe('NoError');
      expect(stats.triangles, p.id).toBeGreaterThan(0);
    } finally {
      dispose(manifold);
    }
  }
}

describe('the shade style in the project', () => {
  it('has the four families with the plan’s defaults', () => {
    expect(SHADE_FAMILIES).toEqual(['revolved', 'tiered', 'slatted', 'geometric']);
    expect(defaultShadeStyle('tiered')).toEqual({
      family: 'tiered',
      tiers: 4,
      topDiameter: 120,
      bottomDiameter: 320,
      tierDrop: 28,
      overlap: 12,
      curve: 0.3,
      spacers: 3,
    });
    expect(defaultShadeStyle('slatted')).toEqual({
      family: 'slatted',
      topDiameter: 120,
      bottomDiameter: 200,
      height: 180,
      slatCount: 24,
      slatWidth: 12,
      slatThickness: 2.4,
      louvreAngle: 0,
      twist: 0,
      ringHeight: 8,
    });
    expect(defaultShadeStyle('geometric')).toEqual({
      family: 'geometric',
      variant: 'polyhedral',
      bottomDiameter: 180,
      topDiameter: 110,
      height: 140,
      sides: 8,
      twist: 20,
      pleatCount: 16,
      pleatDepth: 6,
      bands: 5,
      holeShape: 'hex',
      holeSize: 6,
      holePitch: 11,
    });
    // The revolved defaults are the classic shade's.
    expect(defaultShadeStyle('revolved')).toEqual(createDefaultProject().shades[0].style);
  });

  it.each(SHADE_FAMILIES)('parses and round-trips a %s outer and inner shade', (family) => {
    const p = withInnerShade(pendantAs(family));
    p.shades[1]!.style = shadeStyleForFamily(p.shades[1]!.style, family);
    expect(p.version).toBe(PROJECT_VERSION);
    expect(PROJECT_VERSION).toBe(3);
    const text = serializeProject(p);
    expect(parseProject(text)).toEqual(p);
    expect(serializeProject(parseProject(text))).toBe(text);
  });

  it('rejects an unknown family and a family without its fields', () => {
    const raw = JSON.parse(serializeProject(pendantAs('slatted'))) as {
      shades: { style: Record<string, unknown> }[];
    };
    const unknown = structuredClone(raw);
    unknown.shades[0]!.style.family = 'woven';
    expect(() => parseProject(JSON.stringify(unknown))).toThrow();
    const missing = structuredClone(raw);
    delete missing.shades[0]!.style.slatCount;
    expect(() => parseProject(JSON.stringify(missing))).toThrow();
  });

  it.each(SHADE_FAMILIES)(
    'maps every flat %s parameter to a field of its style (and back)',
    (family) => {
      const style = defaultShadeStyle(family);
      const paths = Object.values(SHADE_FAMILY_PARAM_PATHS[family]);
      const styleKeys = paths.filter((p) => p.startsWith('style.')).map((p) => p.slice(6));
      // Surface fields of the revolved style live one level deeper.
      const top = new Set(styleKeys.map((key) => key.split('.')[0]));
      expect([...top].sort()).toEqual(
        Object.keys(style)
          .filter((key) => key !== 'family')
          .sort(),
      );
      expect(paths).toContain('wallThickness');
      const flat = shadeToParams({ style, wallThickness: 0.8 });
      expect(flat).toEqual(SHADE_FAMILY_DEFAULTS[family]);
      // Every key is a parameter of the family's form, and its project path is under its shade.
      const keys = SHADE_FAMILY_GROUPS[family].flatMap((g) => g.params.map((d) => d.key));
      expect(keys.sort()).toEqual(Object.keys(flat).sort());
      for (const key of keys) {
        expect(shadeParamPath('inner', key, family)).toMatch(/^shades\.1\./);
      }
    },
  );

  it('shows each geometric form only its own fields', () => {
    const defs = SHADE_FAMILY_GROUPS.geometric.flatMap((g) => g.params);
    const shown = (variant: string) =>
      defs.filter((d) => isParamVisible(d, { geometricVariant: variant })).map((d) => d.key);
    expect(shown('polyhedral')).toEqual(expect.arrayContaining(['sides', 'geometricTwist']));
    expect(shown('polyhedral')).not.toContain('pleatCount');
    expect(shown('pleated')).toEqual(expect.arrayContaining(['pleatCount', 'pleatDepth', 'bands']));
    expect(shown('pleated')).not.toContain('holeSize');
    expect(shown('lattice')).toEqual(
      expect.arrayContaining(['holeShape', 'holeSize', 'holePitch']),
    );
    expect(shown('lattice')).not.toContain('sides');
  });
});

describe('shadeStyleForFamily', () => {
  const revolved = revolvedStyle(createDefaultProject().shades[0]);

  it('carries the diameters and the height over and takes the rest from the family’s defaults', () => {
    expect(shadeStyleForFamily(revolved, 'slatted')).toEqual({
      ...defaultShadeStyle('slatted'),
      bottomDiameter: 160,
      topDiameter: 92,
      height: 120,
    });
    expect(shadeStyleForFamily(revolved, 'geometric')).toEqual({
      ...defaultShadeStyle('geometric'),
      bottomDiameter: 160,
      topDiameter: 92,
      height: 120,
    });
    // A tiered shade has no height: its tiers make it.
    const tiered = shadeStyleForFamily(revolved, 'tiered');
    expect(tiered).toEqual({
      ...defaultShadeStyle('tiered'),
      bottomDiameter: 160,
      topDiameter: 92,
    });
    expect('height' in tiered).toBe(false);
    // … so back from tiered the new family's default height applies.
    expect(shadeStyleForFamily(tiered, 'slatted')).toMatchObject({
      bottomDiameter: 160,
      topDiameter: 92,
      height: defaultShadeStyle('slatted').height,
    });
    // And back to revolved: the classic defaults with the carried diameters and height.
    expect(shadeStyleForFamily(shadeStyleForFamily(revolved, 'slatted'), 'revolved')).toEqual(
      revolved,
    );
  });

  it('returns the same style when the family does not change', () => {
    expect(shadeStyleForFamily(revolved, 'revolved')).toBe(revolved);
    const slatted = defaultShadeStyle('slatted');
    expect(shadeStyleForFamily(slatted, 'slatted')).toBe(slatted);
  });

  it('clamps what it carries over to the new family’s ranges', () => {
    const small: RevolvedStyle = { ...revolved, bottomDiameter: 70, topDiameter: 66, height: 20 };
    expect(shadeStyleForFamily(small, 'tiered')).toMatchObject({
      bottomDiameter: 80,
      topDiameter: 66,
    });
    expect(shadeStyleForFamily(small, 'slatted')).toMatchObject({
      bottomDiameter: 70,
      topDiameter: 66,
      height: 40,
    });
  });
});

describe('the shade modules', () => {
  it('registers one module per family', () => {
    expect(Object.keys(SHADE_MODULES).sort()).toEqual([...SHADE_FAMILIES].sort());
    for (const family of SHADE_FAMILIES) expect(shadeModule(family).family).toBe(family);
    expect(SHADE_MODULES.tiered.partKinds).toEqual(['tier', 'spacer']);
    expect(SHADE_MODULES.revolved.pending).toBeUndefined();
    expect(SHADE_MODULES.slatted.pending).toBeUndefined();
  });

  it('dispatches each shade to its family’s builder params', () => {
    expect(shadeParams(assemble(example('pendant-cord'))).variant).toBe('revolved');
    const slatted = assemble(pendantAs('slatted'));
    expect(shadeParams(slatted)).toMatchObject({
      variant: 'slatted',
      bottomDiameter: 150,
      topDiameter: 136,
      height: 110,
      slatCount: 24,
    });
    expect(slatted.parts.map((p) => p.id)).toEqual(['hub', 'shade', 'canopy']);
    expect(codes(slatted).filter((c) => c !== 'plate-overflow')).toEqual([]);
  });

  it('widens every family’s top to clear the hub ring', () => {
    for (const family of SHADE_FAMILIES) {
      const a = assemble(
        pendantAs(family, (p) => {
          p.shades[0].style.topDiameter = 70;
        }),
      );
      const w = a.warnings.find((x) => x.paramPath === 'shades.0.style.topDiameter');
      expect(w, family).toMatchObject({ code: 'adjusted', partId: 'shade' });
    }
    // Where the collar top is the top Ø, exactly to the ring's need (78 mm for the kit's bayonet).
    for (const family of ['revolved', 'slatted'] as const) {
      const a = assemble(
        pendantAs(family, (p) => {
          p.shades[0].style.topDiameter = 70;
        }),
      );
      const params = shadeParams(a);
      expect(params.variant === 'fused' ? 0 : params.topDiameter, family).toBe(78);
    }
  });

  it('only fuses a revolved shade with the hub; any other family splits silently', () => {
    const fused = createDefaultProject();
    expect(assemble(fused).parts).toHaveLength(1);
    for (const family of ['tiered', 'slatted', 'geometric'] as const) {
      const p = createDefaultProject();
      p.shades[0].style = shadeStyleForFamily(p.shades[0].style, family);
      expect(p.hub.fused).toBe(true);
      const a = assemble(p, { quality: 'draft' });
      expect(a.parts[0]!.id).toBe('hub');
      expect(a.parts.map((x) => x.id)).toContain('shade');
      expect(a.parts.some((x) => x.kind === 'shade' && x.params.variant === 'fused')).toBe(false);
      expect(a.warnings.filter((w) => w.paramPath === 'hub.fused')).toEqual([]);
      expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    }
  });

  it('lets the inner shade be slatted: an info replaces the clearance check', () => {
    const p = withInnerShade(example('pendant-cord'));
    p.shades[1]!.style = shadeStyleForFamily(p.shades[1]!.style, 'slatted');
    const a = assemble(p, { quality: 'draft' });
    expect(shadeParams(a, INNER_SHADE_ID).variant).toBe('slatted');
    expect(codes(a)).not.toContain('shade-clearance');
    expect(a.warnings.find((w) => w.code === 'shade-clearance-unchecked')).toMatchObject({
      severity: 'info',
      partId: INNER_SHADE_ID,
      message: expect.stringContaining('slatted shades'),
    });
    expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    buildsAll(a);

    // Two revolved shades are still checked (no info).
    const both = assemble(withInnerShade(example('pendant-cord')), { quality: 'draft' });
    expect(codes(both)).not.toContain('shade-clearance-unchecked');
  });

  it('clamps another family’s inner shade at its own project paths', () => {
    const p = withInnerShade(example('pendant-cord'));
    p.shades[1]!.style = { ...defaultShadeStyle('slatted'), slatCount: 500 };
    const a = assemble(p, { quality: 'draft' });
    expect(a.warnings.find((w) => w.code === 'clamped')).toMatchObject({
      partId: INNER_SHADE_ID,
      paramPath: 'shades.1.style.slatCount',
    });
  });
});

describe('a shade of several parts', () => {
  /** A fake two-part family in the tiered slot: the stand-in plus a second ring 30 mm lower. */
  const fake: ShadeModule<'tiered'> = {
    family: 'tiered',
    partKinds: ['shade'],
    validate: () => [],
    collarTop: (ctx) => ctx.style.topDiameter,
    parts(ctx) {
      const base = revolvedShadeParts(ctx, standInRevolvedStyle(ctx.style));
      const first = base.parts[0]!;
      const second: ShadePart = {
        draft: { ...first.draft, id: shadePartId(ctx.id, 'tier2'), displayName: 'Tier 2' },
        transform: translation(0, 0, -base.zCollar - 30),
      };
      return { ...base, parts: [first, second], zBottom: base.zBottom - 30 };
    },
  };

  const modules = SHADE_MODULES as unknown as Record<string, ShadeModule>;
  const realTiered = modules.tiered!;

  function withFake<T>(run: () => T): T {
    const real = modules.tiered!;
    modules.tiered = fake as unknown as ShadeModule;
    try {
      return run();
    } finally {
      modules.tiered = real;
    }
  }

  const tiered = (p: Project): Project => {
    p.shades[0].style = shadeStyleForFamily(p.shades[0].style, 'tiered');
    return p;
  };

  it('hangs every part from a pendant in the shade frame', () => {
    const a = withFake(() => assemble(tiered(example('pendant-cord')), { quality: 'draft' }));
    expect(a.parts.map((p) => p.id)).toEqual(['hub', 'shade', 'shade-tier2', 'canopy']);
    const zCollar = a.derived.zCollar!;
    expect(part(a, 'shade').assembledTransform).toEqual(translation(0, 0, -zCollar));
    expect(part(a, 'shade-tier2').assembledTransform).toEqual(translation(0, 0, -zCollar - 30));
    expect(a.derived.bottomZ).toBeCloseTo(-zCollar - 30, 9);
    // Only the collar part says how the shade joins the hub.
    expect(part(a, 'shade').printNotes.some((n) => n.startsWith('Assembly:'))).toBe(true);
    expect(part(a, 'shade-tier2').printNotes.some((n) => n.startsWith('Assembly:'))).toBe(false);
  });

  it('turns every part over with the hub on a standing lamp', () => {
    const p = tiered(createDefaultProject({ id: 'test', updatedAt: '2026-10-21T00:00:00.000Z' }));
    p.mount = defaultMount('standing');
    const a = withFake(() => assemble(p, { quality: 'draft' }));
    const hub = part(a, 'hub');
    const hubParams = hub.params as HubParams;
    const hubZ = 22 + 400 + deriveHub(hubParams).zFace;
    const zCollar = a.derived.zCollar!;
    for (const [id, drop] of [
      ['shade', 0],
      ['shade-tier2', 30],
    ] as const) {
      const t = part(a, id).assembledTransform;
      expect(t).toEqual(compose(hub.assembledTransform, translation(0, 0, -zCollar - drop)));
      // Its open end (print z 0) is up, above the hub's light face.
      expect(applyToPoint(t, [0, 0, 0])[2]).toBeCloseTo(hubZ + zCollar + drop, 9);
    }
    expect(a.derived.topZ).toBeCloseTo(hubZ + zCollar + 30, 9);
  });

  describe('with copies of a part', () => {
    /** The fake family's second ring as three copies turned 0°, 120° and 240° about the axis. */
    const turns = [0, 120, 240];
    const copied: ShadeModule<'tiered'> = {
      ...fake,
      parts(ctx) {
        const base = fake.parts(ctx);
        const [first, second] = base.parts as [ShadePart, ShadePart];
        const copies = turns.map((deg) => compose(rotationZ(deg), second.transform));
        return {
          ...base,
          parts: [
            first,
            {
              draft: { ...second.draft, instances: copies.length },
              transform: copies[0]!,
              instanceTransforms: copies,
            },
          ],
        };
      },
    };
    function withCopied<T>(run: () => T): T {
      const real = modules.tiered!;
      modules.tiered = copied as unknown as ShadeModule;
      try {
        return run();
      } finally {
        modules.tiered = real;
      }
    }

    it('hangs every copy from a pendant and a wall arm in the shade frame', () => {
      for (const mount of ['ceilingCord', 'wallArm', 'ceilingStrap'] as const) {
        const p = tiered(example('pendant-cord'));
        p.mount = defaultMount(mount);
        const a = withCopied(() => assemble(p, { quality: 'draft' }));
        const ring = part(a, 'shade-tier2');
        const zCollar = a.derived.zCollar!;
        expect(ring.instances, mount).toBe(3);
        expect(ring.instanceTransforms, mount).toEqual(
          turns.map((deg) => compose(rotationZ(deg), translation(0, 0, -zCollar - 30))),
        );
        expect(ring.instanceTransforms[0], mount).toEqual(ring.assembledTransform);
        // The collar part has none.
        expect(part(a, 'shade').instanceTransforms, mount).toEqual([
          part(a, 'shade').assembledTransform,
        ]);
        expect(
          a.layout.placements.filter((x) => x.id === 'shade-tier2'),
          mount,
        ).toHaveLength(3);
      }
    });

    it('turns every copy over with the hub on a standing lamp', () => {
      const p = tiered(createDefaultProject({ id: 'test', updatedAt: '2026-10-21T00:00:00.000Z' }));
      p.mount = defaultMount('standing');
      const a = withCopied(() => assemble(p, { quality: 'draft' }));
      const hub = part(a, 'hub');
      const zCollar = a.derived.zCollar!;
      const ring = part(a, 'shade-tier2');
      expect(ring.instanceTransforms).toHaveLength(3);
      ring.instanceTransforms.forEach((m, j) => {
        const expected = compose(
          hub.assembledTransform,
          rotationZ(turns[j]!),
          translation(0, 0, -zCollar - 30),
        );
        m.forEach((v, i) => expect(v, `copy ${j}`).toBeCloseTo(expected[i]!, 9));
      });
      // The stem's own copies are still there.
      expect(part(a, 'stem').instanceTransforms.length).toBe(part(a, 'stem').instances);
    });
  });

  it('belongs to its shade’s node in the lamp tree', () => {
    const a = withFake(() => assemble(tiered(example('pendant-cord')), { quality: 'draft' }));
    expect(shadeRoleOfPart('shade-tier2')).toBe('outer');
    expect(shadeRoleOfPart('innerShade-tier2')).toBe('inner');
    expect(shadeRoleOfPart('stemFoot')).toBeUndefined();
    expect(nodeOfPart(part(a, 'shade-tier2'))).toBe('outerShade');
    expect(extraShadeParts('outerShade', a.parts).map((p) => p.id)).toEqual(['shade-tier2']);
    expect(structuralParts(a.parts).map((p) => p.id)).toEqual(['canopy']);
  });

  afterAll(() => {
    // The registry is back to the real module.
    expect(modules.tiered).toBe(realTiered);
  });
});
