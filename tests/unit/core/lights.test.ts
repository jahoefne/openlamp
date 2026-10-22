/**
 * The light sources beyond the puck: the E27 / E14 bulb in its lampholder
 * plate and the LED strip in its ring channel. Schema and presets, envelopes,
 * the hub around each (valid, leak-free, its key diameters, its vents, its
 * printability), the checks, the world-frame numbers for the ghosts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { BULB_AIR_ANNULUS, lightEnvelope, lightInsert } from '@core/assembly/lights/index.ts';
import { scoped, type CrossSection, type Kernel } from '@core/geometry/kernel.ts';
import { deriveHub, type HubDerived } from '@core/geometry/parts/hub.ts';
import { M10_NUT_RECESS, STRIP_CHANNEL_EXTRA } from '@core/geometry/parts/lightInserts.ts';
import type { Assembly, PartSpec } from '@core/model/assembly.ts';
import type { HubParams } from '@core/model/parts.ts';
import {
  LightSchema,
  createDefaultProject,
  defaultMount,
  lightChoiceOf,
  lightDefaults,
  lightForChoice,
  lightFromParams,
  lightParamPath,
  lightToParams,
  parseProject,
  revolvedStyle,
  serializeProject,
  withBulbPreset,
  type LightOf,
  type LightSource,
  type Project,
} from '@core/model/project.ts';
import {
  BULB_FITTINGS,
  BULB_PRESETS,
  BULB_SIZES,
  DEFAULT_VENTS,
  HUB_JOINT_GROUPS,
  LIGHT_DEFAULTS,
  LIGHT_DEFS,
  LIGHT_GROUPS,
  LIGHT_PARAM_PATHS,
  isParamVisible,
  type MountKind,
} from '@core/schema/defs.ts';
import { normalizeLightParams } from '@core/schema/normalize.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import {
  contourMaxRadii,
  contourMinRadii,
  maxOverhangDeg,
  withBuilt,
} from '../../helpers/parts.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

type Bulb = LightOf<'bulb'>;

/** The lights under test, by name. */
const LIGHTS: readonly [string, () => LightSource][] = [
  ['E27 shade ring', () => lightDefaults('bulb', 'E27', 'shadeRing')],
  ['E27 M10 nipple', () => lightDefaults('bulb', 'E27', 'm10Nipple')],
  ['E14 shade ring', () => lightDefaults('bulb', 'E14', 'shadeRing')],
  ['E14 M10 nipple', () => lightDefaults('bulb', 'E14', 'm10Nipple')],
  ['LED strip', () => lightDefaults('strip')],
];

/** The mounts with a closed face (the strap holds pucks only). */
const MOUNTS: readonly MountKind[] = ['ceilingCord', 'standing', 'wallArm'];

/** The default project split, with this light (and the vents it starts with) on this mount. */
function lamp(light: LightSource, mount: MountKind = 'ceilingCord'): Project {
  const p = createDefaultProject({ id: 'test', updatedAt: '2026-10-21T00:00:00.000Z' });
  p.hub.fused = false;
  p.light = light;
  p.hub.ventCount = DEFAULT_VENTS[light.kind];
  p.mount = defaultMount(mount);
  // A strip hub is a wide disc: the shade's top must clear its ring.
  if (light.kind === 'strip') {
    p.shades[0].style.topDiameter = 200;
    p.shades[0].style.bottomDiameter = 230;
  }
  return p;
}

function hubOf(a: Assembly): { part: PartSpec; params: HubParams; d: HubDerived } {
  const part = a.parts.find((p) => p.id === 'hub');
  if (part?.kind !== 'hub') throw new Error('no hub');
  return { part, params: part.params, d: deriveHub(part.params) };
}

/** Whether a point lies inside a section (even-odd over its contours). */
function inside(section: CrossSection, [px, py]: [number, number]): boolean {
  let hit = false;
  for (const poly of section.toPolygons()) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

type Tri = readonly (readonly number[])[];

/**
 * Triangles the print-frame overhang check leaves out: the shade joint's ring
 * (its grooves and entry slots are the joint's own, tested with the joint),
 * the twisted facets of a threaded mount face, and a strip hub's bridges
 * (the channel's ceiling and the collar slot's, flat and supported on both sides).
 */
function ignoredByOverhang(params: HubParams, d: HubDerived) {
  const face = params.mountFace;
  const L = d.ringHeight;
  const ring = (t: Tri) =>
    t.every((v) => Math.hypot(v[0]!, v[1]!) > d.collarInnerRadius - 0.05 && v[2]! < L + 0.01);
  const thread = (t: Tri) => {
    if (face.kind !== 'threadMale' && face.kind !== 'threadFemale') return false;
    const j = face.joint;
    const r0 = j.nominalDiameter / 2 - 0.5;
    const r1 = j.nominalDiameter / 2 + j.tolerance + j.thread!.depth + 1.6;
    return t.every((v) => {
      const r = Math.hypot(v[0]!, v[1]!);
      return r > r0 && r < r1 && v[2]! > d.zFace - j.length - 1;
    });
  };
  const flatAt = (t: Tri, z: number) => t.every((v) => Math.abs(v[2]! - z) < 1e-4);
  const bridge = (t: Tri) =>
    d.zChannel !== undefined && (flatAt(t, d.zChannel) || flatAt(t, L + 0.5));
  return (t: Tri) => ring(t) || thread(t) || bridge(t);
}

describe('schema and presets', () => {
  it('gives every bulb and strip parameter a project path, and the defaults parse', () => {
    for (const kind of ['bulb', 'strip'] as const) {
      const light = lightDefaults(kind);
      expect(LightSchema.parse(light)).toEqual(light);
      expect(lightToParams(light)).toEqual({ ...LIGHT_DEFAULTS[kind] });
      expect(lightFromParams(kind, LIGHT_DEFAULTS[kind])).toEqual(light);
      const fields = Object.keys(light).filter((key) => key !== 'kind');
      expect(Object.values(LIGHT_PARAM_PATHS[kind]).sort()).toEqual(fields.sort());
      expect(LIGHT_DEFS[kind].map((d) => d.key).sort()).toEqual(
        Object.keys(LIGHT_PARAM_PATHS[kind]).sort(),
      );
      expect(LIGHT_GROUPS[kind].length).toBeGreaterThan(0);
    }
    expect(lightParamPath('bulb', 'bulbHoleDiameter')).toBe('light.holeDiameter');
    expect(lightParamPath('strip', 'stripRingDiameter')).toBe('light.ringDiameter');
    expect(lightParamPath('puck', 'puckDiameter')).toBe('light.diameter');
    expect(lightParamPath('puck', 'height')).toBeUndefined();
  });

  it('presets the E27 and E14 lampholders by size and fitting', () => {
    expect(lightDefaults('bulb')).toMatchObject({
      size: 'E27',
      fitting: 'shadeRing',
      holeDiameter: 40.5,
      plateThickness: 3,
      skirtDiameter: 50,
      skirtHeight: 12,
      bulbDiameter: 60,
      bulbLength: 110,
      heatClearance: 15,
      cableDiameter: 6,
    });
    expect(lightDefaults('bulb', 'E14')).toMatchObject({
      holeDiameter: 28.5,
      skirtDiameter: 38,
      bulbDiameter: 35,
      bulbLength: 100,
    });
    for (const size of BULB_SIZES) {
      expect(lightDefaults('bulb', size, 'm10Nipple').holeDiameter).toBe(10.5);
      for (const fitting of BULB_FITTINGS) {
        expect(lightDefaults('bulb', size, fitting)).toMatchObject({
          skirtDiameter: BULB_PRESETS[size].skirtDiameter,
          holeDiameter: BULB_PRESETS[size].holeDiameter[fitting],
        });
      }
    }
    expect(lightDefaults('strip')).toMatchObject({
      stripWidth: 10,
      stripThickness: 2,
      ringDiameter: 120,
      channelDepth: 3.5,
      cableWidth: 4.5,
    });
  });

  it('a new size or fitting presets only the fields the user has not changed', () => {
    const e27: Bulb = { ...lightDefaults('bulb'), skirtDiameter: 56 };
    const e14 = withBulbPreset(e27, 'E14', 'shadeRing');
    expect(e14).toMatchObject({
      size: 'E14',
      holeDiameter: 28.5,
      skirtDiameter: 56, // edited: kept
      bulbDiameter: 35,
      bulbLength: 100,
    });
    expect(withBulbPreset(e14, 'E14', 'm10Nipple').holeDiameter).toBe(10.5);
    const drilled: Bulb = { ...e14, holeDiameter: 30 };
    expect(withBulbPreset(drilled, 'E14', 'm10Nipple').holeDiameter).toBe(30);
  });

  it('the Light select maps E27 / E14 onto a bulb of that size', () => {
    const puck = createDefaultProject().light;
    expect(lightChoiceOf(puck)).toBe('puck');
    expect(lightForChoice(puck, 'puck')).toBe(puck);
    const e27 = lightForChoice(puck, 'E27');
    expect(e27).toEqual(lightDefaults('bulb', 'E27'));
    expect(lightChoiceOf(e27)).toBe('E27');
    expect(lightForChoice(e27, 'E27')).toBe(e27);
    const edited = { ...(e27 as Bulb), heatClearance: 20, bulbLength: 120 };
    expect(lightForChoice(edited, 'E14')).toMatchObject({
      kind: 'bulb',
      size: 'E14',
      heatClearance: 20,
      bulbLength: 120,
      bulbDiameter: 35,
    });
    expect(lightForChoice(e27, 'strip')).toEqual(lightDefaults('strip'));
  });

  it('clamps bulb parameters with their project paths', () => {
    const { values, warnings } = normalizeLightParams('bulb', {
      ...LIGHT_DEFAULTS.bulb,
      bulbHoleDiameter: 90,
      bulbFitting: 'bayonet',
    });
    expect(values.bulbHoleDiameter).toBe(60);
    expect(values.bulbFitting).toBe('shadeRing');
    expect(warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['invalid-option', 'light.fitting'],
      ['clamped', 'light.holeDiameter'],
    ]);
  });

  it('shows the vents only for a split bulb hub', () => {
    const defs = HUB_JOINT_GROUPS.flatMap((g) => g.params);
    const shown = (values: Record<string, unknown>) =>
      defs.filter((d) => isParamVisible(d, values)).map((d) => d.key);
    expect(shown({ fused: false, lightKind: 'bulb' })).toContain('ventCount');
    expect(shown({ fused: false, lightKind: 'puck' })).not.toContain('ventCount');
    expect(shown({ fused: true, lightKind: 'bulb' })).not.toContain('ventCount');
  });

  it('round-trips bulb and strip projects through the file format (still version 3)', () => {
    for (const [, light] of LIGHTS) {
      const project = lamp(light());
      const text = serializeProject(project);
      expect(JSON.parse(text).version).toBe(3);
      expect(parseProject(text)).toEqual(project);
    }
  });
});

describe('light envelopes', () => {
  it('the bulb: the skirt plus the air annulus, axial cable, a heat zone below the hub', () => {
    const e27 = lightDefaults('bulb');
    expect(lightEnvelope(e27)).toEqual({
      rCore: 25 + BULB_AIR_ANNULUS,
      insertDepth: 12 + 3,
      cableDiameter: 6,
      cablePath: 'axial',
      // The glass (Ø60 at the far end of the 110 mm bulb) plus 15 mm, in the hub's frame.
      heatZone: { z0: -125, z1: -35, rMin: 45 },
    });
    const e14 = lightDefaults('bulb', 'E14', 'm10Nipple');
    expect(lightEnvelope(e14)).toMatchObject({
      rCore: 19 + BULB_AIR_ANNULUS,
      insertDepth: 12 + 3 + M10_NUT_RECESS.depth,
      heatZone: { z0: -115, z1: -50, rMin: 32.5 },
    });
  });

  it('the strip: ring + strip + two walls; the cable leaves sideways only under a strap', () => {
    const strip = lightDefaults('strip');
    const hub = { wallThickness: 2, collarWall: 2 };
    expect(lightEnvelope(strip, { ...hub, mount: 'ceilingCord' })).toEqual({
      rCore: 60 + 10 + 2 * 2,
      insertDepth: 3.5,
      cableDiameter: 4.5,
      cablePath: 'axial',
    });
    expect(lightEnvelope(strip, { ...hub, mount: 'ceilingStrap' }).cablePath).toBe('side');
    // A thick collar wall would reach into the channel's rim: the core grows.
    expect(lightEnvelope(strip, { wallThickness: 2, collarWall: 5 }).rCore).toBeGreaterThan(74);
  });

  it('the puck keeps its housing and has no heat zone', () => {
    const env = lightEnvelope(createDefaultProject().light);
    expect(env.rCore).toBeCloseTo(32.6, 9);
    expect(env.cablePath).toBe('side');
    expect(env.heatZone).toBeUndefined();
  });

  it('the inserts carry the hub wall and, for bulbs, the vents', () => {
    expect(lightInsert(lightDefaults('bulb'), { wallThickness: 2.4, ventCount: 6 })).toMatchObject({
      kind: 'bulb',
      wall: 2.4,
      vents: 6,
      height: 110,
    });
    expect(lightInsert(lightDefaults('strip'))).toMatchObject({
      kind: 'strip',
      channelWidth: 10 + STRIP_CHANNEL_EXTRA,
      height: 2,
    });
  });
});

describe.each(['draft', 'normal'] as const)('light hubs at %s quality', (quality) => {
  describe.each(LIGHTS)('%s', (_name, light) => {
    it.each(MOUNTS)('on the %s mount: a valid solid without leaks', (mount) => {
      const a = assemble(lamp(light(), mount), { quality });
      expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
      const { part, d } = hubOf(a);
      withBuilt(k, tracker, [part], quality, ([hub]) => {
        expect(hub!.stats.status).toBe('NoError');
        expect(hub!.stats.bbox.min[2]).toBeCloseTo(0, 6);
        expect(hub!.stats.bbox.max[2]).toBeCloseTo(d.hubHeight, 3);
        expect(hub!.stats.maxOverhangDeg).toBeLessThanOrEqual(45);
      });
    });
  });
});

describe('the bulb hub', () => {
  it.each(LIGHTS.slice(0, 4))('%s: the plate hole, the skirt and the nut recess', (_n, light) => {
    const bulb = light() as Bulb;
    const a = assemble(lamp(bulb), { quality: 'normal' });
    const { part, d } = hubOf(a);
    withBuilt(k, tracker, [part], 'normal', ([hub]) => {
      scoped(k, (s) => {
        const m = hub!.manifold;
        // Through the plate: the lampholder's hole is the innermost contour.
        const plate = s.add(m.slice(bulb.skirtHeight + bulb.plateThickness / 2));
        expect(contourMinRadii(plate)[0]).toBeCloseTo(bulb.holeDiameter / 2, 2);
        // Near the bed: the skirt (Ø skirtDiameter) inside the air annulus.
        const skirt = contourMaxRadii(s.add(m.slice(1)));
        expect(skirt).toContainEqual(expect.closeTo(bulb.skirtDiameter / 2, 2));
        expect(d.rSkirt).toBe(bulb.skirtDiameter / 2);
        const above = s.add(m.slice(d.zFloor + M10_NUT_RECESS.depth / 2));
        if (bulb.fitting === 'm10Nipple') {
          // The hexagonal recess: Ø19 across corners, 19·cos 30° across flats.
          const hex = contourMaxRadii(above).find((r) => Math.abs(r - 9.5) < 0.01);
          expect(hex).toBeCloseTo(M10_NUT_RECESS.diameter / 2, 2);
          expect(contourMinRadii(above)).toContainEqual(
            expect.closeTo((M10_NUT_RECESS.diameter / 2) * Math.cos(Math.PI / 6), 2),
          );
        } else {
          expect(contourMaxRadii(above).some((r) => Math.abs(r - 9.5) < 0.05)).toBe(false);
        }
      });
    });
  });

  it.each([
    ['E27', 8],
    ['E14', 8],
    ['E27', 5],
    ['E27', 0],
  ] as const)('%s with %i vents: the shoulder splits into one piece per vent', (size, vents) => {
    const p = lamp(lightDefaults('bulb', size));
    p.hub.ventCount = vents;
    const a = assemble(p, { quality: 'normal' });
    const { part, d } = hubOf(a);
    withBuilt(k, tracker, [part], 'normal', ([hub]) => {
      scoped(k, (s) => {
        // Halfway up the shoulder: the vents cut its thin shell into arcs; the skirt is one more piece.
        const section = s.add(hub!.manifold.slice((d.ringHeight + d.zBossStart) / 2));
        const pieces = section.decompose().map((c) => s.add(c));
        expect(pieces).toHaveLength(vents === 0 ? 2 : vents + 1);
      });
    });
  });

  it('the cable runs through the bore of a threaded mount face', () => {
    const a = assemble(lamp(lightDefaults('bulb'), 'wallArm'), { quality: 'normal' });
    const { part, params, d } = hubOf(a);
    const face = params.mountFace;
    if (face.kind !== 'threadMale') throw new Error('no stub');
    withBuilt(k, tracker, [part], 'normal', ([hub]) => {
      scoped(k, (s) => {
        const stub = s.add(hub!.manifold.slice(d.zFace + 6));
        expect(contourMinRadii(stub)[0]).toBeCloseTo((face.cableDiameter + 1) / 2, 1);
        // Down through the roof into the chamber above the plate.
        const dome = s.add(hub!.manifold.slice(d.zApex - 0.5));
        expect(inside(dome, [0, 0])).toBe(false);
      });
    });
  });
});

describe('the strip hub', () => {
  it('opens the ring channel stripWidth + 0.4 wide at ringDiameter on the light face', () => {
    const strip = lightDefaults('strip');
    const a = assemble(lamp(strip), { quality: 'normal' });
    const { part, d } = hubOf(a);
    expect(d.rChannelInner).toBe(60);
    withBuilt(k, tracker, [part], 'normal', ([hub]) => {
      scoped(k, (s) => {
        const section = s.add(hub!.manifold.slice(strip.channelDepth / 2));
        const inner = contourMaxRadii(section).find((r) => Math.abs(r - 60) < 0.1);
        const outer = contourMinRadii(section).find((r) => Math.abs(r - 70.4) < 0.1);
        expect(inner).toBeDefined();
        expect(outer! - inner!).toBeCloseTo(strip.stripWidth + STRIP_CHANNEL_EXTRA, 1);
        // The channel itself is open; the disc on both sides of it is solid.
        expect(inside(section, [0, 65])).toBe(false);
        expect(inside(section, [0, 55])).toBe(true);
        expect(inside(section, [0, 72])).toBe(true);
      });
    });
  });

  it('leads the cable up through the channel ceiling and into the boss', () => {
    const a = assemble(lamp(lightDefaults('strip')), { quality: 'normal' });
    const { part, d } = hubOf(a);
    withBuilt(k, tracker, [part], 'normal', ([hub]) => {
      scoped(k, (s) => {
        const m = hub!.manifold;
        // In the channel's ceiling: the slot on +X, solid ceiling elsewhere.
        const ceiling = s.add(m.slice((d.zChannel! + d.discThickness!) / 2));
        expect(inside(ceiling, [65, 0])).toBe(false);
        expect(inside(ceiling, [0, 65])).toBe(true);
        // In the boss, just above the disc: the side opening on +X into the pocket.
        const boss = s.add(m.slice(d.innerThickness! + 1));
        expect(inside(boss, [d.rPocket + 1, 0])).toBe(false);
        expect(inside(boss, [0, d.rPocket + 1])).toBe(true);
        // The pocket is open to the light face (the cord's knot is tied from below).
        expect(inside(s.add(m.slice(0.5)), [0, 0])).toBe(false);
      });
    });
  });
});

describe('printability in the print frame (light face down)', () => {
  it.each(LIGHTS.flatMap(([name, light]) => MOUNTS.map((m) => [name, light, m] as const)))(
    '%s on the %s mount: no overhang beyond 45° (bridges, the joint ring and threads aside)',
    (_name, light, mount) => {
      const a = assemble(lamp(light(), mount), { quality: 'normal' });
      const { part, params, d } = hubOf(a);
      withBuilt(k, tracker, [part], 'normal', ([hub]) => {
        expect(hub!.stats.maxOverhangDeg).toBeLessThanOrEqual(45);
        expect(
          maxOverhangDeg(hub!.manifold, { ignore: ignoredByOverhang(params, d) }),
        ).toBeLessThanOrEqual(45 + 0.5);
      });
    },
  );

  it('the puck hub reports at most 45° too', () => {
    const p = lamp(createDefaultProject().light);
    const { part } = hubOf(assemble(p, { quality: 'draft' }));
    withBuilt(k, tracker, [part], 'draft', ([hub]) => {
      expect(hub!.stats.maxOverhangDeg).toBeLessThanOrEqual(45);
    });
  });
});

describe('validation', () => {
  const codes = (a: Assembly) => a.warnings.map((w) => `${w.severity}:${w.code}`);

  it.each([
    ['a bulb', lightDefaults('bulb')],
    ['a strip', lightDefaults('strip')],
  ] as const)('the velcro strap with %s is an error (and the lamp is not fused)', (_n, light) => {
    const p = lamp(light, 'ceilingStrap');
    p.hub.fused = true;
    const a = assemble(p, { quality: 'draft' });
    expect(a.warnings).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'mount-light', paramPath: 'mount.kind' }),
    );
    expect(a.parts.map((x) => x.id)).toEqual(['hub', 'shade']);
  });

  it('a bulb: LED only and PETG (info), heat clearance and zone, the cable through the face', () => {
    const p = lamp(lightDefaults('bulb'));
    if (p.mount.kind !== 'ceilingCord') throw new Error('no cord');
    p.mount.cordDiameter = 6;
    expect(codes(assemble(p))).toEqual(expect.arrayContaining(['info:bulb-led']));
    expect(codes(assemble(p))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/heat|light-cable/)]),
    );
    const close = { ...(p.light as Bulb), heatClearance: 6 };
    expect(codes(assemble({ ...p, light: close }))).toContain('info:heat-clearance');
    // A stubby bulb: its glass (plus the clearance) reaches up into the hub.
    const stubby = { ...(p.light as Bulb), bulbLength: 60 };
    expect(codes(assemble({ ...p, light: stubby }))).toContain('warning:heat-zone');
    // On the default Ø4 cord the Ø6 cable does not pass the boss.
    p.mount.cordDiameter = 4;
    expect(assemble(p).warnings).toContainEqual(
      expect.objectContaining({ code: 'light-cable', paramPath: 'mount.cordDiameter' }),
    );
    const nipple = { ...lightDefaults('bulb', 'E27', 'm10Nipple'), cableDiameter: 8 };
    expect(assemble({ ...p, light: nipple }).warnings).toContainEqual(
      expect.objectContaining({ code: 'light-cable', paramPath: 'light.cableDiameter' }),
    );
  });

  it('adjusts a nipple hole the nut would slip through, a skirt too small, a shallow channel', () => {
    const nipple = {
      ...lightDefaults('bulb', 'E27', 'm10Nipple'),
      holeDiameter: 20,
      skirtDiameter: 24,
    };
    const a = assemble(lamp(nipple), { quality: 'draft' });
    const { params } = hubOf(a);
    if (params.insert.kind !== 'bulb') throw new Error('no bulb');
    expect(params.insert.holeDiameter).toBe(13);
    expect(params.insert.skirtDiameter).toBeGreaterThanOrEqual(
      M10_NUT_RECESS.diameter + 2 * (M10_NUT_RECESS.wall + 0.5) + 2 * 2,
    );
    expect(a.warnings.map((w) => w.paramPath)).toEqual(
      expect.arrayContaining(['light.holeDiameter', 'light.skirtDiameter']),
    );
    const shallow = { ...lightDefaults('strip'), stripThickness: 4, channelDepth: 3 };
    const b = assemble(lamp(shallow), { quality: 'draft' });
    const strip = hubOf(b).params.insert;
    expect(strip.kind === 'strip' && strip.channelDepth).toBe(4.5);
    expect(b.warnings).toContainEqual(
      expect.objectContaining({ code: 'adjusted', paramPath: 'light.channelDepth' }),
    );
  });

  it('notes LED and PETG, the nut, the strip and the cable in the hub print notes', () => {
    const notes = (light: LightSource, mount: MountKind = 'ceilingCord') =>
      hubOf(assemble(lamp(light, mount))).part.printNotes.join('\n');
    expect(notes(lightDefaults('bulb'))).toMatch(/LED bulbs only.*PETG/);
    expect(notes(lightDefaults('bulb'))).toMatch(/shade ring/);
    expect(notes(lightDefaults('bulb', 'E14', 'm10Nipple'))).toMatch(/Pause the print at z ≈ \d+/);
    expect(notes(lightDefaults('strip'))).toMatch(/Stick the LED strip into the ring channel/);
    expect(notes(lightDefaults('strip'), 'standing')).toMatch(/bore in the mount face/);
    expect(notes(createDefaultProject().light, 'wallArm')).toMatch(
      /its cable runs up through the bore/,
    );
  });
});

describe('world-frame numbers for the ghosts', () => {
  it('a hanging bulb hangs from the light face; its heat zone below it', () => {
    const a = assemble(lamp(lightDefaults('bulb')));
    expect(a.derived).toMatchObject({
      bulbCapZ: 0,
      bulbZ: -55,
      bulbDiameter: 60,
      bulbLength: 110,
      bulbCapDiameter: 27,
      heatZoneZ0: -125,
      heatZoneZ1: -35,
      heatZoneRadius: 45,
    });
    expect(a.derived.puckZ).toBeUndefined();
  });

  it('a standing bulb points up from the turned-over hub', () => {
    const a = assemble(lamp(lightDefaults('bulb'), 'standing'));
    const hubZ = a.derived.hubZ!;
    expect(a.derived.bulbCapZ).toBeCloseTo(hubZ, 9);
    expect(a.derived.bulbZ).toBeCloseTo(hubZ + 55, 9);
    expect(a.derived.heatZoneZ1).toBeCloseTo(hubZ + 125, 9);
    expect(a.derived.puckZ).toBeUndefined();
  });

  it('the strip ring sits in its channel; a long bulb lowers the lamp bottom', () => {
    const strip = assemble(lamp(lightDefaults('strip')));
    expect(strip.derived).toMatchObject({
      stripZ: 3.5 - 1,
      stripRingDiameter: 120,
      stripWidth: 10,
      stripThickness: 2,
    });
    const p = lamp({ ...lightDefaults('bulb'), bulbLength: 250 });
    revolvedStyle(p.shades[0]).height = 60;
    const a = assemble(p);
    expect(a.derived.bottomZ).toBeCloseTo(-250, 9);
  });
});
