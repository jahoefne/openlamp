/**
 * The wall lamp's canopy plate (geometry/parts/wallPlate.ts), built from the
 * params the wall-arm module resolves: every outline × edge × cable exit at
 * draft and normal quality (valid, leak-free, inside its footprint, no
 * overhang beyond 45° but the groove's bridge), the blind keyholes, the cable's
 * path, the front's profile, the socket (bore, seat cup, lock) in the room
 * frame and the knee's spigot seated in it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { applyToPoint, compose, translation } from '@core/assembly/transforms.ts';
import { pivotDims, spigot } from '@core/geometry/features/pivot.ts';
import { scoped, type CrossSection, type Kernel, type Manifold } from '@core/geometry/kernel.ts';
import { deriveKnee } from '@core/geometry/parts/knee.ts';
import {
  KEYHOLE_LIP,
  deriveWallPlate,
  plateProfile,
  wallPlateFootprint,
  type WallPlateDerived,
} from '@core/geometry/parts/wallPlate.ts';
import { QUALITY, type Quality } from '@core/geometry/quality.ts';
import type { Assembly, Mat4, PartSpec } from '@core/model/assembly.ts';
import type { KneeParams, WallPlateParams } from '@core/model/parts.ts';
import { createDefaultProject, defaultMount, type MountOf } from '@core/model/project.ts';
import { CABLE_EXITS, PLATE_EDGES, PLATE_OUTLINES } from '@core/schema/defs.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import {
  assembled,
  contourMaxRadii,
  contourMinRadii,
  inBoxes,
  intersectionVolume,
  maxOverhangDeg,
  withBuilt,
  type Box3,
  type Built,
} from '../../helpers/parts.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

type WallMount = MountOf<'wallArm'>;
type Plate = WallMount['plate'];
type Arm = WallMount['arm'];

const QUALITIES = ['draft', 'normal'] as const satisfies readonly Quality[];

/** The default wall lamp with these plate and arm fields. */
function wallLamp(plate: Partial<Plate> = {}, arm: Partial<Arm> = {}) {
  const p = createDefaultProject({
    id: 'test',
    name: 'Test',
    updatedAt: '2026-10-21T00:00:00.000Z',
  });
  const mount = defaultMount('wallArm');
  Object.assign(mount.plate, plate);
  Object.assign(mount.arm, arm);
  p.mount = mount;
  return p;
}

function part(a: Assembly, id: string): PartSpec {
  const p = a.parts.find((x) => x.id === id);
  if (!p) throw new Error(`no part ${id}`);
  return p;
}
const plateParams = (a: Assembly) => part(a, 'wallPlate').params as WallPlateParams;

/** Build the plate of `a` and check it. */
function withPlate(
  a: Assembly,
  quality: Quality,
  check: (plate: Built, params: WallPlateParams, d: WallPlateDerived) => void,
): void {
  const params = plateParams(a);
  withBuilt(k, tracker, [part(a, 'wallPlate')], quality, ([plate]) =>
    check(plate!, params, deriveWallPlate(params)),
  );
}

/** Whether a disc of radius r at (x, y) lies wholly outside the section (in a hole, or off the part). */
function inHole(section: CrossSection, x: number, y: number, r: number): boolean {
  return scoped(k, (s) => {
    const probe = s.add(s.add(k.CrossSection.circle(r, 32)).translate([x, y]));
    return s.add(k.CrossSection.intersection(section, probe)).area() < 1e-6;
  });
}

/** Whether the rectangle [x0, x1] × [y0, y1] lies wholly inside the section's material. */
function solidOver(section: CrossSection, x0: number, y0: number, x1: number, y1: number): boolean {
  return scoped(k, (s) => {
    const rect = s.add(s.add(k.CrossSection.square([x1 - x0, y1 - y0])).translate([x0, y0]));
    return s.add(k.CrossSection.intersection(section, rect)).area() > rect.area() - 1e-6;
  });
}

/** The section of a manifold at print height z (the caller's scope owns it). */
const sliceAt = (s: { add<T extends { delete(): void }>(o: T): T }, m: Manifold, z: number) =>
  s.add(m.slice(z));

/** The groove's ceiling (a bridge, the one overhang the plate has), as a thin box in the print frame. */
function grooveCeiling(p: WallPlateParams, d: WallPlateDerived): Box3 | undefined {
  const c = p.cable;
  if (c.exit === 'wall') return undefined;
  const r = c.grooveWidth / 2;
  const far = { x: d.halfWidth + 2 * r + 2, y: d.halfHeight + 2 * r + 2 };
  const [x0, x1, y0, y1] =
    c.exit === 'bottom'
      ? [-r, r, -far.y, d.passageY + r]
      : c.exit === 'top'
        ? [-r, r, d.passageY - r, far.y]
        : c.exit === 'left'
          ? [-far.x, r, d.passageY - r, d.passageY + r]
          : [-r, far.x, d.passageY - r, d.passageY + r];
  const e = 1e-3;
  return { min: [x0 - e, y0 - e, c.grooveDepth - e], max: [x1 + e, y1 + e, c.grooveDepth + e] };
}

/** Where the cable leaves the plate's edge (print frame), beyond it. */
function exitPoint(p: WallPlateParams, d: WallPlateDerived): [number, number] {
  switch (p.cable.exit) {
    case 'bottom':
      return [0, -d.halfHeight - 3];
    case 'top':
      return [0, d.halfHeight + 3];
    case 'left':
      return [-d.halfWidth - 3, d.passageY];
    case 'right':
      return [d.halfWidth + 3, d.passageY];
    case 'wall':
      return [0, d.wallHoleY];
  }
}

/**
 * A probe along the cable's path, 0.2 mm inside its cuts: up the passage from
 * the groove into the bore and along the groove out past the edge, or up the
 * wall hole from below the back face into the bore (print frame).
 */
function cableProbe(p: WallPlateParams, d: WallPlateDerived): Manifold {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const c = p.cable;
    if (c.exit === 'wall') {
      const r = c.wallHole / 2 - 0.2;
      return s.keep(
        s.add(Manifold.cylinder(d.socketZ + 1, r, r, 64)).translate([0, d.wallHoleY, -1]),
      );
    }
    const r = c.passage / 2 - 0.2;
    const passage = s.add(
      s.add(Manifold.cylinder(d.socketZ - 0.2, r, r, 64)).translate([0, d.passageY, 0.2]),
    );
    const [ex, ey] = exitPoint(p, d);
    const w = c.grooveWidth / 2 - 0.2;
    const h = c.grooveDepth - 0.4;
    const along = Math.hypot(ex, ey - d.passageY);
    const box =
      ex === 0 ? s.add(Manifold.cube([2 * w, along, h])) : s.add(Manifold.cube([along, 2 * w, h]));
    const placed =
      ex === 0
        ? s.add(box.translate([-w, Math.min(ey, d.passageY), 0.2]))
        : s.add(box.translate([Math.min(ex, 0), d.passageY - w, 0.2]));
    return s.keep(s.add(Manifold.union(passage, placed)));
  });
}

/** Every outline × edge × exit, and the faceted boss and the grub-screw lock once each. */
const CONFIGS: [name: string, plate: Partial<Plate>, arm: Partial<Arm>][] = [
  ...PLATE_OUTLINES.flatMap((outline) =>
    PLATE_EDGES.flatMap((edge) =>
      CABLE_EXITS.map((cableExit): [string, Partial<Plate>, Partial<Arm>] => [
        `${outline}, ${edge} edge, cable ${cableExit}`,
        { outline, edge, cableExit },
        {},
      ]),
    ),
  ),
  ['a faceted boss', {}, { profile: 'faceted' }],
  ['a grub-screw lock', {}, { lock: 'screw' }],
];

describe.each(QUALITIES)('the wall plate (%s)', (quality) => {
  it.each(CONFIGS)(
    '%s: a valid solid in its footprint, supported, blind keyholes',
    (_n, pl, ar) => {
      const a = assemble(wallLamp(pl, ar), { quality });
      withPlate(a, quality, (plate, p, d) => {
        const { stats, manifold } = plate;
        expect(stats.status).toBe('NoError');
        // Inside its footprint (centred on the print origin), on the bed.
        const f = plate.part.bedFootprint!;
        expect(f).toEqual(wallPlateFootprint(p));
        const { min, max } = stats.bbox;
        expect(min[2]).toBeCloseTo(0, 6);
        expect(max[2]).toBeLessThanOrEqual(f.z + 1e-6);
        expect(max[2]).toBeCloseTo(d.socketZ + d.rBoss, 6);
        for (const i of [0, 1] as const) {
          const half = (i === 0 ? f.x : f.y) / 2;
          expect(min[i], `axis ${i}`).toBeGreaterThanOrEqual(-half - 1e-6);
          expect(max[i], `axis ${i}`).toBeLessThanOrEqual(half + 1e-6);
        }
        // No overhang beyond 45° but the groove's ceiling (a bridge).
        expect(stats.maxOverhangDeg).toBe(45);
        const ceiling = grooveCeiling(p, d);
        expect(
          maxOverhangDeg(manifold, ceiling ? { ignore: inBoxes(ceiling) } : {}),
        ).toBeLessThanOrEqual(45.5);
        if (ceiling) expect(maxOverhangDeg(manifold)).toBeGreaterThan(89);

        scoped(k, (s) => {
          const kh = p.keyholes;
          const rHead = kh.headDiameter / 2;
          const rSlot = kh.slotWidth / 2;
          const mid = (d.keyholeHeadY + d.keyholeEndY) / 2;
          const back = sliceAt(s, manifold, 0.5);
          const channel = sliceAt(s, manifold, d.keyholeLip + 0.3);
          const top = sliceAt(s, manifold, d.keyholeTop + 0.05);
          const front = sliceAt(s, manifold, p.thickness - 1);
          for (const x of [-d.keyholeX, d.keyholeX]) {
            // On the back: the head hole and the slot up to the screw's place, through the lip …
            expect(inHole(back, x, d.keyholeHeadY, rHead - 0.2), `head hole ${x}`).toBe(true);
            expect(inHole(back, x, mid, rSlot - 0.2), `slot ${x}`).toBe(true);
            expect(inHole(back, x, d.keyholeEndY, rSlot - 0.2), `slot end ${x}`).toBe(true);
            expect(inHole(back, x, mid, rSlot + 0.3), `lip ${x}`).toBe(false);
            // … the head channel over the lip, the whole travel …
            expect(inHole(channel, x, mid, rHead - 0.2), `channel ${x}`).toBe(true);
            expect(inHole(channel, x, d.keyholeEndY, rHead - 0.2), `channel end ${x}`).toBe(true);
            // … closed above its gable's ridge, and 1 mm behind the front: blind.
            const box = [
              x - rHead - 1,
              d.keyholeHeadY - rHead - 1,
              x + rHead + 1,
              rHead + 1,
            ] as const;
            expect(solidOver(top, ...box), `above the ridge ${x}`).toBe(true);
            expect(solidOver(front, ...box), `behind the front ${x}`).toBe(true);
          }

          const c = p.cable;
          if (c.exit === 'wall') {
            // A hole into the wall on the back, no groove.
            expect(inHole(back, 0, d.wallHoleY, c.wallHole / 2 - 0.2)).toBe(true);
            expect(
              solidOver(back, -2, -d.halfHeight + 8, 2, d.wallHoleY - c.wallHole / 2 - 2),
            ).toBe(true);
          } else {
            // The groove on the back from the passage to the edge; the passage above its ceiling.
            const [ex, ey] = exitPoint(p, d);
            expect(inHole(back, 0, d.passageY, c.grooveWidth / 2 - 0.2)).toBe(true);
            const gx = ex / 2;
            const gy = (ey + d.passageY) / 2;
            expect(inHole(back, gx, gy, c.grooveWidth / 2 - 0.2), 'groove').toBe(true);
            const skin = sliceAt(s, manifold, c.grooveDepth + 0.6);
            expect(inHole(skin, 0, d.passageY, c.passage / 2 - 0.2), 'passage').toBe(true);
            expect(solidOver(skin, gx - 1, gy - 1, gx + 1, gy + 1), 'groove ceiling').toBe(true);
          }
          // The cable's way from the bore to the edge (or the wall) is clear.
          const probe = s.add(cableProbe(p, d));
          expect(s.add(k.Manifold.intersection(manifold, probe)).volume()).toBeLessThan(1e-3);
        });
      });
    },
  );

  it.each([
    ['friction', {}],
    ['a faceted, locked boss', { profile: 'faceted', lock: 'screw' }],
  ] as const)(
    'the socket (%s): bore = spigot + tolerance, its teardrop pointing into the room, the 45° seat cup',
    (_n, arm) => {
      const a = assemble(wallLamp({}, arm), { quality });
      const iface = a.interfaces.platePivot!;
      expect(plateParams(a).socket.pivot).toEqual(iface);
      const pv = pivotDims(iface);
      withPlate(a, quality, (plate, _p, d) => {
        scoped(k, (s) => {
          const T = plate.part.assembledTransform;
          // The socket axis is vertical in the room, the seat plane on top.
          const [X, Y, Z] = applyToPoint(T, [0, d.seatY, d.socketZ]) as [number, number, number];
          const below = applyToPoint(T, [0, d.seatY - 10, d.socketZ]);
          [X, Y, Z - 10].forEach((v, i) => expect(below[i]).toBeCloseTo(v, 9));
          const placed = s.add(assembled(plate));
          const at = (z: number) => s.add(s.add(placed.slice(z)).translate([-X, -Y]));
          // Halfway down: the bore, Ø spigot + 2 · tolerance …
          const bore = at(Z - pv.depth / 2);
          const radii = contourMinRadii(bore);
          expect(Math.abs(radii[0]! - pv.rBore)).toBeLessThanOrEqual(0.01);
          expect(pv.rBore - pv.rSpigot).toBeCloseTo(iface.tolerance, 12);
          // … a teardrop whose point (r·√2) is away from the wall (room +y).
          const hole = bore
            .toPolygons()
            .find((poly) => Math.min(...poly.map(([x, y]) => Math.hypot(x, y))) < pv.rBore + 0.1)!;
          const tip = hole.reduce((m, v) => (Math.hypot(...v) > Math.hypot(...m) ? v : m));
          expect(Math.hypot(...tip)).toBeCloseTo(pv.rBore * Math.SQRT2, 2);
          expect(tip[0]).toBeCloseTo(0, 6);
          expect(tip[1]).toBeGreaterThan(0);
          expect(a.context).toMatchObject({ kind: 'wall' });
          expect(Y).toBeGreaterThan((a.context as { wallY: number }).wallY);
          // The cup: rSeat at the seat plane, narrowing at 45° to the bore.
          expect(contourMinRadii(at(Z - 0.01))[0]).toBeCloseTo(pv.rSeat - 0.01, 2);
          expect(contourMinRadii(at(Z - pv.seat / 2))[0]).toBeCloseTo(pv.rSeat - pv.seat / 2, 2);
          expect(contourMinRadii(at(Z - pv.seat + 0.1))[0]).toBeCloseTo(pv.rBore + 0.1, 2);
        });
      });
    },
  );
});

describe('the wall plate', () => {
  it('has the derived numbers of the default lamp', () => {
    const d = deriveWallPlate(plateParams(assemble(wallLamp())));
    expect(d).toMatchObject({
      halfWidth: 50,
      halfHeight: 50,
      frontZ: 13,
      socketZ: 33,
      channelDepth: 3.5,
      keyholeLip: KEYHOLE_LIP,
      keyholeTop: 8,
      keyholeX: 30,
      keyholeEndY: 0,
      keyholeHeadY: -12,
    });
    expect(d.seatY).toBeCloseTo(1.3, 9);
    expect(d.bossHeight).toBeCloseTo(44.6, 9);
    expect(d.passageY).toBeCloseTo(-38.2, 9);
    // The wall hole opens whole into the bore, above its floor.
    expect(d.wallHoleY - 6).toBeGreaterThan(d.floorY);
  });

  it('keeps every keyhole blind: a lip and room for the head, ≥ 1.2 in front of the gable', () => {
    for (let t = 9.5; t <= 16; t += 0.5) {
      const d = deriveWallPlate(plateParams(assemble(wallLamp({ thickness: t }))));
      expect(t - d.keyholeTop, `t ${t}`).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(d.keyholeLip, `t ${t}`).toBeGreaterThanOrEqual(1.2);
      expect(d.channelDepth - d.keyholeLip, `t ${t}`).toBeGreaterThanOrEqual(1.5);
    }
  });

  it.each(PLATE_EDGES)(
    'has a %s edge, the rim `thickness` inside it and the dome rising toward the middle',
    (edge) => {
      const a = assemble(wallLamp({ edge, cableExit: 'wall' }), { quality: 'draft' });
      withPlate(a, 'draft', (plate, p, d) => {
        // The profile: from the back's rim through (edgeSize, thickness) up to the top.
        const prof = plateProfile(p, 'draft');
        const e = p.edgeSize;
        const t = p.thickness;
        expect(prof[0]).toEqual([0, 0]);
        expect(prof.at(-1)![0]).toBeCloseTo(Math.min(d.halfWidth, d.halfHeight), 9);
        expect(prof.at(-1)![1]).toBeCloseTo(d.frontZ, 9);
        expect(prof.some(([i, z]) => Math.abs(i - e) < 1e-9 && Math.abs(z - t) < 1e-9)).toBe(true);
        for (let i = 1; i < prof.length; i++) {
          expect(prof[i]![0]).toBeGreaterThanOrEqual(prof[i - 1]![0] - 1e-9);
          expect(prof[i]![1]).toBeGreaterThanOrEqual(prof[i - 1]![1] - 1e-9);
        }
        scoped(k, (s) => {
          const outer = (z: number) => Math.max(...contourMaxRadii(sliceAt(s, plate.manifold, z)));
          // The side straight up to the edge, the edge inset by `edgeSize` at the rim.
          expect(outer(t - e - 0.5)).toBeCloseTo(d.halfWidth, 2);
          const half = outer(t - e / 2);
          if (edge === 'chamfer') expect(half).toBeCloseTo(d.halfWidth - e / 2, 2);
          else expect(half).toBeGreaterThan(d.halfWidth - e / 2 + 0.5);
          expect(outer(t - 0.01)).toBeLessThan(d.halfWidth - e + 0.6);
          // The dome above the rim, along +y (clear of the boss): its height at
          // each inset from the profile (straight between slices).
          const zAt = (inset: number) => {
            for (let i = 1; i < prof.length; i++) {
              const [i0, z0] = prof[i - 1]!;
              const [i1, z1] = prof[i]!;
              if (inset <= i1 && i1 > i0) return z0 + ((z1 - z0) * (inset - i0)) / (i1 - i0);
            }
            return prof.at(-1)![1];
          };
          for (const y of [15, 25, 35]) {
            const z = zAt(d.halfHeight - y);
            expect(z).toBeGreaterThan(t);
            expect(inHole(sliceAt(s, plate.manifold, z - 0.05), 0, y, 0.01), `under ${y}`).toBe(
              false,
            );
            expect(inHole(sliceAt(s, plate.manifold, z + 0.05), 0, y, 0.01), `over ${y}`).toBe(
              true,
            );
          }
        });
      });
    },
  );

  it('runs left and right as seen from the room (the room’s −x is a viewer’s right)', () => {
    for (const exit of ['left', 'right'] as const) {
      const a = assemble(wallLamp({ cableExit: exit }), { quality: 'draft' });
      withPlate(a, 'draft', (plate, p, d) => {
        scoped(k, (s) => {
          const back = sliceAt(s, plate.manifold, 0.5);
          const sign = exit === 'right' ? 1 : -1;
          expect(inHole(back, sign * 25, d.passageY, p.cable.grooveWidth / 2 - 0.2)).toBe(true);
          expect(inHole(back, -sign * 25, d.passageY, 1)).toBe(false);
          // The viewer faces the wall (it is at −y), so their right is the room's −x.
          const world = applyToPoint(plate.part.assembledTransform, [sign * 25, d.passageY, 0]);
          expect(Math.sign(world[0]!)).toBe(-sign);
          expect((a.context as { wallY: number }).wallY).toBeLessThan(0);
        });
      });
    }
  });

  it('has a flat to the room on a faceted boss', () => {
    for (const profile of ['round', 'faceted'] as const) {
      const a = assemble(wallLamp({}, { profile }), { quality: 'draft' });
      withPlate(a, 'draft', (plate, _p, d) => {
        scoped(k, (s) => {
          const section = sliceAt(s, plate.manifold, d.socketZ + d.rBoss - 0.05);
          const { min, max } = section.bounds();
          const width = max[0] - min[0];
          if (profile === 'faceted') {
            expect(width).toBeCloseTo(2 * d.rBoss * Math.tan(Math.PI / 8) + 0.1, 2);
          } else {
            expect(width).toBeLessThan(2.5);
          }
        });
      });
    }
  });

  it('cuts the grub screw’s insert pocket down into the boss only when locked', () => {
    for (const lock of ['friction', 'screw'] as const) {
      const a = assemble(wallLamp({}, { lock }), { quality: 'draft' });
      const pv = pivotDims(a.interfaces.platePivot!);
      withPlate(a, 'draft', (plate, _p, d) => {
        scoped(k, (s) => {
          const y = d.seatY - pv.length / 2;
          const section = sliceAt(s, plate.manifold, d.socketZ + d.rBoss - 1);
          expect(inHole(section, 0, y, 1.9), lock).toBe(lock === 'screw');
          if (lock === 'screw') expect(inHole(section, 0, y, 2.2)).toBe(false);
        });
      });
    }
  });

  it.each(QUALITIES)('seats the knee’s spigot: its shoulder rests on the cup (%s)', (quality) => {
    const a = assemble(wallLamp(), { quality });
    const iface = a.interfaces.platePivot!;
    const knee = part(a, 'knee');
    const kd = deriveKnee(knee.params as KneeParams);
    withPlate(a, quality, (plate, _p, d) => {
      scoped(k, (s) => {
        const segs = QUALITY[quality].segments;
        const male = s.add(spigot(k, iface, { segs }));
        // In the plate's socket frame: joint (x, y, z) → print (−x, z, y) at the seat point.
        const socket: Mat4 = [-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, d.seatY, d.socketZ, 1];
        const id: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        expect(intersectionVolume(k, plate.manifold, id, male, socket)).toBeLessThan(1);
        // As the lamp places them: the knee frame is the knee's print frame moved down by the spigot.
        const kneeFrame = compose(knee.assembledTransform, translation(0, 0, kd.spigotLength));
        const T = plate.part.assembledTransform;
        expect(intersectionVolume(k, plate.manifold, T, male, kneeFrame)).toBeLessThan(1);
        // It rests there: 0.2 mm deeper, its shoulder digs into the cup.
        const deeper = compose(kneeFrame, translation(0, 0, -0.2));
        expect(intersectionVolume(k, plate.manifold, T, male, deeper)).toBeGreaterThan(10);
        // A spigot 0.2 mm too fat for the bore would not go in.
        const fat = s.add(
          spigot(
            k,
            {
              ...iface,
              nominalDiameter: iface.nominalDiameter + 2 * iface.tolerance + 0.4,
              tolerance: -iface.tolerance - 0.2,
            },
            { segs },
          ),
        );
        expect(intersectionVolume(k, plate.manifold, T, fat, kneeFrame)).toBeGreaterThan(50);
      });
    });
  });
});
