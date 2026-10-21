/**
 * Types of the resolved assembly: what `assemble(project)` produces and the
 * builders, the cache, the worker and the exporters consume. Nothing here is
 * ever serialised; only the project is (see project.ts).
 */
import type { ErrorStatus, Vec3 } from 'manifold-3d';
import type {
  BaseLidParams,
  BaseParams,
  CanopyParams,
  CordGripParams,
  HubParams,
  ShadeParams,
  StemParams,
  WallArmParams,
  WallPlateParams,
} from './parts.ts';

export type Mm = number;
export type Deg = number;
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

/**
 * Part kinds with a builder (tiers and spacers join with the shade families of
 * M3): the hub and the shade, the pendant's canopy and cord grip, the standing
 * lamp's stem, base and base lid, the wall lamp's wall plate and arm.
 */
export type PartKind =
  'hub' | 'shade' | 'canopy' | 'cordGrip' | 'stem' | 'base' | 'baseLid' | 'wallPlate' | 'wallArm';

/**
 * The resolved parameters each part kind's builder takes. A `shade` is either
 * the fused single-piece print (hub + shade, today's classic shade) or a shade
 * of one family that ends in a collar (see parts.ts).
 */
export interface PartParamsByKind {
  hub: HubParams;
  shade: ShadeParams;
  canopy: CanopyParams;
  cordGrip: CordGripParams;
  stem: StemParams;
  base: BaseParams;
  baseLid: BaseLidParams;
  wallPlate: WallPlateParams;
  wallArm: WallArmParams;
}

// ---------------------------------------------------------------- joints

export type JointType = 'thread' | 'bayonet' | 'snap' | 'screw';

/** The joints a shade can hang from the hub with (`project.joints.shadeToHub`). */
export const SHADE_JOINT_TYPES = ['bayonet', 'snap', 'thread'] as const;
export type ShadeJointType = (typeof SHADE_JOINT_TYPES)[number];

export interface ThreadSpec {
  pitch: Mm;
  /** Radial depth of the teeth. */
  depth: Mm;
  /** Flank angle from the axis-normal plane; the trapezoid cam gives 45°. */
  flank: Deg;
  hand: 'right';
}

export interface BayonetSpec {
  lugs: number;
  /** Circumferential width of a lug. */
  lugWidth: Mm;
  /** Axial height of a lug (its 45° underside included). */
  lugHeight: Mm;
  /** How far a lug stands out of the collar. */
  lugDepth: Mm;
  /** Twist from the entry slot to the locked position. */
  travel: Deg;
}

export interface SnapSpec {
  /** Crush ribs on the male collar. */
  ribs: number;
  /** How far a rib stands out of the collar (more than the clearance: it crushes). */
  ribHeight: Mm;
}

export interface ScrewSpec {
  count: number;
  /** Through-hole diameter. */
  hole: Mm;
  /** Counterbore [diameter, depth] on the male side's head face. */
  counterbore: [Mm, Mm];
  /** Heat-set insert pocket [diameter, depth] on the female side; a tapping hole without. */
  insertPocket?: [Mm, Mm];
}

/**
 * One resolved joint between two parts, computed once by `assemble()` and
 * copied into the params of both parts, so the two sides cannot drift.
 *
 * Shade joints (thread, bayonet, snap) are collars: `nominalDiameter` is the
 * diameter of the male collar's cylindrical body (the thread root, the
 * surface the bayonet lugs and snap ribs stand on); the female ring's bore is
 * `tolerance` larger in radius. The joint spans `length` from the collar plane
 * (where the female part sits on the male one) into the female part. For
 * screws `nominalDiameter` is the bolt circle.
 */
export interface JointInterface {
  id: string;
  type: JointType;
  nominalDiameter: Mm;
  length: Mm;
  /** Radial clearance between the male collar and the female bore. */
  tolerance: Mm;
  thread?: ThreadSpec;
  bayonet?: BayonetSpec;
  snap?: SnapSpec;
  screw?: ScrewSpec;
  /** Part ids. */
  male: string;
  female: string;
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

/**
 * A part as a mount (or the assembler) describes it, before `assemble()` adds
 * its cache key, transforms and bed placement.
 */
export type PartDraft = {
  [K in PartKind]: {
    id: string;
    kind: K;
    displayName: string;
    params: PartParamsByKind[K];
    colour: Hex;
    /** Bed footprint in print orientation (an upper bound of the bounding box), without WASM. */
    footprint: Footprint;
    printNotes: string[];
    /** How many identical copies to print (identical stem segments are one part). */
    instances?: number;
  };
}[PartKind];

/**
 * What the lamp is mounted on, in world coordinates, for the viewport's
 * context planes and ghosts: the ceiling (strap, cord), a wall (wall arm) or
 * the floor (standing lamp).
 */
export interface MountContext {
  kind: 'ceiling' | 'wall' | 'floor';
  /** The ceiling plane (ceiling mounts). */
  ceilingZ?: Mm;
  /** The wall plane y = wallY (wall arm); the lamp stands out toward +y. */
  wallY?: Mm;
  /** The floor or table top (standing lamp). */
  floorZ?: Mm;
  /** The cord of a pendant, a vertical cylinder on the axis from z0 up to z1. */
  cord?: { z0: Mm; z1: Mm; diameter: Mm };
}

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
  /** Every joint between the parts, by id (also copied into both parts' params). */
  interfaces: Record<string, JointInterface>;
  layout: Layout;
  /**
   * Derived dimensions in world coordinates for the viewport and the panels:
   * `ceilingZ` + `ceilingGap` (the ceiling: for the strap the hub's mount face
   * plus the strap's gap, for the cord the ceiling itself with a gap of 0),
   * `bottomZ` (the lowest point of the lamp), `puckZ` / `puckDiameter` /
   * `puckHeight` (the light in its pocket; a bulb's or strip's numbers instead,
   * see `lightDerived` in assembly/lights), the strap's `strapWidth` /
   * `strapThickness` / `loopLength` / `rBoss`, the cord's `cordZ0` / `cordZ1` /
   * `cordDiameter` / `canopyZ`. The fused shade adds its `derive()` dimensions.
   */
  derived: Record<string, number>;
  /** What the lamp is mounted on (see `MountContext`). */
  context: MountContext;
  /** Every warning of every part plus project-level ones. */
  warnings: Warning[];
}
