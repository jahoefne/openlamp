/**
 * Types of the resolved assembly: what `assemble(project)` produces and the
 * builders, the cache, the worker and the exporters consume. Nothing here is
 * ever serialised; only the project is (see project.ts).
 */
import type { ErrorStatus, Vec3 } from 'manifold-3d';
import type { ClassicShadeParams } from '../schema/defs.ts';

export type Mm = number;
export type Hex = `#${string}`;
/** 4×4 matrix, 16 numbers, column-major (the layout three.js and manifold use). */
export type Mat4 = number[];

export const IDENTITY: readonly number[] = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

export type Severity = 'error' | 'warning' | 'info';

export interface Warning {
  severity: Severity;
  /** Stable machine-readable code, e.g. `clamped` or `bed-fit`. */
  code: string;
  message: string;
  partId?: string;
  /** Dotted path into the project, e.g. `shades.0.style.topDiameter`, or a flat parameter key. */
  paramPath?: string;
}

/** Part kinds with a builder. M1 has just the fused classic shade. */
export type PartKind = 'classicShade';

/** The resolved parameters each part kind's builder takes. */
export interface PartParamsByKind {
  classicShade: ClassicShadeParams;
}

/** Axis-aligned extent of a part in its print orientation, in mm. */
export interface Footprint {
  x: Mm;
  y: Mm;
  z: Mm;
}

export interface BBox {
  min: Vec3;
  max: Vec3;
}

/** What a builder reports about the manifold it built. */
export interface GeometryStats {
  status: ErrorStatus;
  triangles: number;
  vertices: number;
  volumeMm3: number;
  estGramsPla: number;
  bbox: BBox;
  /** Steepest overhang in degrees from vertical. */
  maxOverhangDeg: number;
  /** Builder-specific derived dimensions (all numbers). */
  derived?: Readonly<Record<string, number>>;
}

export interface PartStats extends GeometryStats {
  buildMs: number;
}

interface PartSpecCommon {
  id: string;
  displayName: string;
  /** Canonical JSON of `{ kind, params }`: cache key, identical for identical parts. */
  buildKey: string;
  /** cyrb53 of `buildKey`, short enough for file names. */
  hash: string;
  colour: Hex;
  instances: number;
  /** Print frame → world (assembled lamp). */
  assembledTransform: Mat4;
  /** Print frame → bed (plate layout); bed origin at the front-left corner. */
  printTransform: Mat4;
  bedFootprint?: Footprint;
  printNotes: string[];
  warnings: Warning[];
}

/** One printable part, self-contained: its params are all its builder needs. */
export type PartSpec = {
  [K in PartKind]: PartSpecCommon & { kind: K; params: PartParamsByKind[K] };
}[PartKind];

/** A part placed on the bed by `layoutParts`. */
export interface Placement {
  id: string;
  /** Centre of the footprint in bed coordinates. */
  x: Mm;
  y: Mm;
  /** Extent on the bed after the optional 90° rotation. */
  width: Mm;
  depth: Mm;
  /** Rotated 90° about z to fit. */
  rotated: boolean;
}

export interface Layout {
  bed: [x: Mm, y: Mm, z: Mm];
  placements: Placement[];
  /** Ids of parts that did not fit on the bed (they are still exported). */
  overflow: string[];
}

export interface Assembly {
  parts: PartSpec[];
  layout: Layout;
  /** Derived dimensions worth showing (classic shade: `derive()`). */
  derived: Record<string, number>;
  /** Every warning of every part plus project-level ones. */
  warnings: Warning[];
}
