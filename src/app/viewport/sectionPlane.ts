/**
 * The one section plane every part material clips against. It is always in
 * the materials' `clippingPlanes` (toggling the list would recompile the
 * shaders); when the section is off it is pushed 1e6 mm away instead.
 *
 * three.js clips what lies on the negative side of a plane. Both orientations
 * remove the half facing the default camera (which looks from +x, −y), so the
 * cut face is what you see.
 */
import { Plane, Vector3 } from 'three';
import type { SectionAxis } from '../store/uiStore.ts';

export const sectionPlane = new Plane(new Vector3(0, 1, 0), 0);

/** The clipping-plane list shared by every part material and outline. */
export const sectionPlanes: readonly Plane[] = [sectionPlane];

const OFF = 1e6;

export function applySection(on: boolean, axis: SectionAxis): void {
  if (axis === 'x') sectionPlane.normal.set(-1, 0, 0);
  else sectionPlane.normal.set(0, 1, 0);
  sectionPlane.constant = on ? 0 : OFF;
}
