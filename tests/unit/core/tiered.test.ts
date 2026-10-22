/**
 * The tiered (PH-style) shade (M3b): its tiers and spacers as parts, stacked
 * `tierDrop` apart in the shade frame; valid, leak-free builds over the tier
 * count and the curve; no part reaching into another; the spacers' pins in
 * their sockets with the joint's clearance; the line of sight, the print flip
 * and the rules; the collar in the hub; the standing lamp; the clearance
 * profile; the "Layered pendant" example.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INNER_SHADE_ID, assemble } from '@core/assembly/assemble.ts';
import { withInnerShade } from '@core/assembly/innerShade.ts';
import { minShadeTopDiameter } from '@core/assembly/interfaces.ts';
import { SHADE_MODULES, type ShadeCtx } from '@core/assembly/shades/index.ts';
import {
  MIN_SPACER_LENGTH,
  SPACER_PIN_DIAMETER,
  SPACER_PIN_LENGTH,
  minTierOverlap,
  tierSlope,
} from '@core/assembly/shades/tiered.ts';
import { applyToPoint, compose, flipX, rotationZ, translation } from '@core/assembly/transforms.ts';
import { buildPart } from '@core/geometry/build.ts';
import { dispose, scoped, type Kernel, type Manifold } from '@core/geometry/kernel.ts';
import {
  MAX_TIER_OVERHANG,
  SOCKET_SEGMENTS,
  buildTier,
  deriveTier,
  spacerAngleDeg,
  tierFootprint,
  tierMidZ,
  tierShape,
} from '@core/geometry/parts/shades/tiered.ts';
import { buildSpacer, deriveSpacer, spacerFootprint } from '@core/geometry/parts/spacer.ts';
import type { Quality } from '@core/geometry/quality.ts';
import {
  SHADE_JOINT_TYPES,
  type Assembly,
  type Mat4,
  type PartSpec,
  type ShadeJointType,
} from '@core/model/assembly.ts';
import type { HubParams, SpacerParams, TierParams } from '@core/model/parts.ts';
import {
  defaultMount,
  defaultShadeStyle,
  parseProject,
  shadeStyleForFamily,
  type Project,
  type TieredStyle,
} from '@core/model/project.ts';
import { SHADE_FAMILIES, SHADE_FAMILY_DEFAULTS } from '@core/schema/defs.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import { assembled, maxOverhangDeg, withBuilt, type Built } from '../../helpers/parts.ts';

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

/** The "Layered pendant" example (cord, E27 bulb, bayonet; 4 tiers Ø130 → Ø240, drop 44), edited. */
function layered(edit: (s: TieredStyle, p: Project) => void = () => {}): Project {
  const p = example('ph-layered');
  const style = p.shades[0].style;
  if (style.family !== 'tiered') throw new Error('not tiered');
  edit(style, p);
  return p;
}

/** The pendant example (cord, puck, bayonet) with the tiered family's defaults (Ø120 → Ø320, drop 28). */
function pendant(edit: (s: TieredStyle) => void = () => {}): Project {
  const p = example('pendant-cord');
  const style = defaultShadeStyle('tiered');
  edit(style);
  p.shades[0].style = style;
  return p;
}

const tiers = (a: Assembly) => a.parts.filter((p) => p.kind === 'tier');
const spacers = (a: Assembly) => a.parts.filter((p) => p.kind === 'spacer');
const shadeParts = (a: Assembly) => [...tiers(a), ...spacers(a)];
const errors = (a: Assembly) => a.warnings.filter((w) => w.severity === 'error');
const codes = (a: Assembly) => a.warnings.map((w) => w.code);

function part(a: Assembly, id: string): PartSpec {
  const p = a.parts.find((x) => x.id === id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function tierOf(a: Assembly, id: string): TierParams {
  const p = part(a, id);
  if (p.kind !== 'tier') throw new Error(`${id} is no tier`);
  return p.params;
}

function spacerOf(a: Assembly, id: string): SpacerParams {
  const p = part(a, id);
  if (p.kind !== 'spacer') throw new Error(`${id} is no spacer`);
  return p.params;
}

/** The inverse of a rigid transform (rotation + translation). */
function inverse(m: Mat4): Mat4 {
  const r = (row: number, col: number) => m[col * 4 + row]!;
  const t = [m[12]!, m[13]!, m[14]!];
  const out = new Array<number>(16).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) out[col * 4 + row] = r(col, row);
    out[12 + row] = -(r(0, row) * t[0]! + r(1, row) * t[1]! + r(2, row) * t[2]!);
  }
  out[15] = 1;
  return out;
}

const asManifoldMat = (m: Mat4) => m as Parameters<Manifold['transform']>[0];

describe('the tiered family', () => {
  it('is registered with tiers and spacers and builds its own parts (no stand-in)', () => {
    expect(SHADE_FAMILIES).toContain('tiered');
    expect(SHADE_MODULES.tiered.family).toBe('tiered');
    expect(SHADE_MODULES.tiered.partKinds).toEqual(['tier', 'spacer']);
    expect(SHADE_MODULES.tiered.pending).toBeUndefined();
    expect(SHADE_FAMILY_DEFAULTS.tiered).toMatchObject({ tiers: 4, tierSpacers: 3 });
    const p = example('pendant-cord');
    p.shades[0].style = shadeStyleForFamily(p.shades[0].style, 'tiered');
    const a = assemble(p, { quality: 'draft' });
    expect(codes(a)).not.toContain('family-pending');
    expect(part(a, 'shade').kind).toBe('tier');
    expect(a.parts.some((x) => x.kind === 'shade')).toBe(false);
    expect(errors(a)).toEqual([]);
  });
});

describe('the parts of a tiered shade', () => {
  const p = pendant();
  const a = assemble(p, { quality: 'draft' });
  const style = p.shades[0].style as TieredStyle;

  it('are `tiers` tiers and one spacer part per gap with `spacers` copies, the top tier with the shade’s id', () => {
    expect(a.parts.map((x) => x.id)).toEqual([
      'hub',
      'shade',
      'shade-tier2',
      'shade-tier3',
      'shade-tier4',
      'shade-spacer1',
      'shade-spacer2',
      'shade-spacer3',
      'canopy',
    ]);
    expect(tiers(a).map((x) => x.displayName)).toEqual(['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4']);
    expect(spacers(a).map((x) => x.displayName)).toEqual([
      'Spacer 1 ×3',
      'Spacer 2 ×3',
      'Spacer 3 ×3',
    ]);
    expect(spacers(a)).toHaveLength(style.tiers - 1);
    expect(spacers(a).every((x) => x.instances === style.spacers)).toBe(true);
    // Every copy is laid out on the bed.
    expect(a.layout.placements.filter((x) => x.id === 'shade-spacer2')).toHaveLength(style.spacers);
    // The top tier carries the collar and the joint, the others hang on spacers.
    const top = tierOf(a, 'shade');
    expect(top.role).toEqual({ top: true, bottom: false });
    expect(top.joint).toEqual(a.interfaces.shadeToHub);
    expect(top.collar).toEqual((part(a, 'hub').params as HubParams).collar);
    expect(tierOf(a, 'shade-tier4').role).toEqual({ top: false, bottom: true });
    expect(tierOf(a, 'shade-tier2').collar).toBeUndefined();
    // Only the collar part says how the shade joins the hub.
    expect(part(a, 'shade').printNotes.some((n) => n.startsWith('Assembly: push'))).toBe(true);
    expect(part(a, 'shade-tier2').printNotes.some((n) => n.startsWith('Assembly: push'))).toBe(
      false,
    );
  });

  it('are stacked `tierDrop` apart, the top tier’s collar plane on the hub’s', () => {
    const zCollar = a.derived.zCollar!;
    expect(part(a, 'shade').assembledTransform).toEqual(translation(0, 0, -zCollar));
    const z = tiers(a).map((x) => x.assembledTransform[14]!);
    // Tiers of the same width (all but the top one) are exactly the drop apart.
    for (let i = 1; i + 1 < z.length; i++) expect(z[i]! - z[i + 1]!).toBeCloseTo(style.tierDrop, 9);
    // Each lower tier reaches `overlap` in under the rim of the one above.
    for (let i = 1; i < z.length; i++) {
      const above = tierOf(a, tiers(a)[i - 1]!.id).profile;
      const below = tierOf(a, tiers(a)[i]!.id).profile;
      expect(above.rOuter - below.rInner).toBeCloseTo(style.overlap, 9);
    }
    expect(a.derived.bottomZ).toBeLessThan(z[z.length - 1]! + 1e-9);
  });

  it('place each gap’s spacer copies around the axis, each pin a snap joint with its tier', () => {
    for (const x of spacers(a)) {
      const gap = Number(x.id.replace('shade-spacer', '')) - 1;
      expect(x.instanceTransforms, x.id).toHaveLength(style.spacers);
      expect(x.instanceTransforms[0], x.id).toEqual(x.assembledTransform);
      // The copies are the first one turned about the lamp's axis by the spacers' angles.
      x.instanceTransforms.forEach((m, j) => {
        const turn = rotationZ(
          spacerAngleDeg(gap, j, style.spacers) - spacerAngleDeg(gap, 0, style.spacers),
        );
        const expected = compose(turn, x.assembledTransform);
        m.forEach((v, i) => expect(v, `${x.id} #${j}`).toBeCloseTo(expected[i]!, 9));
      });
      // … at distinct places.
      const origins = x.instanceTransforms.map((m) => applyToPoint(m, [0, 0, 0]));
      for (let i = 0; i < origins.length; i++) {
        for (let j = i + 1; j < origins.length; j++) {
          const [p0, p1] = [origins[i]!, origins[j]!];
          expect(Math.hypot(p0[0]! - p1[0]!, p0[1]! - p1[1]!), x.id).toBeGreaterThan(10);
        }
      }
    }
    const tolerance = p.joints.tolerance / 2;
    expect(a.interfaces['shade-spacer1-top']).toEqual({
      id: 'shade-spacer1-top',
      type: 'snap',
      nominalDiameter: SPACER_PIN_DIAMETER,
      length: SPACER_PIN_LENGTH,
      tolerance,
      male: 'shade-spacer1',
      female: 'shade',
    });
    expect(a.interfaces['shade-spacer3-bottom']).toMatchObject({
      male: 'shade-spacer3',
      female: 'shade-tier4',
    });
    expect(Object.keys(a.interfaces).filter((id) => id.includes('spacer'))).toHaveLength(6);
    // The sockets: the pin plus the clearance on both sides.
    const sockets = tierOf(a, 'shade-tier2').spacerSockets;
    expect(sockets).toMatchObject({ count: 3, diameter: SPACER_PIN_DIAMETER + 2 * tolerance });
    expect(sockets.above).toBeDefined();
    expect(sockets.below).toBeDefined();
    expect(tierOf(a, 'shade').spacerSockets.above).toBeUndefined();
    expect(tierOf(a, 'shade-tier4').spacerSockets.below).toBeUndefined();
  });

  it('round their counts and take four spacers per gap', () => {
    const b = assemble(
      pendant((s) => {
        s.tiers = 3.6;
        s.spacers = 3.6;
      }),
      { quality: 'draft' },
    );
    expect(tiers(b)).toHaveLength(4);
    expect(spacers(b)).toHaveLength(3);
    expect(spacers(b).every((x) => x.instances === 4 && x.instanceTransforms.length === 4)).toBe(
      true,
    );
    expect(part(b, 'shade-spacer1').displayName).toBe('Spacer 1 ×4');
    expect(errors(b)).toEqual([]);
  });

  it('take the slope that leaves the spacers their room', () => {
    // slope · step + gap · √(1 + slope²) = drop, the gap being the rod and its walls.
    const step = (320 - 120) / 2 / 3;
    const slope = tierSlope(28, step, 0.8);
    const gap = 8 + 0.8 + 0.3;
    expect(slope * step + gap * Math.hypot(1, slope)).toBeCloseTo(28, 6);
    const t2 = tierOf(a, 'shade-tier2').profile;
    expect(t2.drop / (t2.rOuter - t2.rInner)).toBeCloseTo(slope, 9);
    // Steeper with a larger drop, capped at 75°.
    expect(tierSlope(60, step, 0.8)).toBeGreaterThan(slope);
    expect(tierSlope(80, 0, 0.8)).toBeCloseTo(Math.tan((75 * Math.PI) / 180), 9);
  });
});

describe('every tier and spacer builds', () => {
  const cases: [number, number, Quality][] = [];
  for (const q of ['draft', 'normal'] as const) {
    for (const n of [2, 4, 6]) for (const curve of [0, 0.3, 0.6]) cases.push([n, curve, q]);
  }

  it.each(cases)(
    '%d tiers, curve %d at %s quality: valid solids without leaks, on the bed, inside their footprints',
    (n, curve, q) => {
      const a = assemble(
        layered((s) => {
          s.tiers = n;
          s.curve = curve;
        }),
        { quality: q },
      );
      expect(errors(a)).toEqual([]);
      expect(tiers(a)).toHaveLength(n);
      expect(spacers(a)).toHaveLength(n - 1);
      expect(spacers(a).reduce((sum, x) => sum + x.instances, 0)).toBe((n - 1) * 3);
      withBuilt(k, tracker, shadeParts(a), q, (built) => {
        for (const { part: x, stats } of built) {
          expect(stats.status, x.id).toBe('NoError');
          expect(stats.bbox.min[2], x.id).toBeCloseTo(0, 6);
          const f = x.bedFootprint!;
          expect(stats.bbox.max[0] - stats.bbox.min[0], x.id).toBeLessThanOrEqual(f.x + 1e-6);
          expect(stats.bbox.max[2] - stats.bbox.min[2], x.id).toBeLessThanOrEqual(f.z + 1e-6);
          if (x.kind === 'tier') {
            const d = deriveTier(x.params);
            expect(stats.maxOverhangDeg, x.id).toBe(d.overhang);
            expect(f.x - (stats.bbox.max[0] - stats.bbox.min[0]), x.id).toBeLessThan(0.5);
          }
        }
      });
    },
  );
});

describe('the tiers and the spacers fit together', () => {
  /** Every pair of the shade's parts (every copy of each) in the lamp: their intersection's volume. */
  function overlaps(built: readonly Built[]): { a: string; b: string; volume: number }[] {
    return scoped(k, (s) => {
      const placed = built.flatMap((b) =>
        b.part.instanceTransforms.map((m, i) => ({
          id: i === 0 ? b.part.id : `${b.part.id}#${i}`,
          m: s.add(b.manifold.transform(asManifoldMat(m))),
        })),
      );
      const out: { a: string; b: string; volume: number }[] = [];
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const v = s.add(k.Manifold.intersection(placed[i]!.m, placed[j]!.m)).volume();
          out.push({ a: placed[i]!.id, b: placed[j]!.id, volume: v });
        }
      }
      return out;
    });
  }

  it.each([
    ['the family defaults on the puck pendant', pendant()],
    ['the Layered pendant', layered()],
    ['six tiers of curve 0.6', layered((s) => Object.assign(s, { tiers: 6, curve: 0.6 }))],
    [
      'a narrow, steep stack',
      layered((s) => Object.assign(s, { tiers: 5, bottomDiameter: 150, tierDrop: 60, curve: 1 })),
    ],
  ])('%s: no two of its parts reach into each other', (_, p) => {
    const a = assemble(p, { quality: 'draft' });
    withBuilt(k, tracker, shadeParts(a), 'draft', (built) => {
      for (const o of overlaps(built)) {
        expect(o.volume, `${o.a} ∩ ${o.b}`).toBeLessThan(1e-3);
      }
    });
  });

  it.each(['draft', 'normal'] as const)(
    'the pins fit their sockets with the joint’s clearance (%s)',
    (q) => {
      const p0 = layered();
      const a = assemble(p0, { quality: q });
      const iface = a.interfaces['shade-spacer1-top']!;
      const sp = part(a, 'shade-spacer1');
      const upper = part(a, 'shade');
      const lower = part(a, 'shade-tier2');
      withBuilt(k, tracker, [sp, upper, lower], q, ([spacer, top, second]) => {
        // The second copy ("b"), in its socket at the spacers' second angle.
        const toSpacer = inverse(sp.instanceTransforms[1]!);
        const d = deriveSpacer(spacerOf(a, sp.id));
        // The pin and the bore are regular polygons with the same corners (vertex for vertex),
        // so their radii follow from their sections' areas.
        const n = SOCKET_SEGMENTS[q];
        const radiusOf = (contour: readonly (readonly [number, number])[]) => {
          let area = 0;
          for (let i = 0; i < contour.length; i++) {
            const [x0, y0] = contour[i]!;
            const [x1, y1] = contour[(i + 1) % contour.length]!;
            area += x0 * y1 - x1 * y0;
          }
          return Math.sqrt(Math.abs(area) / (n * Math.sin((2 * Math.PI) / n)));
        };
        const pinRadius = (z: number) =>
          scoped(k, (s) => {
            const contours = s.add(spacer!.manifold.slice(z)).toPolygons();
            expect(contours).toHaveLength(1);
            return radiusOf(contours[0]!);
          });
        expect(pinRadius(d.zTop + SPACER_PIN_LENGTH / 2)).toBeCloseTo(SPACER_PIN_DIAMETER / 2, 6);
        expect(pinRadius(d.pinBottom / 2)).toBeCloseTo(SPACER_PIN_DIAMETER / 2, 6);
        // A socket: the tier moved into the spacer's frame (the bore's axis on z), sliced
        // through the socket's centre on the shell's mid-surface: the bore is the contour
        // around the axis.
        const socketRadius = (b: Built, side: 'above' | 'below') =>
          scoped(k, (s) => {
            const tier = b.part.params as TierParams;
            const gap = side === 'below' ? tier.index : tier.index - 1;
            const r = tier.spacerSockets[side]!.radius;
            const phi = (spacerAngleDeg(gap, 1, tier.spacerSockets.count) * Math.PI) / 180;
            const centre = applyToPoint(compose(toSpacer, b.part.assembledTransform), [
              r * Math.cos(phi),
              r * Math.sin(phi),
              tierMidZ(tierShape(tier), r),
            ]);
            expect(Math.hypot(centre[0]!, centre[1]!)).toBeLessThan(1e-6);
            const moved = s.add(
              b.manifold.transform(asManifoldMat(compose(toSpacer, b.part.assembledTransform))),
            );
            const bore = s
              .add(moved.slice(centre[2]!))
              .toPolygons()
              .filter((c) => c.every(([x, y]) => Math.hypot(x, y) < 3));
            expect(bore).toHaveLength(1);
            return radiusOf(bore[0]!);
          });
        const clearanceTop = socketRadius(top!, 'below') - SPACER_PIN_DIAMETER / 2;
        const clearanceBottom = socketRadius(second!, 'above') - SPACER_PIN_DIAMETER / 2;
        expect(clearanceTop).toBeCloseTo(iface.tolerance, 6);
        expect(clearanceBottom).toBeCloseTo(iface.tolerance, 6);
        expect(iface.tolerance).toBeCloseTo(p0.joints.tolerance / 2, 9);
        expect(iface.tolerance).toBeCloseTo(a.interfaces['shade-spacer1-bottom']!.tolerance, 9);
      });
    },
  );

  it.each(SHADE_JOINT_TYPES)(
    'the top tier hangs from the hub on a %s joint without overlapping it',
    (type: ShadeJointType) => {
      const p = layered();
      p.joints.shadeToHub = type;
      const a = assemble(p, { quality: 'draft' });
      expect(errors(a)).toEqual([]);
      withBuilt(k, tracker, [part(a, 'hub'), part(a, 'shade')], 'draft', ([hub, top]) => {
        expect(hub!.stats.status).toBe('NoError');
        expect(top!.stats.status).toBe('NoError');
        scoped(k, (s) => {
          const h = s.add(assembled(hub!));
          const t = s.add(assembled(top!));
          expect(s.add(k.Manifold.intersection(h, t)).volume()).toBeLessThan(1);
        });
        // The collar's seat is flush with the hub ring.
        const d = deriveTier(top!.part.params as TierParams);
        scoped(k, (s) => {
          const seat = s.add(top!.manifold.slice(d.zCollar - 0.2));
          expect(seat.bounds().max[0]).toBeCloseTo(d.rSeat, 6);
        });
      });
    },
  );

  it('keeps the spacers at least 6 mm long on the defaults and the example', () => {
    for (const p of [pendant(), layered()]) {
      const a = assemble(p, { quality: 'draft' });
      for (const x of spacers(a)) {
        expect(spacerOf(a, x.id).length).toBeGreaterThanOrEqual(MIN_SPACER_LENGTH);
      }
      expect(codes(a)).not.toContain('spacer-length');
    }
  });
});

describe('the line of sight', () => {
  it('hides the bulb between the Layered pendant’s tiers', () => {
    expect(codes(assemble(layered()))).not.toContain('line-of-sight');
  });

  it('warns when the tiers overlap too little', () => {
    const a = assemble(layered((s) => (s.overlap = 7)));
    expect(a.warnings.find((w) => w.code === 'line-of-sight')).toMatchObject({
      severity: 'warning',
      paramPath: 'shades.0.style.overlap',
      message: expect.stringMatching(/^The light can be seen directly between tier \d and tier \d/),
    });
    expect(tiers(a).map((x) => x.id)).toContain(
      a.warnings.find((w) => w.code === 'line-of-sight')!.partId,
    );
  });

  it('warns for a light at the top of a deep stack of flat tiers (the family defaults)', () => {
    expect(codes(assemble(pendant()))).toContain('line-of-sight');
  });
});

describe('the print flip', () => {
  it('warns about flat tiers that overhang more than 50° whichever way up', () => {
    const a = assemble(
      pendant((s) => (s.curve = 0)),
      { quality: 'draft' },
    );
    expect(a.warnings.find((w) => w.code === 'flat-tier')).toMatchObject({
      severity: 'warning',
      partId: 'shade',
      paramPath: 'shades.0.style.tierDrop',
      message: expect.stringMatching(/^Tiers 1, 2, 3 and 4 are too flat/),
    });
    for (const x of tiers(a)) {
      const d = deriveTier(tierOf(a, x.id));
      expect(Math.min(d.overhangUp, d.overhangDown)).toBeGreaterThan(MAX_TIER_OVERHANG);
      expect(x.printNotes[0]).toMatch(/needs supports/);
    }
  });

  it('prints curved tiers steep enough within 50°, the top one collar up', () => {
    const a = assemble(
      layered((s) =>
        Object.assign(s, { tiers: 6, tierDrop: 60, overlap: 16, curve: 0.5, bottomDiameter: 240 }),
      ),
      { quality: 'draft' },
    );
    expect(codes(a)).not.toContain('flat-tier');
    withBuilt(k, tracker, tiers(a), 'draft', (built) => {
      for (const { part: x, stats, manifold } of built) {
        const params = x.params as TierParams;
        const d = deriveTier(params);
        // The orientation it prints in is the one that overhangs less.
        expect(d.overhang, x.id).toBe(Math.min(d.overhangUp, d.overhangDown));
        expect(stats.maxOverhangDeg, x.id).toBeLessThanOrEqual(MAX_TIER_OVERHANG);
        // Measured on the mesh, away from the sockets' short bores.
        const s = tierShape(params);
        const sockets: number[][] = [];
        for (const [side, gap] of [
          ['above', params.index - 1],
          ['below', params.index],
        ] as const) {
          const at = params.spacerSockets[side];
          if (!at) continue;
          for (let j = 0; j < params.spacerSockets.count; j++) {
            const phi = (spacerAngleDeg(gap, j, params.spacerSockets.count) * Math.PI) / 180;
            sockets.push([
              at.radius * Math.cos(phi),
              at.radius * Math.sin(phi),
              tierMidZ(s, at.radius),
            ]);
          }
        }
        const measured = maxOverhangDeg(manifold, {
          ignore: (tri) => {
            const c = [0, 1, 2].map((i) => (tri[0][i]! + tri[1][i]! + tri[2][i]!) / 3);
            return sockets.some((q) => Math.hypot(c[0]! - q[0]!, c[1]! - q[1]!, c[2]! - q[2]!) < 4);
          },
        });
        expect(measured, x.id).toBeLessThanOrEqual(stats.maxOverhangDeg + 0.5);
      }
      // The top tier would put its seat face down turned over.
      const top = deriveTier(built[0]!.part.params as TierParams);
      expect(top.overhangDown).toBe(90);
      expect((built[0]!.part.params as TierParams).flipped).toBe(false);
    });
  });

  it('builds a lower tier turned over onto its inner edge, the same shell in the lamp', () => {
    const a = assemble(layered(), { quality: 'draft' });
    const up = tierOf(a, 'shade-tier2');
    const down: TierParams = { ...up, flipped: true };
    const d = deriveTier(down);
    expect(d.overhang).toBe(d.overhangDown);
    const plain = buildTier(k, up, 'draft');
    const turned = buildTier(k, down, 'draft');
    try {
      expect(turned.stats.status).toBe('NoError');
      expect(turned.stats.bbox.min[2]).toBeCloseTo(0, 6);
      expect(turned.stats.bbox.max[2]).toBeCloseTo(tierFootprint(down).z, 6);
      scoped(k, (s) => {
        // Turned back into the unflipped print frame: (x, y, z) → (x, −y, drop − z).
        const back = s.add(
          turned.manifold.transform(
            asManifoldMat(compose(translation(0, 0, up.profile.drop), flipX())),
          ),
        );
        const common = s.add(k.Manifold.intersection(back, plain.manifold)).volume();
        expect(common / plain.stats.volumeMm3).toBeGreaterThan(0.97);
        expect(back.boundingBox().max[0]).toBeCloseTo(plain.stats.bbox.max[0], 0);
      });
    } finally {
      dispose(plain.manifold);
      dispose(turned.manifold);
    }
  });
});

describe('a standing lamp', () => {
  it('turns every tier and spacer over with the hub', () => {
    const hanging = assemble(layered(), { quality: 'draft' });
    const p = layered();
    p.mount = defaultMount('standing');
    const a = assemble(p, { quality: 'draft' });
    expect(errors(a)).toEqual([]);
    const hub = part(a, 'hub');
    for (const x of shadeParts(hanging)) {
      const y = part(a, x.id);
      expect(y.buildKey, x.id).toBe(x.buildKey);
      // The pendant's hub is the world, so its shade parts' transforms are the shade frame's.
      const expected = compose(hub.assembledTransform, x.assembledTransform);
      y.assembledTransform.forEach((v, i) => expect(v, x.id).toBeCloseTo(expected[i]!, 9));
      // Every copy (each gap's spacers) turns over with it.
      expect(y.instanceTransforms, x.id).toHaveLength(x.instances);
      y.instanceTransforms.forEach((m, j) => {
        const copy = compose(hub.assembledTransform, x.instanceTransforms[j]!);
        m.forEach((v, i) => expect(v, `${x.id} #${j}`).toBeCloseTo(copy[i]!, 9));
      });
    }
    // The spacers' copies stand between the turned-over tiers, above the hub too.
    const hubZ0 = applyToPoint(hub.assembledTransform, [0, 0, 0])[2]!;
    for (const x of spacers(a)) {
      for (const m of x.instanceTransforms) {
        expect(applyToPoint(m, [0, 0, 0])[2]!, x.id).toBeGreaterThan(hubZ0);
      }
    }
    // Open end up: every tier above the hub's light face, each lower tier higher up.
    const hubZ = applyToPoint(hub.assembledTransform, [0, 0, 0])[2]!;
    const z = tiers(a).map((x) => applyToPoint(x.assembledTransform, [0, 0, 0])[2]!);
    expect(z[0]!).toBeGreaterThan(hubZ);
    for (let i = 1; i < z.length; i++) expect(z[i]!).toBeGreaterThan(z[i - 1]!);
    expect(a.derived.topZ).toBeCloseTo(hubZ - hanging.derived.bottomZ!, 6);
  });
});

describe('the rules', () => {
  const warningAt = (a: Assembly, path: string) =>
    a.warnings.find((w) => w.paramPath === path && w.code === 'adjusted');

  it('raises the overlap to the sockets’ room', () => {
    const a = assemble(
      layered((s) => (s.overlap = 2)),
      { quality: 'draft' },
    );
    const least = minTierOverlap(0.3);
    expect(least).toBe(6.5);
    expect(warningAt(a, 'shades.0.style.overlap')).toMatchObject({ partId: 'shade' });
    expect(tierOf(a, 'shade').profile.rOuter - tierOf(a, 'shade-tier2').profile.rInner).toBeCloseTo(
      least,
      9,
    );
  });

  it('widens a top tier too narrow to reach past its collar and reduces the overlap first', () => {
    const a = assemble(
      layered((s) => (s.topDiameter = 70)),
      { quality: 'draft' },
    );
    const top = tierOf(a, 'shade');
    expect(warningAt(a, 'shades.0.style.topDiameter')).toMatchObject({ partId: 'shade' });
    expect(warningAt(a, 'shades.0.style.overlap')).toBeDefined();
    const least = minTierOverlap(0.3);
    expect(top.profile.rOuter).toBeGreaterThanOrEqual(top.collar!.seatRadius + 1 + least);
    expect(top.profile.rOuter * 2).toBeGreaterThanOrEqual(minShadeTopDiameter(top.collar!));
    expect(errors(a)).toEqual([]);
    for (const x of shadeParts(a).slice(0, 4)) {
      const { manifold, stats } = buildPart(k, x, 'draft');
      try {
        expect(stats.status, x.id).toBe('NoError');
      } finally {
        dispose(manifold);
      }
    }
  });

  it('keeps the bottom tier at least as wide as the top one', () => {
    const a = assemble(
      layered((s) => (s.bottomDiameter = 100)),
      { quality: 'draft' },
    );
    expect(warningAt(a, 'shades.0.style.bottomDiameter')).toBeDefined();
    const radii = tiers(a).map((x) => tierOf(a, x.id).profile.rOuter);
    for (const r of radii) expect(r).toBeCloseTo(65, 9);
  });

  it('warns about short spacers and fails on tiers with no room between them', () => {
    const short = assemble(
      layered((s) => (s.tierDrop = 7)),
      { quality: 'draft' },
    );
    expect(short.warnings.find((w) => w.code === 'spacer-length')).toMatchObject({
      severity: 'warning',
      partId: 'shade-spacer1',
      paramPath: 'shades.0.style.tierDrop',
    });
    expect(errors(short)).toEqual([]);
    expect(spacerOf(short, 'shade-spacer1').length).toBeLessThan(MIN_SPACER_LENGTH);
    const touching = assemble(
      layered((s, p) => {
        Object.assign(s, { tiers: 2, bottomDiameter: 400, tierDrop: 5, overlap: 10, curve: 0 });
        p.shades[0].wallThickness = 3;
      }),
      { quality: 'draft' },
    );
    expect(touching.warnings.find((w) => w.code === 'tier-collision')).toMatchObject({
      severity: 'error',
      partId: 'shade-tier2',
    });
  });
});

describe('the clearance profile', () => {
  it('matches the assembled tiers’ sections', () => {
    const p = layered();
    const a = assemble(p, { quality: 'normal' });
    const hub = part(a, 'hub').params as HubParams;
    const ctx: ShadeCtx<'tiered'> = {
      role: 'outer',
      id: 'shade',
      style: p.shades[0].style as TieredStyle,
      wallThickness: p.shades[0].wallThickness,
      colour: p.shades[0].colour,
      colours: p.colours,
      collar: hub.collar,
      joint: hub.joint,
      minTopDiameter: Math.ceil(minShadeTopDiameter(hub.collar) - 1e-9),
      light: p.light,
      envelope: hub.envelope,
      joints: p.joints,
      printer: p.printer,
      quality: 'normal',
    };
    const profile = SHADE_MODULES.tiered.profile!(ctx)!;
    expect(profile.depth).toBeCloseTo(-a.derived.bottomZ!, 6);
    withBuilt(k, tracker, tiers(a), 'normal', (built) => {
      scoped(k, (s) => {
        const lamp = s.add(k.Manifold.union(built.map((b) => s.add(assembled(b)))));
        for (const z of [-10, -40, -75, -110, -150]) {
          const radii = s
            .add(lamp.slice(z))
            .toPolygons()
            .flat()
            .map(([x, y]) => Math.hypot(x, y));
          expect(profile.outerAt(z), `outer at ${z}`).toBeCloseTo(Math.max(...radii), 0);
          expect(profile.innerAt(z), `inner at ${z}`).toBeCloseTo(Math.min(...radii), 0);
        }
      });
    });
  });

  it('checks a revolved inner shade inside a tiered one (no "unchecked" info)', () => {
    const p = withInnerShade(layered());
    const a = assemble(p, { quality: 'draft' });
    expect(codes(a)).not.toContain('shade-clearance-unchecked');
    expect(errors(a)).toEqual([]);
  });

  it('builds a tiered inner shade under its own ids and names', () => {
    const p = withInnerShade(example('pendant-cord'));
    p.shades[1]!.style = {
      ...defaultShadeStyle('tiered'),
      tiers: 3,
      topDiameter: 100,
      bottomDiameter: 130,
      tierDrop: 30,
    };
    const a = assemble(p, { quality: 'draft' });
    expect(errors(a)).toEqual([]);
    expect(part(a, INNER_SHADE_ID).kind).toBe('tier');
    expect(part(a, INNER_SHADE_ID).displayName).toBe('Inner tier 1');
    expect(part(a, 'innerShade-tier3').displayName).toBe('Inner tier 3');
    expect(part(a, 'innerShade-spacer2').displayName).toBe('Inner spacer 2 ×3');
    expect(part(a, 'innerShade-spacer2').instanceTransforms).toHaveLength(3);
    expect(a.interfaces['innerShade-spacer1-top']).toMatchObject({ female: 'innerShade' });
    for (const x of a.parts.filter((y) => y.id.startsWith('innerShade'))) {
      const { manifold, stats } = buildPart(k, x, 'draft');
      try {
        expect(stats.status, x.id).toBe('NoError');
      } finally {
        dispose(manifold);
      }
    }
  });
});

describe('the spacer builder', () => {
  it('stands on its lower pin, its bottom pin longer only under a steep face', () => {
    const base: SpacerParams = {
      diameter: 5,
      length: 8,
      pin: { diameter: 4, length: 3 },
      quality: 'draft',
      endSlopes: { top: 0.1, bottom: -0.1 },
    };
    expect(deriveSpacer(base)).toMatchObject({ pinBottom: 3, zBottom: 3, zTop: 11, zPinTop: 14 });
    const steep = deriveSpacer({ ...base, endSlopes: { top: 0, bottom: 2 } });
    expect(steep.pinBottom).toBeCloseTo(2.5 * 2 + 0.6, 9);
    for (const p of [
      base,
      { ...base, endSlopes: { top: 1, bottom: -2 } },
      { ...base, endSlopes: undefined },
    ]) {
      const params = p.endSlopes ? p : { ...base, endSlopes: { top: 0, bottom: 0 } };
      const built = buildSpacer(k, params, 'normal');
      try {
        expect(built.stats.status).toBe('NoError');
        expect(built.stats.bbox.min[2]).toBeCloseTo(0, 6);
        const f = spacerFootprint(params);
        expect(built.stats.bbox.max[2]).toBeLessThanOrEqual(f.z + 1e-6);
        expect(built.stats.bbox.max[0] - built.stats.bbox.min[0]).toBeCloseTo(f.x, 6);
      } finally {
        dispose(built.manifold);
      }
    }
  });
});

describe('the Layered pendant example', () => {
  it('hangs four tiers on a cord around an E27 bulb and prints them all without supports', () => {
    const p = example('ph-layered');
    expect(p.name).toBe('Layered pendant');
    expect(p.mount.kind).toBe('ceilingCord');
    expect(p.light).toMatchObject({ kind: 'bulb', size: 'E27' });
    expect(p.hub.fused).toBe(false);
    expect(p.joints.shadeToHub).toBe('bayonet');
    expect(p.shades[0]).toMatchObject({ colour: '#f3ede4', style: { family: 'tiered', tiers: 4 } });
    const a = assemble(p, { quality: 'draft' });
    // Infos only (the bulb's, the plate): no errors, no warnings.
    expect(a.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
    expect(a.parts.map((x) => x.id).slice(0, 2)).toEqual(['hub', 'shade']);
    expect(tiers(a)).toHaveLength(4);
    expect(spacers(a)).toHaveLength(3);
    expect(spacers(a).reduce((sum, x) => sum + x.instances, 0)).toBe(9);
    withBuilt(k, tracker, a.parts, 'draft', (built) => {
      for (const b of built) {
        expect(b.stats.status, b.part.id).toBe('NoError');
        expect(b.stats.maxOverhangDeg, b.part.id).toBeLessThanOrEqual(MAX_TIER_OVERHANG);
      }
    });
    // The tiers keep the bulb's heat clearance (inside Ø bulb + 2 · 15 mm only above its glass).
    const zone = (part(a, 'hub').params as HubParams).envelope.heatZone!;
    for (const x of tiers(a).slice(1)) {
      const t = tierOf(a, x.id);
      const zInner = x.assembledTransform[14]! + t.profile.drop;
      if (zInner > zone.z0 && zInner < zone.z1) {
        expect(t.profile.rInner, x.id).toBeGreaterThanOrEqual(zone.rMin);
      }
    }
  });
});
