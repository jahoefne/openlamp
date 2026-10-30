/**
 * Teardrop sections: a circle with a 45° point, so a horizontal bore (or a
 * horizontal cylinder's underside) prints without support. Point the drop up
 * (+z in print) for a hole, down for a solid's underside.
 */
import { scoped, type CrossSection, type Kernel } from '../kernel.ts';

/**
 * A teardrop section: a circle of radius r with a 45° point `r·√2` from its
 * centre toward ±y. The caller owns the result.
 */
export function teardrop(k: Kernel, r: number, segs: number, toward: 1 | -1): CrossSection {
  return scoped(k, (s) => {
    const circle = s.add(k.CrossSection.circle(r, segs));
    return s.keep(s.add(k.CrossSection.hull([circle, [[[0, toward * r * Math.SQRT2]]]])));
  });
}

/**
 * A teardrop section pointing along the unit vector `toward` (in the
 * section's plane): `teardrop` turned. The caller owns the result.
 */
export function teardropToward(
  k: Kernel,
  r: number,
  segs: number,
  toward: readonly [number, number],
): CrossSection {
  return scoped(k, (s) => {
    const circle = s.add(k.CrossSection.circle(r, segs));
    const len = Math.hypot(toward[0], toward[1]) || 1;
    const tip: [number, number] = [
      (toward[0] / len) * r * Math.SQRT2,
      (toward[1] / len) * r * Math.SQRT2,
    ];
    return s.keep(s.add(k.CrossSection.hull([circle, [[tip]]])));
  });
}
