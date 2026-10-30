/**
 * A stand-in solid for a part whose builder is not written yet: a box (or a
 * cylinder) filling its bed footprint, standing on the bed and centred on the
 * print origin, with proper stats. Always `NoError`, never throws, so the
 * examples, the CLI's samples and the tests that build every part keep
 * working while the real builder is under way.
 */
import type { Footprint, GeometryStats } from '../../model/assembly.ts';
import { scoped, type Kernel, type Manifold } from '../kernel.ts';

export function placeholderPart(
  k: Kernel,
  footprint: Footprint,
  options: { round?: boolean; segs?: number; derived?: Readonly<Record<string, number>> } = {},
): { manifold: Manifold; stats: GeometryStats } {
  return scoped(k, (s) => {
    const { Manifold } = k;
    const { x, y, z } = footprint;
    const solid = options.round
      ? s.add(
          s
            .add(Manifold.cylinder(z, Math.min(x, y) / 2, Math.min(x, y) / 2, options.segs ?? 64))
            .scale([x / Math.min(x, y), y / Math.min(x, y), 1]),
        )
      : s.add(s.add(Manifold.cube([x, y, z], true)).translate([0, 0, z / 2]));
    const bb = solid.boundingBox();
    const volume = solid.volume();
    const stats: GeometryStats = {
      status: solid.status(),
      triangles: solid.numTri(),
      vertices: solid.numVert(),
      volumeMm3: volume,
      estGramsPla: (volume / 1000) * 1.24,
      bbox: { min: bb.min, max: bb.max },
      maxOverhangDeg: 0,
      ...(options.derived ? { derived: options.derived } : {}),
    };
    return { manifold: s.keep(solid), stats };
  });
}
