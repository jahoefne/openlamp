/**
 * The fit-test pair of a two-part lamp: a section of the shade collar
 * (`fitMale`) and one of the hub ring (`fitFemale`), built from the same
 * `shadeToHub` joint as the real parts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIT_FEMALE_ID, FIT_MALE_ID, assemble } from '@core/assembly/assemble.ts';
import { withInnerShade } from '@core/assembly/innerShade.ts';
import { scoped, type Kernel } from '@core/geometry/kernel.ts';
import { FIT_BASE, FIT_GRIP, FIT_SECTION } from '@core/geometry/parts/fitPair.ts';
import { SHADE_JOINT_TYPES, type ShadeJointType } from '@core/model/assembly.ts';
import type { FitPieceParams } from '@core/model/parts.ts';
import { createDefaultProject, defaultMount, type Project } from '@core/model/project.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';
import {
  assembled,
  byId,
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

function splitProject(type: ShadeJointType, edit: (p: Project) => void = () => {}): Project {
  const p = createDefaultProject({ id: 'test', updatedAt: '2026-10-21T00:00:00.000Z' });
  p.hub.fused = false;
  p.joints.shadeToHub = type;
  edit(p);
  return p;
}

const fitTest = (p: Project) => {
  p.fitTest = true;
};

const paramsOf = (p: { params: unknown }) => p.params as FitPieceParams;

describe('fit-test mode of a two-part lamp', () => {
  it('prints the joint test pair instead of the lamp, from the real shade joint', () => {
    const real = assemble(splitProject('bayonet'));
    const a = assemble(splitProject('bayonet', fitTest));
    expect(a.parts.map((x) => [x.id, x.kind, x.displayName])).toEqual([
      [FIT_MALE_ID, 'fitMale', 'Collar test piece'],
      [FIT_FEMALE_ID, 'fitFemale', 'Ring test piece'],
    ]);
    const joint = a.interfaces.shadeToHub!;
    // The same joint as the shade and the hub use, only between the two pieces.
    expect(joint).toEqual({
      ...real.interfaces.shadeToHub,
      male: FIT_MALE_ID,
      female: FIT_FEMALE_ID,
    });
    const hub = real.parts.find((x) => x.id === 'hub')!;
    for (const part of a.parts) {
      const params = paramsOf(part);
      expect(params.joint).toEqual(joint);
      if (hub.kind === 'hub') expect(params.collar).toEqual(hub.params.collar);
      expect(params).toMatchObject({ height: FIT_SECTION, base: FIT_BASE });
      expect(params.baseRadius).toBeCloseTo(params.collar.seatRadius + FIT_GRIP, 9);
      expect(part.printNotes[0]).toMatch(/^Print as exported/);
      expect(part.printNotes.join(' ')).toMatch(/print both test pieces/);
      expect(part.printNotes.join(' ')).toMatch(/joint clearance \(Hub & joints, now 0\.3 mm\)/);
    }
    // The collar piece in the shade's colour, the ring piece in the hub's.
    expect(a.parts[0]!.colour).toBe(real.parts.find((x) => x.id === 'shade')!.colour);
    expect(a.parts[1]!.colour).toBe(hub.colour);
    // Assembled as the shade hangs from the hub, standing on the floor.
    expect(a.parts[0]!.assembledTransform[14]).toBeCloseTo(-FIT_BASE, 9);
    expect(a.parts[1]!.assembledTransform[14]).toBe(0);
    expect(a.derived.bottomZ).toBe(-FIT_BASE);
    expect(a.context).toEqual({ kind: 'floor', floorZ: -FIT_BASE });
    expect(a.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
  });

  it('uses the outer joint with an inner shade, and the mounts add nothing', () => {
    const pendant = (p: Project) => {
      p.mount = defaultMount('ceilingCord');
      p.fitTest = true;
    };
    const plain = assemble(splitProject('thread', pendant));
    expect(plain.parts.map((x) => x.id)).toEqual([FIT_MALE_ID, FIT_FEMALE_ID]);
    const inner = assemble(withInnerShade(splitProject('thread', pendant)));
    expect(inner.parts.map((x) => x.id)).toEqual([FIT_MALE_ID, FIT_FEMALE_ID]);
    // The outer collar moved out by the radial gap: the pair follows it.
    expect(inner.interfaces.shadeToHub!.nominalDiameter).toBeGreaterThan(
      plain.interfaces.shadeToHub!.nominalDiameter,
    );
    expect(paramsOf(inner.parts[0]!).joint.nominalDiameter).toBe(
      inner.interfaces.shadeToHub!.nominalDiameter,
    );
  });

  it('keeps the housing ring for the fused single-piece print', () => {
    const p = createDefaultProject();
    p.fitTest = true;
    const a = assemble(p);
    expect(a.parts.map((x) => [x.id, x.displayName])).toEqual([['shade', 'Fit-test ring']]);
  });
});

describe.each(SHADE_JOINT_TYPES)('the %s test pair', (type) => {
  const a = assemble(splitProject(type, fitTest), { quality: 'normal' });
  const iface = a.interfaces.shadeToHub!;

  it('builds two valid, small solids without leaks that fit with the clearance', () => {
    withBuilt(k, tracker, a.parts, 'normal', (built) => {
      const male = byId(built, FIT_MALE_ID);
      const female = byId(built, FIT_FEMALE_ID);
      for (const b of [male, female]) {
        expect(b.stats.status, b.part.id).toBe('NoError');
        const { min, max } = b.stats.bbox;
        expect(min[2], b.part.id).toBeCloseTo(0, 6);
        expect(max[2] - min[2], b.part.id).toBeLessThanOrEqual(40);
        expect(max[2], b.part.id).toBeCloseTo(FIT_BASE + FIT_SECTION, 6);
        // The footprint is an upper bound of the bounding box.
        const f = b.part.bedFootprint!;
        expect(max[0] - min[0], b.part.id).toBeLessThanOrEqual(f.x + 1e-6);
        expect(max[1] - min[1], b.part.id).toBeLessThanOrEqual(f.y + 1e-6);
        // Printable as exported: nothing steeper than the joint's own 45°. Left
        // out: the thread's twisted facets (see the thread tests) and slivers
        // under 0.1 mm² (the crush ribs' 0.5 mm ends, where a bayonet slot
        // meets its groove), as on the shade and the hub.
        const threadFacet = (tri: readonly (readonly number[])[]) =>
          type === 'thread' &&
          tri.every(([x = 0, y = 0]) => Math.hypot(x, y) < iface.nominalDiameter / 2 + 2);
        const over = maxOverhangDeg(b.manifold, { minArea: 0.1, ignore: threadFacet });
        expect(over, b.part.id).toBeLessThanOrEqual(45 + 1e-3);
      }
      scoped(k, (s) => {
        const placedMale = s.add(assembled(male));
        const placedFemale = s.add(assembled(female));
        const overlap = s.add(k.Manifold.intersection(placedMale, placedFemale)).volume();
        // Bayonet and thread: none (they touch on the collar plane only); the
        // press fit's crush ribs: a sliver by design.
        expect(overlap).toBeLessThan(1);
        if (type !== 'snap') expect(overlap).toBeLessThan(1e-3);

        // Halfway up the joint, the ring's bore is the clearance outside the collar.
        const z = iface.length / 2 + 1e-3;
        const bore = contourMinRadii(s.add(placedFemale.slice(z)))[0]!;
        const collar = contourMinRadii(s.add(placedMale.slice(z)));
        // Contours of the collar from the inside out: its bore, its outer surface.
        expect(collar).toHaveLength(2);
        expect(Math.abs(bore - collar[1]! - iface.tolerance)).toBeLessThan(0.005);
      });
    });
  });
});
