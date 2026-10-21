/**
 * The standing lamp: assembly (snapshot, stem segments, placement on the
 * floor, normalisation, validation), the stem's threads into each other and
 * into the hub, the base (cable groove, screw pockets, printability) and its lid.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import {
  STEM_FLANGE,
  standingDefaults,
  standingMount,
  stemLayout,
} from '@core/assembly/mounts/standing.ts';
import { applyToPoint } from '@core/assembly/transforms.ts';
import { screwPositions } from '@core/geometry/joints/screw.ts';
import { scoped, type CrossSection, type Kernel, type Manifold } from '@core/geometry/kernel.ts';
import { deriveBase } from '@core/geometry/parts/base.ts';
import { deriveBaseLid } from '@core/geometry/parts/baseLid.ts';
import { deriveHub } from '@core/geometry/parts/hub.ts';
import { deriveStem } from '@core/geometry/parts/stem.ts';
import type { Assembly, PartSpec } from '@core/model/assembly.ts';
import type { BaseLidParams, BaseParams, HubParams, StemParams } from '@core/model/parts.ts';
import {
  createDefaultProject,
  defaultMount,
  parseProject,
  type MountOf,
  type Project,
} from '@core/model/project.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import {
  assembled,
  byId,
  contourMaxRadii,
  contourMinRadii,
  maxOverhangDeg,
  withBuilt,
  type Built,
} from '../../helpers/parts.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

type StandingMount = MountOf<'standing'>;

/** The default project on the default table-lamp mount (Bambu Lab A1). */
function standing(edit: (mount: StandingMount, p: Project) => void = () => {}): Project {
  const p = createDefaultProject({
    id: 'test',
    name: 'Test',
    updatedAt: '2026-10-21T00:00:00.000Z',
  });
  const mount = defaultMount('standing');
  edit(mount, p);
  p.mount = mount;
  return p;
}

/** The assembly without the numbers that only restate the params (as in assemble.test.ts). */
function summary(a: Assembly) {
  return {
    parts: a.parts.map(({ buildKey, ...part }) => ({ ...part, buildKeyLength: buildKey.length })),
    interfaces: a.interfaces,
    layout: a.layout,
    derived: a.derived,
    context: a.context,
    warnings: a.warnings,
  };
}

function part<K extends PartSpec['kind']>(a: Assembly, id: string, kind: K) {
  const p = a.parts.find((x) => x.id === id);
  if (p?.kind !== kind) throw new Error(`no ${kind} ${id}`);
  return p as Extract<PartSpec, { kind: K }>;
}

const hubParams = (a: Assembly): HubParams => part(a, 'hub', 'hub').params;
const stemParams = (a: Assembly, id = 'stem'): StemParams => part(a, id, 'stem').params;
const baseParams = (a: Assembly): BaseParams => part(a, 'base', 'base').params;
const lidParams = (a: Assembly): BaseLidParams => part(a, 'baseLid', 'baseLid').params;

const tall = (totalHeight: number, segmentLength: number) => (m: StandingMount) => {
  m.stem.totalHeight = totalHeight;
  m.stem.segmentLength = segmentLength;
};
const screwedLid = (m: StandingMount) => {
  m.base.lid = 'screws';
};

/** Centres of a section's small (screw hole) contours, by angle. */
function holeCentres(section: CrossSection, maxRadius: number): [number, number][] {
  return section
    .toPolygons()
    .map((poly) => {
      const cx = poly.reduce((sum, [x]) => sum + x, 0) / poly.length;
      const cy = poly.reduce((sum, [, y]) => sum + y, 0) / poly.length;
      const r = Math.max(...poly.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      return { c: [cx, cy] as [number, number], r };
    })
    .filter(({ c, r }) => r < maxRadius && Math.hypot(c[0], c[1]) > maxRadius)
    .map(({ c }) => c)
    .sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
}

/** Triangles of a twist-extruded thread: every vertex within the band of its teeth (see maxOverhangDeg). */
const inBand = (r0: number, r1: number) => (tri: readonly (readonly number[])[]) =>
  tri.every((v) => {
    const r = Math.hypot(v[0]!, v[1]!);
    return r > r0 - 0.05 && r < r1 + 0.05;
  });

describe('assemble (standing lamp)', () => {
  it('stands the hub and the shade on a stem of two segments and a weighted base', () => {
    const a = assemble(standing());
    expect(a.parts.map((x) => [x.id, x.kind, x.displayName, x.instances])).toEqual([
      ['hub', 'hub', 'Hub', 1],
      ['shade', 'shade', 'Shade', 1],
      ['stem', 'stem', 'Stem segment', 1],
      ['stemFoot', 'stem', 'Stem foot', 1],
      ['base', 'base', 'Base', 1],
      ['baseLid', 'baseLid', 'Base lid', 1],
    ]);
    expect(Object.keys(a.interfaces)).toEqual([
      'shadeToHub',
      'stemToHub',
      'stemToStem',
      'stemToBase',
    ]);
    expect(a.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
    expect(a.warnings.map((w) => w.code)).not.toContain('mount-pending');
    expect(standingMount.partKinds).toEqual(['stem', 'base', 'baseLid']);

    // The hub's female bore and the top segment's male thread: the same thread.
    const face = hubParams(a).mountFace;
    if (face.kind !== 'threadFemale') throw new Error('no bore');
    const { stemToHub, stemToStem, stemToBase } = a.interfaces;
    expect(face.joint).toEqual(stemToHub);
    expect(stemToHub).toMatchObject({
      type: 'thread',
      nominalDiameter: 20,
      length: 14,
      tolerance: 0.3,
      thread: { pitch: 2.5, depth: 0.8, flank: 45, hand: 'right' },
      male: 'stem',
      female: 'hub',
    });
    expect(stemToStem).toEqual({
      ...stemToHub,
      id: 'stemToStem',
      male: 'stemFoot',
      female: 'stem',
    });
    expect(stemToBase).toMatchObject({
      type: 'screw',
      nominalDiameter: 28 + STEM_FLANGE.boltCircleExtra,
      screw: { count: 4, hole: 3.4, counterbore: [6, 0], insertPocket: [4, 6] },
      male: 'stemFoot',
      female: 'base',
    });

    const segment = stemParams(a);
    expect(segment).toMatchObject({ variant: 'segment', length: 200, diameter: 28 });
    expect(segment.top).toEqual(stemToStem);
    expect(segment.bottom).toEqual(stemToStem);
    expect(segment.boreDiameter).toBe(7);
    const foot = stemParams(a, 'stemFoot');
    expect(foot).toMatchObject({ variant: 'base', length: 200, top: stemToStem });
    expect(foot.flange).toEqual({ diameter: 48, thickness: 4, screws: stemToBase });
    expect(baseParams(a).stemScrews).toEqual(stemToBase);
    expect(lidParams(a)).toMatchObject({ lid: 'snap', thickness: 3, tolerance: 0.2 });
    // Segment + thread: 214 mm tall, the bed-fit path checks it against the A1's 256.
    expect(part(a, 'stem', 'stem').bedFootprint).toEqual({ x: 28, y: 28, z: 214 });
    expect(part(a, 'stemFoot', 'stem').bedFootprint).toEqual({ x: 48, y: 48, z: 214 });
  });

  it.each([
    [400, 200, 2, 200],
    [450, 200, 3, 150],
    [1300, 220, 6, 1300 / 6],
    [150, 200, 1, 150],
  ])('splits a %s mm stem of %s mm segments into %s equal ones', (total, seg, count, length) => {
    expect(
      stemLayout({
        stem: { ...defaultMount('standing').stem, totalHeight: total, segmentLength: seg },
      }),
    ).toEqual({ count, length });
    const a = assemble(standing(tall(total, seg)));
    const stems = a.parts.filter((x) => x.kind === 'stem');
    expect(stems.reduce((n, x) => n + x.instances, 0)).toBe(count);
    for (const s of stems) {
      if (s.kind !== 'stem') continue;
      expect(s.params.length).toBeCloseTo(length, 9);
      expect(s.bedFootprint!.z).toBeCloseTo(length + 14, 9);
    }
    expect(a.derived).toMatchObject({ stemSegments: count, stemSegmentLength: length });
    if (count === 1) {
      // One segment: the foot itself, its thread straight into the hub.
      expect(stems.map((x) => [x.id, x.displayName])).toEqual([['stem', 'Stem']]);
      expect(stemParams(a)).toMatchObject({ variant: 'base', top: a.interfaces.stemToHub });
      expect(a.interfaces.stemToStem).toBeUndefined();
      expect(a.interfaces.stemToBase!.male).toBe('stem');
    } else {
      // The segments above the foot are one part (one buildKey) printed count − 1 times.
      expect(stems.map((x) => [x.id, x.instances])).toEqual([
        ['stem', count - 1],
        ['stemFoot', 1],
      ]);
      expect(stems[0]!.displayName).toBe(count > 2 ? `Stem segment ×${count - 1}` : 'Stem segment');
    }
  });

  it('turns the hub over onto the top of the stem, the shade with it (open end up)', () => {
    const a = assemble(standing());
    const hd = deriveHub(hubParams(a));
    const stemTop = 22 + 400;
    const hubZ = stemTop + hd.zFace;
    const hub = part(a, 'hub', 'hub');
    expect(hub.assembledTransform).toEqual([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, hubZ, 1]);
    // The hub's mount face on the stem's top, its collar plane (light face) above.
    expect(applyToPoint(hub.assembledTransform, [0, 0, hd.zFace])[2]).toBeCloseTo(stemTop, 9);
    const shade = part(a, 'shade', 'shade');
    const zCollar = a.derived.zCollar!;
    expect(applyToPoint(shade.assembledTransform, [0, 0, zCollar])[2]).toBeCloseTo(hubZ, 9);
    expect(applyToPoint(shade.assembledTransform, [0, 0, 0])[2]).toBeCloseTo(hubZ + zCollar, 9);
    // The stem stands on the base, which stands on the floor (both turned for print).
    expect(part(a, 'stemFoot', 'stem').assembledTransform).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 22, 1,
    ]);
    expect(applyToPoint(part(a, 'stem', 'stem').assembledTransform, [0, 0, 0])[2]).toBe(222);
    expect(applyToPoint(part(a, 'base', 'base').assembledTransform, [0, 0, 0])[2]).toBe(22);
    expect(applyToPoint(part(a, 'base', 'base').assembledTransform, [0, 0, 22])[2]).toBe(0);
    expect(applyToPoint(part(a, 'baseLid', 'baseLid').assembledTransform, [0, 0, 3])[2]).toBe(0);

    expect(a.context).toEqual({ kind: 'floor', floorZ: 0 });
    expect(a.derived).toMatchObject({
      floorZ: 0,
      bottomZ: 0,
      baseHeight: 22,
      baseDiameter: 180,
      stemZ0: 22,
      stemZ1: stemTop,
      hubZ,
      topZ: hubZ + zCollar,
      // The puck in the turned-over hub: its top now at hubZ − zPuck.
      puckZ: hubZ - hd.zPuck - 8,
      puckDiameter: 59,
      puckHeight: 8,
    });
    expect(a.derived.ceilingZ).toBeUndefined();
  });

  it('keeps only the hub in fit-test mode, standing on the floor as on the stem', () => {
    const a = assemble(
      standing((_m, p) => {
        p.fitTest = true;
      }),
    );
    expect(a.parts.map((x) => x.id)).toEqual(['hub']);
    const hd = deriveHub(hubParams(a));
    expect(a.derived).toMatchObject({ bottomZ: 0, hubZ: hd.zFace, floorZ: 0 });
    expect(a.context.kind).toBe('floor');
  });

  it('screws the lid on with three screws into bosses when asked', () => {
    const a = assemble(standing(screwedLid));
    expect(Object.keys(a.interfaces)).toContain('lidToBase');
    const joint = a.interfaces.lidToBase!;
    expect(joint).toMatchObject({
      type: 'screw',
      screw: { count: 3, hole: 3.4, counterbore: [6, 3] },
      male: 'baseLid',
      female: 'base',
    });
    expect(joint.screw!.insertPocket).toBeUndefined();
    expect(baseParams(a).lidJoint).toEqual(joint);
    expect(lidParams(a)).toMatchObject({ lid: 'screws', thickness: 4.5, joint });
    // The bolt circle runs through the middle of the pocket.
    const d = deriveBase(baseParams(a));
    expect(joint.nominalDiameter).toBeCloseTo(d.rIn + d.rOut, 9);
    expect(a.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
  });

  it('keeps the weight pocket under a top skin and above the lid', () => {
    const deep = standingMount.normalize!({
      ...defaultMount('standing'),
      base: { diameter: 180, height: 20, pocketDepth: 40, lid: 'snap' },
    });
    expect(deep.mount.base.pocketDepth).toBe(17);
    expect(deep.warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['adjusted', 'mount.base.pocketDepth'],
    ]);
    const shallow = standingMount.normalize!({
      ...defaultMount('standing'),
      base: { diameter: 180, height: 20, pocketDepth: 4, lid: 'screws' },
    });
    expect(shallow.mount.base.pocketDepth).toBe(7.5);
    const ok = standingMount.normalize!(defaultMount('standing'));
    expect(ok.warnings).toEqual([]);
    expect(ok.mount).toEqual(defaultMount('standing'));
  });

  it('raises a stem too thin for the Ø20 threads, with a warning', () => {
    const a = assemble(
      standing((m) => {
        m.stem.diameter = 18;
      }),
    );
    // Root Ø20 + 2 × (0.3 clearance + 0.8 deep + 0.5 countersink + 1.6 wall).
    expect(stemParams(a).diameter).toBe(26.5);
    expect(stemParams(a, 'stemFoot').diameter).toBe(26.5);
    expect(a.warnings).toContainEqual(
      expect.objectContaining({ code: 'adjusted', paramPath: 'mount.stem.diameter' }),
    );
  });

  it('warns (bed fit) when a segment plus its thread is taller than the bed', () => {
    // 300 + 14 mm on the A1's 256 mm Z.
    const a = assemble(standing(tall(300, 300)));
    expect(a.warnings).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'bed-fit', partId: 'stem' }),
    );
    expect(a.warnings.find((w) => w.code === 'bed-fit')!.message).toContain('too large in Z');
    expect(a.warnings).toContainEqual(
      expect.objectContaining({ code: 'stem-bed', paramPath: 'mount.stem.segmentLength' }),
    );
    // A 450 mm segment is beyond the schema (clamped to 320 mm, which still warns).
    const long = assemble(standing(tall(450, 450)));
    expect(long.warnings).toContainEqual(
      expect.objectContaining({ code: 'clamped', paramPath: 'mount.stem.segmentLength' }),
    );
    expect(
      stemLayout({
        stem: { ...defaultMount('standing').stem, totalHeight: 450, segmentLength: 320 },
      }),
    ).toEqual({ count: 2, length: 225 });
    // 242 + 14 = 256 fits exactly.
    const fits = assemble(standing(tall(242, 300)));
    expect(fits.warnings.filter((w) => w.code === 'bed-fit')).toEqual([]);
  });

  it('a floor lamp: taller stem, Ø280 base, which does not fit the A1 (bed fit)', () => {
    const floor = standingDefaults('floor');
    expect(floor).toMatchObject({
      variant: 'floor',
      base: { diameter: 280 },
      stem: { totalHeight: 1300 },
    });
    expect(standingDefaults('table')).toEqual(defaultMount('standing'));
    const p = standing();
    p.mount = floor;
    const a = assemble(p);
    expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    const bedFit = a.warnings.filter((w) => w.code === 'bed-fit').map((w) => w.partId);
    expect(bedFit).toEqual(expect.arrayContaining(['base', 'baseLid']));
    expect(bedFit).not.toContain('stem');
    expect(a.warnings.find((w) => w.code === 'base-bed')!.message).toContain('floor lamp');
    // On a large-format printer it fits.
    p.printer = { ...p.printer, id: 'big', bed: [350, 350, 350] };
    expect(assemble(p).warnings.filter((w) => w.code === 'bed-fit')).toEqual([]);
  });

  it('matches the table-lamp snapshot', () => {
    expect(summary(assemble(standing()))).toMatchSnapshot();
  });

  it.each([
    ['the standing fixture', '../../fixtures/v3-standing.lamp.json'],
    ['the table-lamp example', '../../../src/examples/table-lamp.lamp.json'],
  ])('assembles %s without errors', (_name, path) => {
    const project = parseProject(readFileSync(new URL(path, import.meta.url), 'utf8'));
    expect(project.mount.kind).toBe('standing');
    const a = assemble(project, { quality: 'draft' });
    expect(a.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    expect(a.parts.map((x) => x.kind)).toEqual(['hub', 'shade', 'stem', 'stem', 'base', 'baseLid']);
  });
});

describe.each(['draft', 'normal'] as const)('the standing parts at %s quality', (quality) => {
  it.each([
    ['snap', (m: StandingMount) => m],
    ['screws', screwedLid],
    ['heat-set-free', (_m: StandingMount, p: Project) => (p.joints.heatSet = false)],
  ] as const)('build as valid solids without leaks (%s)', (_name, edit) => {
    const a = assemble(standing(edit), { quality });
    withBuilt(k, tracker, a.parts, quality, (built) => {
      for (const b of built) {
        expect(b.stats.status, b.part.id).toBe('NoError');
        expect(b.stats.bbox.min[2], b.part.id).toBeCloseTo(0, 6);
        expect(b.stats.bbox.max[2], b.part.id).toBeLessThanOrEqual(b.part.bedFootprint!.z + 1e-6);
        expect(b.stats.bbox.max[0] - b.stats.bbox.min[0], b.part.id).toBeLessThanOrEqual(
          b.part.bedFootprint!.x + 1e-6,
        );
      }
      expect(built.map((b) => b.part.id)).toEqual([
        'hub',
        'shade',
        'stem',
        'stemFoot',
        'base',
        'baseLid',
      ]);
    });
  });
});

/** In the assembled lamp: their overlap (mm³), and the radial clearance at height z (bore − male root). */
function mate(female: Manifold, male: Manifold, z: number) {
  return scoped(k, (s) => {
    const overlap = s.add(k.Manifold.intersection(female, male)).volume();
    const bore = contourMinRadii(s.add(female.slice(z)))[0]!;
    // The male's contours from the inside out: the cable bore, the thread's root.
    const root = contourMinRadii(s.add(male.slice(z)));
    expect(root).toHaveLength(2);
    return { overlap, clearance: bore - root[1]! };
  });
}

describe('the stem threads', () => {
  it('the top segment screws into the hub (no overlap, clearance = tolerance)', () => {
    const a = assemble(standing(), { quality: 'normal' });
    const parts = a.parts.filter((x) => x.id === 'hub' || x.id === 'stem');
    const tol = a.interfaces.stemToHub!.tolerance;
    withBuilt(k, tracker, parts, 'normal', (built) => {
      scoped(k, (s) => {
        const hub = s.add(assembled(byId(built, 'hub')));
        const stem = s.add(assembled(byId(built, 'stem')));
        const { overlap, clearance } = mate(hub, stem, a.derived.stemZ1! + 7 + 1e-3);
        expect(overlap).toBeLessThan(1);
        expect(overlap).toBeLessThan(1e-3);
        expect(Math.abs(clearance - tol)).toBeLessThan(0.01);
        // The stem's top is the hub's mount face.
        expect(stem.boundingBox().max[2]).toBeCloseTo(a.derived.stemZ1! + 14, 3);
        expect(hub.boundingBox().min[2]).toBeCloseTo(a.derived.stemZ1!, 3);
      });
    });
  });

  it.each([2, 3])('%s segments screw into each other (no overlap, clearance = tolerance)', (n) => {
    const a = assemble(standing(tall(n * 150, 150)), { quality: 'normal' });
    const tol = a.interfaces.stemToStem!.tolerance;
    const parts = a.parts.filter((x) => x.kind === 'stem');
    withBuilt(k, tracker, parts, 'normal', (built) => {
      scoped(k, (s) => {
        const foot = s.add(assembled(byId(built, 'stemFoot')));
        // The segments' part is shown as the top one; the others sit 150 mm lower each.
        const top = s.add(assembled(byId(built, 'stem')));
        const segments = Array.from({ length: n - 1 }, (_, i) =>
          s.add(top.translate([0, 0, -150 * (n - 2 - i)])),
        );
        const stack = [foot, ...segments];
        for (let i = 0; i + 1 < stack.length; i++) {
          const z = 22 + 150 * (i + 1) + 7 + 1e-3;
          const { overlap, clearance } = mate(stack[i + 1]!, stack[i]!, z);
          expect(overlap, `joint ${i}`).toBeLessThan(1e-3);
          expect(Math.abs(clearance - tol), `joint ${i}`).toBeLessThan(0.01);
        }
      });
    });
  });

  it('print upright without overhangs beyond 45° (thread facets aside)', () => {
    const a = assemble(standing(), { quality: 'normal' });
    const parts = a.parts.filter((x) => x.kind === 'stem');
    withBuilt(k, tracker, parts, 'normal', (built) => {
      for (const b of built) {
        if (b.part.kind !== 'stem') continue;
        const d = deriveStem(b.part.params);
        const depth = b.part.params.top.thread!.depth;
        // The male's teeth from its root, the female's to its crest.
        const thread = inBand(d.rThread, Math.max(d.rThread, d.rFemale) + depth);
        expect(maxOverhangDeg(b.manifold, { ignore: thread }), b.part.id).toBeLessThanOrEqual(45.5);
        expect(b.stats.maxOverhangDeg).toBeLessThanOrEqual(45);
        scoped(k, (s) => {
          // The cable bore runs all the way through (above the female thread).
          const zs = [d.length / 2, d.height - 1, ...(d.rFemale > 0 ? [] : [1])];
          for (const z of zs) {
            expect(
              contourMinRadii(s.add(b.manifold.slice(z)))[0],
              `${b.part.id} z ${z}`,
            ).toBeCloseTo(d.rBore, 1);
          }
        });
      }
    });
  });
});

describe('the base', () => {
  function withBase(
    edit: (m: StandingMount, p: Project) => void,
    check: (built: Built[], a: Assembly) => void,
  ) {
    const a = assemble(standing(edit), { quality: 'normal' });
    const parts = a.parts.filter((x) => ['base', 'baseLid', 'stemFoot'].includes(x.id));
    withBuilt(k, tracker, parts, 'normal', (built) => check(built, a));
  }

  it.each(['snap', 'screws'] as const)(
    'prints top face down without overhangs beyond 45° (%s lid), the lid flat',
    (lid) => {
      withBase(
        (m) => {
          m.base.lid = lid;
        },
        (built) => {
          const base = byId(built, 'base');
          expect(maxOverhangDeg(base.manifold)).toBeLessThanOrEqual(45.5);
          expect(base.stats.maxOverhangDeg).toBeLessThanOrEqual(45);
          const lidPart = byId(built, 'baseLid');
          expect(lidPart.stats.status).toBe('NoError');
          expect(maxOverhangDeg(lidPart.manifold)).toBeLessThanOrEqual(0.5);
        },
      );
    },
  );

  it('runs the cable from the central bore through the groove out of the rim', () => {
    withBase(
      () => {},
      (built, a) => {
        const p = baseParams(a);
        const d = deriveBase(p);
        const { depth } = p.cableGroove;
        expect(p.cableGroove).toEqual({ width: 7, depth: 7, spokeWidth: 14 });
        scoped(k, (s) => {
          const base = s.add(assembled(byId(built, 'base')));
          // At the groove's height: one outline that reaches from the bore to
          // the rim (the groove opens both), and the pocket inside it.
          const low = s.add(base.slice(depth / 2));
          expect(low.toPolygons()).toHaveLength(2);
          expect(contourMinRadii(low)[0]).toBeCloseTo(d.rBore, 1);
          expect(contourMaxRadii(low)[1]).toBeCloseTo(d.R, 1);
          // Above it: the outline, the pocket and the bore, apart.
          const high = s.add(base.slice(depth + 1));
          expect(high.toPolygons()).toHaveLength(3);
          const radii = contourMinRadii(high);
          expect(radii[0]).toBeCloseTo(d.rBore, 1);
          expect(radii[2]).toBeCloseTo(d.R, 0);
        });
      },
    );
  });

  it('has its screw pockets under the holes of the stem foot', () => {
    withBase(
      () => {},
      (built, a) => {
        const H = baseParams(a).height;
        const joint = a.interfaces.stemToBase!;
        const expected = screwPositions(joint).sort(
          (p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]),
        );
        scoped(k, (s) => {
          const base = s.add(assembled(byId(built, 'base')));
          const foot = s.add(assembled(byId(built, 'stemFoot')));
          const pockets = holeCentres(s.add(base.slice(H - 1)), 3);
          const holes = holeCentres(s.add(foot.slice(H + 2)), 3);
          expect(pockets).toHaveLength(4);
          expect(holes).toHaveLength(4);
          for (let i = 0; i < 4; i++) {
            const [x, y] = expected[i]!;
            expect(Math.hypot(pockets[i]![0] - x, pockets[i]![1] - y)).toBeLessThan(0.05);
            expect(Math.hypot(holes[i]![0] - x, holes[i]![1] - y)).toBeLessThan(0.05);
          }
          // The foot stands on the base's top face; they only touch.
          expect(s.add(k.Manifold.intersection(base, foot)).volume()).toBeLessThan(1e-3);
          // Heat-set pockets Ø4 × 6 (a 45° point beyond).
          const pocket = s.add(base.slice(H - 3));
          const small = pocket
            .toPolygons()
            .filter((poly) => Math.max(...poly.map(([x, y]) => Math.hypot(x, y))) > 15)
            .map((poly) => {
              const xs = poly.map(([x]) => x);
              return Math.max(...xs) - Math.min(...xs);
            })
            .filter((w) => w < 6);
          expect(small).toHaveLength(4);
          for (const w of small) expect(w).toBeCloseTo(4, 1);
        });
      },
    );
  });

  it.each(['snap', 'screws'] as const)('closes the pocket with the %s lid', (lid) => {
    withBase(
      (m) => {
        m.base.lid = lid;
      },
      (built, a) => {
        const d = deriveBase(baseParams(a));
        const ld = deriveBaseLid(lidParams(a));
        scoped(k, (s) => {
          const base = s.add(assembled(byId(built, 'base')));
          const lidM = s.add(assembled(byId(built, 'baseLid')));
          // Flush with the floor, inside the pocket's mouth.
          const bb = lidM.boundingBox();
          expect(bb.min[2]).toBeCloseTo(0, 6);
          expect(bb.max[2]).toBeCloseTo(ld.thickness, 6);
          // Only the snap lid's crush ribs bite (a sliver).
          const overlap = s.add(k.Manifold.intersection(base, lidM)).volume();
          expect(overlap).toBeLessThan(lid === 'snap' ? 1 : 1e-3);
          if (lid === 'snap') expect(overlap).toBeGreaterThan(0);
          // The ring's outer edge is the clearance inside the pocket's wall.
          expect(ld.rOuter).toBeCloseTo(d.rOut - 0.2, 9);
          if (lid === 'screws') {
            // The lid's holes over the bosses' tapping holes.
            const joint = a.interfaces.lidToBase!;
            const holes = holeCentres(s.add(lidM.slice(ld.thickness - 0.5)), 3);
            const taps = holeCentres(s.add(base.slice(ld.thickness + 1)), 3);
            const expected = screwPositions(joint).sort(
              (p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]),
            );
            expect(holes).toHaveLength(3);
            expect(taps).toHaveLength(3);
            for (let i = 0; i < 3; i++) {
              const [x, y] = expected[i]!;
              expect(Math.hypot(holes[i]![0] - x, holes[i]![1] - y)).toBeLessThan(0.05);
              expect(Math.hypot(taps[i]![0] - x, taps[i]![1] - y)).toBeLessThan(0.05);
            }
          }
        });
      },
    );
  });
});
