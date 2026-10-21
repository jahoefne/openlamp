import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dispose, type Kernel } from '@core/geometry/kernel.ts';
import { threadCam, threadSolid } from '@core/geometry/joints/thread.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
});

afterAll(() => tracker.restore());

const DEG = 180 / Math.PI;

/** Circular mean of angles in degrees, in [0, 360). */
function meanAngle(degs: readonly number[]): number {
  let x = 0;
  let y = 0;
  for (const d of degs) {
    x += Math.cos(d / DEG);
    y += Math.sin(d / DEG);
  }
  return (Math.atan2(y, x) * DEG + 360) % 360;
}

/** a − b wrapped to (−180, 180]. */
const angleDiff = (a: number, b: number) => ((((a - b + 180) % 360) + 360) % 360) - 180;

describe('threadCam', () => {
  it('has a root, 45° flanks over depth/pitch of a turn each and a crest', () => {
    const cam = threadCam(10, 0.8, 2.5, 128);
    const radii = cam.map(([x, y]) => Math.hypot(x, y));
    expect(Math.min(...radii)).toBeCloseTo(10, 9);
    expect(Math.max(...radii)).toBeCloseTo(10.8, 9);
    // The root starts at θ = 0, the crest is entered after root + flank = 0.18 + 0.32 of a turn.
    const crest = cam.filter(([x, y]) => Math.hypot(x, y) > 10.8 - 1e-9);
    const first = Math.min(...crest.map(([x, y]) => (Math.atan2(y, x) * DEG + 360) % 360));
    expect(first).toBeCloseTo(0.5 * 360, 6);
  });
});

describe('threadSolid', () => {
  it('is a right-hand thread: the crest at θ₀ near z = 0 is at θ₀ + 90° near z = pitch / 4', () => {
    const pitch = 2.5;
    const count = 116;
    const dz = 8 / count;
    const liveBefore = tracker.live();
    const solid = threadSolid(k, 10, { pitch, depth: 0.8 }, 0, count, dz, 'normal');
    try {
      expect(solid.status()).toBe('NoError');
      const mesh = solid.getMesh();
      const crestAt = (z: number): number[] => {
        const out: number[] = [];
        for (let v = 0; v < mesh.numVert; v++) {
          const x = mesh.vertProperties[v * 3]!;
          const y = mesh.vertProperties[v * 3 + 1]!;
          const vz = mesh.vertProperties[v * 3 + 2]!;
          if (Math.abs(vz - z) < 1e-4 && Math.hypot(x, y) > 10.8 - 1e-3) {
            out.push(Math.atan2(y, x) * DEG);
          }
        }
        return out;
      };
      // The division plane nearest to a quarter turn up the thread.
      const zQuarter = Math.round(pitch / 4 / dz) * dz;
      const bottom = crestAt(0);
      const quarter = crestAt(zQuarter);
      expect(bottom.length).toBeGreaterThan(5);
      expect(quarter.length).toBe(bottom.length);
      const turned = angleDiff(meanAngle(quarter), meanAngle(bottom));
      expect(turned).toBeCloseTo((360 * zQuarter) / pitch, 0); // ≈ +90°, counter-clockwise
      expect(turned).toBeGreaterThan(80);
    } finally {
      dispose(solid);
    }
    expect(tracker.live()).toBe(liveBefore);
  });
});
