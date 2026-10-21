/**
 * The inner shade (M2.4): two concentric collar joints, the hub's second
 * ring, both shades hanging from the hub, and the checks between them.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INNER_SHADE_ID, assemble } from '@core/assembly/assemble.ts';
import { defaultInnerShade, withInnerShade, withoutInnerShade } from '@core/assembly/innerShade.ts';
import {
  INNER_SHADE_JOINT_ID,
  MIN_COLLAR_AIR,
  autoCollarDiameter,
  minShadeTopDiameter,
  resolveShadeJoint,
  resolveShadeJoints,
} from '@core/assembly/interfaces.ts';
import { lightEnvelope } from '@core/assembly/lights/index.ts';
import { applyToPoint } from '@core/assembly/transforms.ts';
import { buildPart } from '@core/geometry/build.ts';
import { dispose, scoped, type Kernel, type Manifold } from '@core/geometry/kernel.ts';
import { deriveHub } from '@core/geometry/parts/hub.ts';
import { deriveRevolvedShade, revolvedShadeRadii } from '@core/geometry/parts/shades/revolved.ts';
import type { Quality } from '@core/geometry/quality.ts';
import {
  SHADE_JOINT_TYPES,
  type Assembly,
  type PartSpec,
  type ShadeJointType,
} from '@core/model/assembly.ts';
import type { HubParams, RevolvedShadeParams } from '@core/model/parts.ts';
import {
  createDefaultProject,
  parseProject,
  serializeProject,
  type Project,
} from '@core/model/project.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import { assembled, byId, contourMinRadii, withBuilt } from '../../helpers/parts.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

const example = (id: string): Project =>
  parseProject(
    readFileSync(new URL(`../../../src/examples/${id}.lamp.json`, import.meta.url), 'utf8'),
  );

/** The pendant example (cord, puck, bayonet) with an inner shade added. */
function pendantWithInner(edit: (p: Project) => void = () => {}): Project {
  const p = withInnerShade(example('pendant-cord'));
  edit(p);
  return p;
}

function hubParamsOf(a: Assembly): HubParams {
  const part = a.parts.find((p) => p.id === 'hub');
  if (part?.kind !== 'hub') throw new Error('no hub');
  return part.params;
}

function shadeParamsOf(a: Assembly, id: string): RevolvedShadeParams {
  const part = a.parts.find((p) => p.id === id);
  if (part?.kind !== 'shade' || part.params.variant !== 'revolved') throw new Error(`no ${id}`);
  return part.params;
}

const codes = (a: Assembly) => a.warnings.map((w) => w.code);

describe('the project with an inner shade', () => {
  it('parses and round-trips [outer, inner]; an inner shade first or two outer shades do not', () => {
    const p = pendantWithInner();
    expect(p.shades.map((s) => s.role)).toEqual(['outer', 'inner']);
    expect(parseProject(serializeProject(p))).toEqual(p);
    const swapped = JSON.parse(serializeProject(p)) as { shades: unknown[] };
    swapped.shades.reverse();
    expect(() => parseProject(JSON.stringify(swapped))).toThrow();
    const twoOuter = JSON.parse(serializeProject(p)) as { shades: { role: string }[] };
    twoOuter.shades[1]!.role = 'outer';
    expect(() => parseProject(JSON.stringify(twoOuter))).toThrow();
  });

  it('gets a default inner shade scaled to fit inside the outer one, smooth and white', () => {
    const base = example('pendant-cord');
    const inner = defaultInnerShade(base);
    const outer = base.shades[0].style;
    const inset = 2 * base.hub.radialGap + 2 * base.shades[0].wallThickness;
    expect(inner).toMatchObject({ role: 'inner', colour: '#ffffff', wallThickness: 0.8 });
    expect(inner.style.bottomDiameter).toBe(Math.floor(outer.bottomDiameter - inset));
    expect(inner.style.topDiameter).toBe(Math.floor(outer.topDiameter - inset));
    expect(inner.style.height).toBe(outer.height - 10);
    expect(inner.style.surface.style).toBe('smooth');
    expect(inner.style.curve).toBe(outer.curve);
    // Adding one splits a fused lamp; removing it keeps the rest.
    const fused = createDefaultProject();
    expect(fused.hub.fused).toBe(true);
    const split = withInnerShade(fused);
    expect(split.hub.fused).toBe(false);
    expect(split.shades).toHaveLength(2);
    expect(withInnerShade(split)).toBe(split);
    expect(withoutInnerShade(split).shades).toEqual([fused.shades[0]]);
  });

  it('keeps a default inner top wide enough for its collar ring', () => {
    const p = createDefaultProject(); // top Ø 92: 92 − 17.6 < 78
    const inner = defaultInnerShade(p);
    const a = assemble(withInnerShade(p), { quality: 'draft' });
    expect(inner.style.topDiameter).toBe(
      Math.ceil(minShadeTopDiameter(shadeParamsOf(a, INNER_SHADE_ID).collar) - 1e-9),
    );
  });
});

describe('the shade joints with an inner shade', () => {
  const p = createDefaultProject();
  const envelope = lightEnvelope(p.light);
  const ids = { outer: 'shade', inner: 'innerShade', female: 'hub' };

  it('keeps the single shade on exactly today’s collar', () => {
    const single = resolveShadeJoints(p.joints, p.hub, envelope, { outer: {} }, ids);
    const today = resolveShadeJoint(
      p.joints,
      p.hub,
      envelope,
      {},
      { male: 'shade', female: 'hub' },
    );
    expect(single.outer).toEqual(today);
    expect(single.inner).toBeUndefined();
    expect(single.outer.iface.nominalDiameter).toBeCloseTo(68.2, 9);
    expect(single.outer.collar.seatRadius).toBeCloseTo(38, 9);
  });

  it.each(SHADE_JOINT_TYPES)(
    'puts the inner %s collar where the light asks and moves the outer one out by the gap',
    (type) => {
      const joints = { ...p.joints, shadeToHub: type };
      const r = resolveShadeJoints(joints, p.hub, envelope, { outer: {}, inner: {} }, ids);
      const inner = r.inner!;
      expect(inner.iface).toMatchObject({ id: INNER_SHADE_JOINT_ID, type, male: 'innerShade' });
      expect(r.outer.iface).toMatchObject({ id: 'shadeToHub', type, male: 'shade', female: 'hub' });
      expect(inner.iface.nominalDiameter).toBe(autoCollarDiameter(envelope));
      const depth = { bayonet: 1.6, snap: 0, thread: 0.8 }[type];
      // D_out = D_in + 2·(collarWall + depth + radialGap)
      expect(r.outer.iface.nominalDiameter).toBeCloseTo(
        inner.iface.nominalDiameter + 2 * (p.hub.collarWall + depth + p.hub.radialGap),
        9,
      );
      // The air between the two hub rings is the radial gap.
      expect(r.outer.collar.ringInnerRadius - inner.collar.seatRadius).toBeCloseTo(
        p.hub.radialGap,
        9,
      );
      expect(r.radialGap).toBe(p.hub.radialGap);
      expect(r.warnings).toEqual([]);
    },
  );

  it('raises a radial gap that would bring the outer collar too close to the inner ring', () => {
    const r = resolveShadeJoints(
      p.joints,
      { ...p.hub, radialGap: 2 },
      envelope,
      { outer: {}, inner: {} },
      ids,
    );
    const min = p.hub.collarWall + p.joints.tolerance + MIN_COLLAR_AIR;
    expect(r.radialGap).toBeCloseTo(min, 9);
    expect(r.warnings.map((w) => [w.code, w.paramPath])).toEqual([['adjusted', 'hub.radialGap']]);
    // The outer collar's bore keeps MIN_COLLAR_AIR away from the inner ring.
    const bore = r.outer.collar.radius - r.outer.collar.wall;
    expect(bore - r.inner!.collar.seatRadius).toBeCloseTo(MIN_COLLAR_AIR, 9);
  });

  it('lets either shade enlarge its own collar, never shrink it', () => {
    const r = resolveShadeJoints(
      p.joints,
      p.hub,
      envelope,
      { outer: { collarDiameter: 100 }, inner: { collarDiameter: 50 } },
      ids,
    );
    expect(r.outer.iface.nominalDiameter).toBe(100);
    expect(r.inner!.iface.nominalDiameter).toBeCloseTo(68.2, 9);
    expect(r.warnings.map((w) => w.paramPath)).toEqual(['shades.1.collarDiameter']);
  });
});

describe('assemble with an inner shade', () => {
  it('adds the inner shade on its own joint, both joints copied into the hub', () => {
    const a = assemble(pendantWithInner(), { quality: 'draft' });
    expect(a.parts.map((x) => [x.id, x.kind, x.displayName])).toEqual([
      ['hub', 'hub', 'Hub'],
      ['shade', 'shade', 'Shade'],
      ['innerShade', 'shade', 'Inner shade'],
      ['canopy', 'canopy', 'Canopy'],
    ]);
    expect(a.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
    const hub = hubParamsOf(a);
    const outer = shadeParamsOf(a, 'shade');
    const inner = shadeParamsOf(a, INNER_SHADE_ID);
    expect(a.interfaces.innerShadeToHub).toMatchObject({ male: 'innerShade', female: 'hub' });
    expect(hub.joint).toEqual(a.interfaces.shadeToHub);
    expect(hub.innerJoint).toEqual(a.interfaces.innerShadeToHub);
    expect(outer.joint).toEqual(a.interfaces.shadeToHub);
    expect(inner.joint).toEqual(a.interfaces.innerShadeToHub);
    expect(outer.collar).toEqual(hub.collar);
    expect(inner.collar).toEqual(hub.innerCollar);
    expect(a.interfaces.innerShadeToHub!.nominalDiameter).toBeCloseTo(68.2, 9);
    expect(a.interfaces.shadeToHub!.nominalDiameter).toBeCloseTo(68.2 + 2 * (2 + 1.6 + 8), 9);
    // The inner shade keeps its own colour; both hang with their collar plane at z 0.
    expect(a.parts[2]!.colour).toBe('#ffffff');
    for (const id of ['shade', INNER_SHADE_ID]) {
      const part = a.parts.find((x) => x.id === id)!;
      const zCollar = deriveRevolvedShade(shadeParamsOf(a, id)).zCollar;
      expect(applyToPoint(part.assembledTransform, [0, 0, zCollar])[2]).toBeCloseTo(0, 9);
    }
    expect(a.derived.innerCollarDiameter).toBeCloseTo(68.2, 9);
    expect(a.derived.bottomZ).toBeCloseTo(
      -Math.max(a.derived.zCollar!, a.derived.innerZCollar!),
      9,
    );
    expect(a.parts[2]!.printNotes.at(-1)).toContain('first');
  });

  it('leaves the single-shade lamp as it was', () => {
    const a = assemble(example('pendant-cord'), { quality: 'draft' });
    expect(a.parts.map((x) => x.id)).toEqual(['hub', 'shade', 'canopy']);
    expect(a.interfaces.innerShadeToHub).toBeUndefined();
    const hub = hubParamsOf(a);
    expect('innerCollar' in hub || 'innerJoint' in hub).toBe(false);
    expect(hub.collar.radius).toBeCloseTo(34.1, 9);
    expect(a.derived.innerZCollar).toBeUndefined();
  });

  it('widens the outer top for its larger collar and the inner top for its ring, with warnings', () => {
    const a = assemble(withInnerShade(example('pendant-cord')), { quality: 'draft' });
    expect(codes(a)).not.toContain('adjusted');
    const narrow = assemble(
      pendantWithInner((p) => {
        p.shades[0].style.topDiameter = 96;
        p.shades[1]!.style.topDiameter = 70;
      }),
      { quality: 'draft' },
    );
    const outer = shadeParamsOf(narrow, 'shade');
    const inner = shadeParamsOf(narrow, INNER_SHADE_ID);
    expect(outer.topDiameter).toBe(Math.ceil(minShadeTopDiameter(outer.collar) - 1e-9));
    expect(inner.topDiameter).toBe(Math.ceil(minShadeTopDiameter(inner.collar) - 1e-9));
    expect(
      narrow.warnings.filter((w) => w.code === 'adjusted').map((w) => [w.paramPath, w.partId]),
    ).toEqual([
      ['shades.0.style.topDiameter', 'shade'],
      ['shades.1.style.topDiameter', 'innerShade'],
    ]);
  });

  it('clamps the inner shade’s parameters with their project paths', () => {
    const a = assemble(
      pendantWithInner((p) => {
        p.shades[1]!.style.height = 1000;
      }),
      { quality: 'draft' },
    );
    expect(a.warnings.find((w) => w.code === 'clamped')).toMatchObject({
      paramPath: 'shades.1.style.height',
      partId: 'innerShade',
    });
    expect(shadeParamsOf(a, INNER_SHADE_ID).height).toBe(300);
  });

  it('is an error with the single-piece print, which then leaves the inner shade out', () => {
    const p = createDefaultProject();
    p.shades = [p.shades[0], defaultInnerShade(p)];
    expect(p.hub.fused).toBe(true);
    const a = assemble(p, { quality: 'draft' });
    expect(a.parts.map((x) => x.id)).toEqual(['shade']);
    const errors = a.warnings.filter((w) => w.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'inner-shade-fused', paramPath: 'hub.fused' });
    expect(errors[0]!.message).toMatch(/an inner shade needs a separate hub/i);
    // Other mounts never fuse, so they just split.
    expect(codes(assemble(pendantWithInner((q) => (q.hub.fused = true))))).not.toContain(
      'inner-shade-fused',
    );
  });

  it("prints the outer shade joint's test pair in fit-test mode", () => {
    const a = assemble(
      pendantWithInner((p) => {
        p.fitTest = true;
      }),
      { quality: 'draft' },
    );
    expect(a.parts.map((x) => x.id)).toEqual(['fitMale', 'fitFemale']);
    const full = assemble(pendantWithInner(), { quality: 'draft' });
    expect(a.interfaces.shadeToHub!.nominalDiameter).toBe(
      full.interfaces.shadeToHub!.nominalDiameter,
    );
  });

  it('flips both shades with the hub on a standing lamp', () => {
    const a = assemble(withInnerShade(example('table-lamp')), { quality: 'draft' });
    const hub = a.parts.find((x) => x.id === 'hub')!;
    const hubZ = a.derived.hubZ!;
    for (const id of ['shade', INNER_SHADE_ID]) {
      const part = a.parts.find((x) => x.id === id)!;
      const zCollar = deriveRevolvedShade(shadeParamsOf(a, id)).zCollar;
      // Turned over (z → −z), the collar plane on the hub's light face …
      expect(part.assembledTransform[10]).toBeCloseTo(-1, 9);
      const collar = applyToPoint(part.assembledTransform, [0, 0, zCollar]);
      expect(collar[2]).toBeCloseTo(applyToPoint(hub.assembledTransform, [0, 0, 0])[2]!, 9);
      // … and the open end up above it.
      expect(applyToPoint(part.assembledTransform, [0, 0, 0])[2]).toBeCloseTo(hubZ + zCollar, 9);
    }
    expect(a.derived.topZ).toBeCloseTo(
      hubZ + Math.max(a.derived.zCollar!, a.derived.innerZCollar!),
      9,
    );
    expect(a.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
  });
});

describe('the checks between the shades', () => {
  /** Straight smooth drums: the outer Ø140 × 100, the inner `d` × 90, 0.8 mm walls. */
  const drums = (d: number) =>
    pendantWithInner((p) => {
      const [outer, inner] = p.shades;
      outer.style = {
        ...outer.style,
        bottomDiameter: 140,
        topDiameter: 140,
        height: 100,
        curve: 0,
      };
      outer.style.surface = { ...outer.style.surface, style: 'smooth' };
      inner!.style = { ...inner!.style, bottomDiameter: d, topDiameter: d, height: 90, curve: 0 };
    });

  it('samples a straight drum’s radii exactly', () => {
    const a = assemble(drums(134), { quality: 'draft' });
    const outer = revolvedShadeRadii(shadeParamsOf(a, 'shade'));
    expect(outer.outerAt(50)).toBeCloseTo(70, 9);
    expect(outer.innerAt(50)).toBeCloseTo(69.2, 9);
    const inner = revolvedShadeRadii(shadeParamsOf(a, INNER_SHADE_ID));
    expect(inner.outerAt(50)).toBeCloseTo(67, 9);
    // Just under the collar plane: the outer collar's bore and the inner seat.
    expect(outer.innerAt(outer.derived.zCollar - 0.01)).toBeCloseTo(outer.derived.rCollarBore, 9);
    expect(inner.outerAt(inner.derived.zCollar - 0.01)).toBeCloseTo(inner.derived.rSeat, 9);
  });

  it('warns when the inner shade comes 1 mm too close to the outer one', () => {
    // 69.2 − 67 = 2.2 mm of clearance: fine.
    expect(codes(assemble(drums(134), { quality: 'draft' }))).not.toContain('shade-clearance');
    // 69.2 − 68.2 = 1 mm, one short of the 2 mm the check asks for.
    const close = assemble(drums(136.4), { quality: 'draft' });
    expect(close.warnings.find((w) => w.code === 'shade-clearance')).toMatchObject({
      severity: 'warning',
      partId: 'innerShade',
      paramPath: 'shades.1.style.bottomDiameter',
    });
    expect(close.warnings.find((w) => w.code === 'shade-clearance')!.message).toContain('1 mm');
    // Ribs count: 1.6 mm deep ribs on the outer shade's inside reach 0.8 mm closer.
    const ribbed = drums(134);
    ribbed.shades[0].style.surface.style = 'ribbed';
    ribbed.shades[0].style.surface.ribDepth = 1.6;
    expect(codes(assemble(ribbed, { quality: 'draft' }))).toContain('shade-clearance');
  });

  it('says so when the inner shade hangs out below the outer one', () => {
    const a = assemble(
      pendantWithInner((p) => {
        p.shades[1]!.style.height = p.shades[0].style.height + 20;
        p.shades[1]!.style.bottomDiameter -= 20;
      }),
      { quality: 'draft' },
    );
    expect(a.warnings.find((w) => w.code === 'inner-shade-longer')).toMatchObject({
      severity: 'info',
      paramPath: 'shades.1.style.height',
    });
  });

  it('warns when the inner shade reaches into a bulb’s heat zone', () => {
    const fits = assemble(withInnerShade(example('e27-pendant')), { quality: 'draft' });
    expect(codes(fits)).not.toContain('heat-zone');
    expect(fits.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
    const narrow = withInnerShade(example('e27-pendant'));
    narrow.shades[1]!.style = {
      ...narrow.shades[1]!.style,
      bottomDiameter: 80,
      topDiameter: 80,
      curve: 0,
    };
    const a = assemble(narrow, { quality: 'draft' });
    expect(a.warnings.find((w) => w.code === 'heat-zone')).toMatchObject({
      severity: 'warning',
      partId: 'innerShade',
    });
  });

  it('notes a strip hub’s long bridge between its two rings', () => {
    const p = withInnerShade(example('strip-drum'));
    expect(codes(assemble(p, { quality: 'draft' }))).not.toContain('bridge');
    p.hub.radialGap = 14;
    expect(codes(assemble(p, { quality: 'draft' }))).toContain('bridge');
  });
});

/** The pendant with an inner shade on a joint of `type`. */
function pendantOn(type: ShadeJointType): Project {
  return pendantWithInner((p) => {
    p.joints.shadeToHub = type;
  });
}

const QUALITIES: readonly Quality[] = ['draft', 'normal'];

describe.each(SHADE_JOINT_TYPES)('the hub with two collar rings (%s)', (type) => {
  it.each(QUALITIES)('builds the hub and both shades as valid solids at %s quality', (quality) => {
    const a = assemble(pendantOn(type), { quality });
    const parts = a.parts.filter((x) => ['hub', 'shade', INNER_SHADE_ID].includes(x.id));
    withBuilt(k, tracker, parts, quality, (built) => {
      for (const b of built) expect(b.stats.status, b.part.id).toBe('NoError');
      const hub = byId(built, 'hub');
      expect(hub.stats.derived).toEqual(deriveHub(hub.part.params as HubParams));
      const pieces = hub.manifold.decompose();
      expect(pieces).toHaveLength(1);
      for (const m of pieces) m.delete();
    });
  });

  it('holds each collar with its clearance, and nothing overlaps when assembled', () => {
    const a = assemble(pendantOn(type), { quality: 'normal' });
    const parts = a.parts.filter((x) => ['hub', 'shade', INNER_SHADE_ID].includes(x.id));
    const outerIface = a.interfaces.shadeToHub!;
    const innerIface = a.interfaces.innerShadeToHub!;
    withBuilt(k, tracker, parts, 'normal', (built) => {
      const hub = byId(built, 'hub');
      scoped(k, (s) => {
        const outer = s.add(assembled(byId(built, 'shade')));
        const inner = s.add(assembled(byId(built, INNER_SHADE_ID)));
        // Halfway up the collars: the inner ring's bore and outside, the outer ring's.
        const z = outerIface.length / 2 + 1e-3;
        const rings = contourMinRadii(s.add(hub.manifold.slice(z)));
        expect(rings).toHaveLength(4);
        const innerCollar = contourMinRadii(s.add(inner.slice(z)));
        const outerCollar = contourMinRadii(s.add(outer.slice(z)));
        expect(innerCollar).toHaveLength(2);
        expect(outerCollar).toHaveLength(2);
        expect(Math.abs(rings[0]! - innerCollar[1]! - innerIface.tolerance)).toBeLessThan(0.005);
        expect(Math.abs(rings[2]! - outerCollar[1]! - outerIface.tolerance)).toBeLessThan(0.005);
        // The outer collar stands in the air between the rings.
        expect(outerCollar[0]! - rings[1]!).toBeGreaterThan(MIN_COLLAR_AIR - 0.01);

        const overlap = (m: Manifold) => s.add(k.Manifold.intersection(hub.manifold, m)).volume();
        expect(overlap(outer)).toBeLessThan(1);
        expect(overlap(inner)).toBeLessThan(1);
        if (type !== 'snap') {
          expect(overlap(outer)).toBeLessThan(1e-3);
          expect(overlap(inner)).toBeLessThan(1e-3);
        }
        expect(s.add(k.Manifold.intersection(outer, inner)).volume()).toBe(0);
      });
    });
  });
});

describe('a thread joint cuts only its ring', () => {
  it.each(['strip-drum', 'e27-pendant'])('keeps %s’s hub in one piece', (id) => {
    const volume = (type: ShadeJointType) => {
      const p = example(id);
      p.joints.shadeToHub = type;
      const hub: PartSpec = assemble(p, { quality: 'draft' }).parts.find((x) => x.id === 'hub')!;
      const { manifold, stats } = buildPart(k, hub, 'draft');
      try {
        expect(stats.status).toBe('NoError');
        const pieces = manifold.decompose();
        const n = pieces.length;
        pieces.forEach((m) => m.delete());
        expect(n).toBe(1);
        return stats.volumeMm3;
      } finally {
        dispose(manifold);
      }
    };
    // The thread's ring differs from the bayonet's, the disc / skirt inside it stays.
    expect(volume('thread') / volume('bayonet')).toBeGreaterThan(0.9);
  });
});
