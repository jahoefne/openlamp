/**
 * The wall arm's pivot (geometry/features/pivot.ts): the spigot and the
 * socket's cutters, in the pivot's joint frame.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { pivotDims, socketCutters, spigot } from '@core/geometry/features/pivot.ts';
import { liveObjects, scoped, type Kernel, type Manifold } from '@core/geometry/kernel.ts';
import type { JointInterface } from '@core/model/assembly.ts';
import { createDefaultProject, defaultMount } from '@core/model/project.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import { contourMinRadii } from '../../helpers/parts.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

/** The default wall lamp's plate pivot. */
function platePivot(): JointInterface {
  const p = createDefaultProject();
  p.mount = defaultMount('wallArm');
  return assemble(p).interfaces.platePivot!;
}

const SEGS = 128;

/** A plain round boss around the socket, its top face on the seat plane. */
function boss(iface: JointInterface): Manifold {
  const d = pivotDims(iface);
  const height = d.depth + 2;
  return k.Manifold.cylinder(height, d.rBoss, d.rBoss, SEGS).translate([0, 0, -height]);
}

describe('the pivot', () => {
  it('has the radii and depths of its joint', () => {
    const d = pivotDims(platePivot());
    expect(d).toMatchObject({ rSpigot: 7.5, length: 35, depth: 43, seat: 3, sump: 7 });
    expect(d.rBore).toBeCloseTo(7.8, 12);
    expect(d.rSeat).toBeCloseTo(10.8, 12);
    expect(d.rBoss).toBeCloseTo(7.8 * Math.SQRT2 + 2.5, 12);
  });

  it('builds a spigot whose 45° shoulder rests on the seat cup, the bore clear of it', () => {
    const iface = platePivot();
    const d = pivotDims(iface);
    const before = liveObjects();
    scoped(k, (s) => {
      const male = s.add(spigot(k, iface, { segs: SEGS, rTop: 13.5, top: 5 }));
      expect(male.status()).toBe('NoError');
      const bb = male.boundingBox();
      expect(bb.min[2]).toBeCloseTo(-35, 9);
      expect(bb.max[2]).toBeCloseTo(5, 9);
      // Halfway down: the spigot's radius.
      expect(contourMinRadii(s.add(male.slice(-20)))[0]).toBeCloseTo(7.5, 2);
      const female = s.add(
        k.Manifold.difference([
          s.add(boss(iface)),
          ...socketCutters(k, iface, { segs: SEGS }).map((m) => s.add(m)),
        ]),
      );
      expect(female.status()).toBe('NoError');
      // The bore: the spigot + tolerance, halfway down.
      expect(contourMinRadii(s.add(female.slice(-20)))[0]).toBeCloseTo(d.rBore, 2);
      // The cup: 45°, from the bore at −seat to rSeat at the seat plane.
      expect(contourMinRadii(s.add(female.slice(-d.seat / 2)))[0]).toBeCloseTo(
        d.rSeat - d.seat / 2,
        2,
      );
      // Seated: the cones touch, nothing overlaps.
      expect(s.add(k.Manifold.intersection(male, female)).volume()).toBeLessThan(1);
    });
    expect(liveObjects()).toBe(before);
  });

  it('cuts a teardrop bore toward the print’s up and a lock pocket along it', () => {
    const iface = platePivot();
    const d = pivotDims(iface);
    scoped(k, (s) => {
      const round = s.add(
        k.Manifold.difference([
          s.add(boss(iface)),
          ...socketCutters(k, iface, { segs: SEGS }).map((m) => s.add(m)),
        ]),
      );
      const cutters = socketCutters(k, iface, {
        segs: SEGS,
        point: [0, 1],
        lock: { outerRadius: d.rBoss, z: -d.length / 2 },
      }).map((m) => s.add(m));
      expect(cutters).toHaveLength(4);
      const locked = s.add(k.Manifold.difference([s.add(boss(iface)), ...cutters]));
      expect(locked.status()).toBe('NoError');
      expect(locked.volume()).toBeLessThan(round.volume() - 1);
      // The teardrop's point reaches r·√2 toward +y, below the lock.
      const section = s.add(locked.slice(-d.length + 2));
      const bb = section.bounds();
      expect(bb.max[0]).toBeCloseTo(d.rBoss, 1);
      const probe = s.add(
        s.add(k.CrossSection.circle(0.2, 16)).translate([0, d.rBore * Math.SQRT2 - 0.5]),
      );
      expect(s.add(k.CrossSection.intersection(section, probe)).area()).toBeLessThan(1e-6);
    });
  });
});
