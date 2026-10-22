/**
 * Resolved parameters of the part builders: what `assemble()` hands each
 * builder (and the cache key is made of). Plain data, all lengths in mm.
 *
 * Interfaces flow one way (light → hub core → collar → shade; mount → hub
 * mount face), so a builder never computes a mating dimension itself: the hub
 * and the shade both read the same `JointInterface` and collar numbers.
 */
import type { Quality } from '../geometry/quality.ts';
import type { SurfaceStyleName } from '../geometry/surface.ts';
import type {
  ARM_SHAPES,
  BASE_LIDS,
  BulbFitting,
  BulbSize,
  ClassicShadeParams,
  GeometricVariant,
  LATTICE_HOLE_SHAPES,
} from '../schema/defs.ts';
import type { Deg, JointInterface, Mm } from './assembly.ts';

// ---------------------------------------------------------------- lights

/**
 * Where a hot light (a bulb) wants printed parts to keep away, in the hub's
 * own frame (the collar plane at z 0, the light below it; a standing lamp's
 * placement turns it over with the hub): nothing printed within `rMin` of the
 * axis between `z0` and `z1`.
 */
export interface HeatZone {
  z0: Mm;
  z1: Mm;
  rMin: Mm;
}

/** What the hub has to make room for, whatever the light source (see assembly/lights). */
export interface LightEnvelope {
  /**
   * Radius of the hub core around the light; the shade collar is
   * `2·(rCore + 1.5)`. The puck housing (pocket + boss wall), a bulb's skirt
   * plus the air annulus around it, the strip's ring plus the strip and two walls.
   */
  rCore: Mm;
  /** How far the light insert reaches into the hub (the puck: from its mount face; a bulb or strip: from the light face). */
  insertDepth: Mm;
  cableDiameter: Mm;
  /** The cable leaves the hub through its side wall or along the axis. */
  cablePath: 'side' | 'axial';
  /** Hot lights only (bulbs): the bulb plus its `heatClearance`. */
  heatZone?: HeatZone;
}

/** The pocket a puck light sits in: today's pocket, ledge, light opening and cable slot. */
export interface PuckInsert {
  kind: 'puck';
  diameter: Mm;
  /** The puck's thickness (every insert's `height` is its light's length along the axis). */
  height: Mm;
  /** Radial gap around the puck. */
  clearance: Mm;
  lightHoleDiameter: Mm;
  ledgeThickness: Mm;
  cableWidth: Mm;
  /** Wall of the housing around the pocket. */
  bossWall: Mm;
  /** The pocket is this much deeper than the puck. */
  pocketExtraDepth: Mm;
}

/**
 * A bulb's lampholder: a plate with the lampholder's hole on top of a skirt
 * that stands on the light face (the bed), its inside rising at 45° to the
 * hole so it prints without support; the chamber above the plate (the cable,
 * the M10 nut in its hexagonal recess) under the mount face; `vents` Ø6 vents
 * through the hub's shoulder above the air annulus around the skirt.
 */
export interface BulbInsert {
  kind: 'bulb';
  size: BulbSize;
  fitting: BulbFitting;
  holeDiameter: Mm;
  plateThickness: Mm;
  skirtDiameter: Mm;
  skirtHeight: Mm;
  /** Wall of the skirt (the hub's wall). */
  wall: Mm;
  cableDiameter: Mm;
  /** Number of Ø6 vents through the shoulder. */
  vents: number;
  bulbDiameter: Mm;
  /** The bulb's length, cap included (it hangs from the skirt's rim). */
  height: Mm;
}

/**
 * An LED strip ring: a channel `channelWidth` × `channelDepth` opening on the
 * light face of a wide disc, from `ringDiameter / 2` outward; the strip is
 * stuck to its ceiling, its cable leaves through a slot in the ceiling and
 * runs over the disc to the boss in the middle.
 */
export interface StripInsert {
  kind: 'strip';
  ringDiameter: Mm;
  stripWidth: Mm;
  /** The strip's thickness (its length along the axis). */
  height: Mm;
  /** `stripWidth + 0.4`. */
  channelWidth: Mm;
  channelDepth: Mm;
  cableWidth: Mm;
  /** Wall of the disc and its rim (the hub's wall). */
  wall: Mm;
}

/** The light insert the hub cuts: a puck pocket, a bulb's lampholder plate, a strip channel. */
export type LightInsert = PuckInsert | BulbInsert | StripInsert;

// ---------------------------------------------------------------- mounts

/**
 * Belt-loop tunnels for a velcro strap across the top of the hub. The only
 * *open* mount face: the puck drops into its pocket from the top and the
 * strap holds it in.
 */
export interface StrapMountFace {
  kind: 'strap';
  strapWidth: Mm;
  strapThickness: Mm;
  loopLength: Mm;
  loopWall: Mm;
}

/**
 * Every other mount face is *closed*: a 45° roof (dome) over the light pocket
 * carries the mount's feature on its apex, and the puck is pressed into its
 * pocket from the light face (crush ribs hold it).
 *
 * The cord boss: a cylinder on the apex with a hole Ø `cordDiameter + 1`; the
 * cord is fed down through it and knotted inside the hub, where the knot sits
 * in a cavity Ø 3.5 × cord, 1.5 × cord tall, under the hole (a 45° ceiling).
 */
export interface CordBossMountFace {
  kind: 'cordBoss';
  cordDiameter: Mm;
}

/** A hollow male threaded stub on the apex (the hub is the joint's male side), cable bore through. */
export interface ThreadMaleMountFace {
  kind: 'threadMale';
  /** Thread joint: `nominalDiameter` = the stub's root Ø, `length` = the stub's thread length. */
  joint: JointInterface;
  cableDiameter: Mm;
}

/** A female threaded bore in a boss on the apex (the hub is the joint's female side), cable bore through. */
export interface ThreadFemaleMountFace {
  kind: 'threadFemale';
  /** Thread joint: `nominalDiameter` = the mating male's root Ø, `length` = the bore's depth. */
  joint: JointInterface;
  cableDiameter: Mm;
}

/** What a mount puts on the hub's mount face. */
export type HubMountFace =
  StrapMountFace | CordBossMountFace | ThreadMaleMountFace | ThreadFemaleMountFace;
export type HubMountFaceKind = HubMountFace['kind'];
/** The closed mount faces (a roof over the light pocket). */
export type ClosedMountFace = Exclude<HubMountFace, StrapMountFace>;

/** The hub's mount face (alias of `HubMountFace`). */
export type MountFace = HubMountFace;

// ---------------------------------------------------------------- collar

/**
 * The shade collar and the hub ring it sits in, resolved from the joint once
 * so that both parts use the same numbers.
 */
export interface CollarDims {
  /** Radius of the male collar's body: `joint.nominalDiameter / 2`. */
  radius: Mm;
  /** Wall of the collar tube (its bore is `radius - wall`). */
  wall: Mm;
  /** Bore of the hub ring: `radius + joint.tolerance`. */
  ringInnerRadius: Mm;
  /**
   * Outer radius of the hub ring; the shade's seat (the flat annulus the ring
   * stands on) reaches out exactly this far, so the two outer surfaces meet flush.
   */
  seatRadius: Mm;
}

// ---------------------------------------------------------------- parts

export interface HubParams {
  insert: LightInsert;
  envelope: LightEnvelope;
  mountFace: HubMountFace;
  /** Wall of the hub's shoulder cone. */
  wallThickness: Mm;
  /** Slope of the hub's shoulder cone from horizontal (≥ 45° prints without support). */
  shoulderAngle: Deg;
  /** The (outer) shade's collar and the hub ring around it. */
  collar: CollarDims;
  /** The (outer) shade's joint; the hub is its female side. */
  joint: JointInterface;
  /**
   * With an inner shade: its collar and the second hub ring around it,
   * concentric inside the outer one (`hub.radialGap` of air between them).
   */
  innerCollar?: CollarDims;
  /** With an inner shade: its joint (same type as `joint`); the hub is its female side. */
  innerJoint?: JointInterface;
  quality: Quality;
}

export interface SurfaceParams {
  style: SurfaceStyleName;
  patternCount: number;
  ribDepth: Mm;
  twist: Deg;
}

/** A revolved shade that ends in a collar (the hub holds it). */
export interface RevolvedShadeParams {
  variant: 'revolved';
  bottomDiameter: Mm;
  /** Diameter where the wall meets the shade's own shoulder cone. */
  topDiameter: Mm;
  /** Height of the wall up to the shoulder. */
  height: Mm;
  curve: number;
  wallThickness: Mm;
  shoulderAngle: Deg;
  surface: SurfaceParams;
  collar: CollarDims;
  /** The shade joint; the shade is its male side. */
  joint: JointInterface;
  quality: Quality;
}

/**
 * A slatted shade that ends in a collar (M3a, `parts/shades/slatted.ts`): a
 * bottom ring on the bed, `slatCount` flat slats (each the hull of its two
 * end rectangles, held `ringHeight / 2` deep in the rings), a top ring and a
 * 45° shoulder cone up to the collar's seat.
 */
export interface SlattedShadeParams {
  variant: 'slatted';
  /** Outer Ø of the bottom ring (on the bed). */
  bottomDiameter: Mm;
  /** Outer Ø of the top ring. */
  topDiameter: Mm;
  /** From the bed to the top of the top ring. */
  height: Mm;
  ringHeight: Mm;
  /** Wall of the shoulder cone. */
  wallThickness: Mm;
  slatCount: number;
  slatWidth: Mm;
  slatThickness: Mm;
  /** Turn of each slat about its own long axis (0 = along the rings). */
  louvreAngle: Deg;
  /** How far each slat runs around the axis from the bottom ring to the top ring. */
  twist: Deg;
  collar: CollarDims;
  /** The shade joint; the shade is its male side. */
  joint: JointInterface;
  quality: Quality;
}

/**
 * A geometric shade that ends in a collar (M3b, `parts/shades/geometric.ts`):
 * `pattern` polyhedral (`sides`, `twist`), pleated (`pleatCount`,
 * `pleatDepth`, `bands`) or lattice (`holeShape`, `holeSize`, `holePitch`);
 * the other patterns' fields may be left out (so they do not change the
 * buildKey).
 */
export interface GeometricShadeParams {
  variant: 'geometric';
  pattern: GeometricVariant;
  bottomDiameter: Mm;
  topDiameter: Mm;
  height: Mm;
  wallThickness: Mm;
  sides?: number;
  twist?: Deg;
  pleatCount?: number;
  pleatDepth?: Mm;
  bands?: number;
  holeShape?: (typeof LATTICE_HOLE_SHAPES)[number];
  holeSize?: Mm;
  holePitch?: Mm;
  collar: CollarDims;
  /** The shade joint; the shade is its male side. */
  joint: JointInterface;
  quality: Quality;
}

/** Hub and outer shade as one print: the classic shade's flat parameters. */
export type FusedShadeParams = ClassicShadeParams & { variant: 'fused' };

/**
 * A `shade` part: the fused print, or a shade of one family that ends in a
 * collar (revolved, slatted, geometric; a tiered shade is `tier` parts).
 */
export type ShadeParams =
  FusedShadeParams | RevolvedShadeParams | SlattedShadeParams | GeometricShadeParams;

// ---------------------------------------------------------------- tiered shade parts (M3b)

/**
 * One tier of a tiered (PH-style) shade (part kind `tier`, built by
 * `parts/shades/tiered.ts`): the revolve of a curved shell from its inner,
 * upper edge (Ø `2·rInner`) down and out to its outer, lower edge (Ø
 * `2·rOuter`), `drop` tall, bowed by `curve`; tiers overlap so the light is
 * never seen directly. The top tier carries the collar and the joint's male
 * side; the others hang from spacers. Each prints the way up its overhang
 * analysis chose (`flipped`).
 */
export interface TierParams {
  /** 0 = the top tier, counting down. */
  index: number;
  /** Tiers in the shade. */
  count: number;
  /** The shell's profile. */
  profile: { rInner: Mm; rOuter: Mm; drop: Mm; curve: number };
  wallThickness: Mm;
  /** Role flags: the top tier carries the collar, the bottom one has no tier below it. */
  role: { top: boolean; bottom: boolean };
  /** Printed upside down (its overhang is smaller that way). */
  flipped: boolean;
  /** Ø4.3 sockets for the spacers to the tier above / below: how many, and on which radius. */
  spacerSockets: { count: number; diameter: Mm; above?: { radius: Mm }; below?: { radius: Mm } };
  /** The top tier's collar and joint (male side). */
  collar?: CollarDims;
  joint?: JointInterface;
  quality: Quality;
  /**
   * The spacers' axes to the tier above / below, tilted from vertical toward
   * the rim (perpendicular to the shells), degrees; the sockets are bored
   * along them, centred where they cross the shell's mid-surface (the
   * `spacerSockets` radii). Vertical without.
   */
  spacerTiltDeg?: { above?: Deg; below?: Deg };
}

/** A spacer between two tiers (part kind `spacer`): a Ø5 rod with a Ø4 × 3 pin at each end. */
export interface SpacerParams {
  /** Rod Ø. */
  diameter: Mm;
  /** Rod length between the pins. */
  length: Mm;
  /** The pins at both ends: Ø × length. */
  pin: { diameter: Mm; length: Mm };
  quality: Quality;
  /**
   * The slopes of its end faces (dz/dx, falling toward +x of its print
   * frame), so they sit flush on the tiers' faces; square ends without.
   * `length` is measured on the axis.
   */
  endSlopes?: { top: number; bottom: number };
}

// ---------------------------------------------------------------- mount parts

/**
 * The ceiling canopy of a pendant (part kind `canopy`): a revolved shallow
 * cone, printed ceiling-face-down, narrowing toward the room. A 45° recess on
 * the ceiling side holds the cord's knot (grip `knot`) above the cord hole;
 * two radial screw slots with head counterbores fix it to the ceiling. With a
 * collet grip, a threaded neck with slits stands on the room side.
 */
export interface CanopyParams {
  diameter: Mm;
  height: Mm;
  /** Distance between the two ceiling screws. */
  screwSpacing: Mm;
  /** Radial screw slots: width × length, a head counterbore Ø, and the material left under it. */
  screwSlot: { width: Mm; length: Mm; headDiameter: Mm; floor: Mm };
  /** Cord hole Ø (cord + 1). */
  cordHole: Mm;
  /** The collet neck (grip `collet`): its thread (the canopy is the male side) and its slits. */
  collet?: { joint: JointInterface; slits: number; slitWidth: Mm };
  quality: Quality;
}

/**
 * The cord grip of a collet pendant (part kind `cordGrip`): a cap with an
 * internal thread (the female side of the canopy's collet joint) and a 45°
 * conical bore that presses the collet's slit tip onto the cord as the cap is
 * screwed home. Printed open end down; PETG recommended.
 */
export interface CordGripParams {
  joint: JointInterface;
  /** Cord hole Ø through the top (cord + 1). */
  cordHole: Mm;
  /**
   * The cone touches the collet's tip (with the joint's tolerance) while the
   * cap's mouth is still this far from the canopy: the clamping travel.
   */
  travel: Mm;
  /** Wall around the thread. */
  wall: Mm;
  quality: Quality;
}

// The parts of the wall arm and the standing lamp. Fields follow the plan's
// part table; the mount modules fill them in.

/**
 * A stem segment of the standing lamp (part kind `stem`): a tube with a cable
 * bore, a male thread on top (into the next segment, or into the hub's female
 * bore) and a female thread at the bottom, or, for the bottom segment, a screw
 * flange to the base. Printed vertical, female end (or flange) down. All
 * `segment` segments share one buildKey (one part, `instances` = their count).
 */
export interface StemParams {
  /** `base`: the bottom segment with the screw flange; `segment`: every other one. */
  variant: 'base' | 'segment';
  /** Tube length, without the male thread on top. */
  length: Mm;
  diameter: Mm;
  /** Cable bore Ø (cable + 1). */
  boreDiameter: Mm;
  /** Male thread on top (the stem is its male side). */
  top: JointInterface;
  /** Female thread at the bottom (variant `segment`). */
  bottom?: JointInterface;
  /** Screw flange at the bottom (variant `base`): Ø × thickness, screwed to the base (male side). */
  flange?: { diameter: Mm; thickness: Mm; screws: JointInterface };
  /** Surface pattern on the middle of the tube; smooth when absent. */
  fluting?: SurfaceParams;
  quality: Quality;
}

/**
 * The weighted base (part kind `base`): a flat-topped revolved disc with a
 * ≤ 45° chamfer, an annular weight pocket opening on the underside (minus a
 * solid spoke with a cable groove from the central bore to a rim notch) and
 * heat-set pockets on top for the stem's flange. Printed top-face-down.
 */
export interface BaseParams {
  diameter: Mm;
  height: Mm;
  /** Depth of the weight pocket from the underside. */
  pocketDepth: Mm;
  /** Height of the 45° chamfer around the top edge. */
  chamfer: Mm;
  /** Central cable bore Ø. */
  boreDiameter: Mm;
  /** Underside cable groove (width × depth) in a solid spoke `spokeWidth` wide. */
  cableGroove: { width: Mm; depth: Mm; spokeWidth: Mm };
  /** The stem flange's screws (the base is the female side: inserts or tapping holes). */
  stemScrews: JointInterface;
  /** How the lid closes the weight pocket; `screws` uses `lidJoint` (the base is its female side). */
  lid: (typeof BASE_LIDS)[number];
  lidJoint?: JointInterface;
  quality: Quality;
}

/** The lid of the base's weight pocket (part kind `baseLid`): a flat annulus. Printed flat. */
export interface BaseLidParams {
  outerDiameter: Mm;
  innerDiameter: Mm;
  thickness: Mm;
  lid: (typeof BASE_LIDS)[number];
  /** Screws (`lid: 'screws'`; the lid is the male side). */
  joint?: JointInterface;
  /** Radial clearance of a snap lid in the pocket. */
  tolerance: Mm;
  quality: Quality;
}

/**
 * The wall plate (part kind `wallPlate`): an extruded rounded rectangle with
 * two keyhole slots to hang it on screws, heat-set pockets for the arm's
 * flange and a cable notch in its bottom edge. Printed back-face-down.
 */
export interface WallPlateParams {
  width: Mm;
  height: Mm;
  thickness: Mm;
  cornerRadius: Mm;
  /** Keyholes on the vertical centre line: spacing, head Ø, slot width, slot length. */
  keyholes: { spacing: Mm; headDiameter: Mm; slotWidth: Mm; length: Mm };
  /** The arm flange's screws (the plate is the female side). */
  armScrews: JointInterface;
  /** Notch in the bottom edge for the cable: width × depth. */
  cableNotch: { width: Mm; depth: Mm };
  quality: Quality;
}

/**
 * The wall arm (part kind `wallArm`): a tube from a flange on the wall plate
 * to an end boss whose female thread takes the hub's stub from below; cable
 * bore throughout. `straight` = horizontal, `angled` = rising `riseAngle`,
 * `curved` = a torus sector sweeping `riseAngle`. Printed standing on its flange.
 */
export interface WallArmParams {
  shape: (typeof ARM_SHAPES)[number];
  /** From the wall plate to the hub's axis. */
  length: Mm;
  riseAngle: Deg;
  tubeDiameter: Mm;
  /** Cable bore Ø (cable + 1). */
  boreDiameter: Mm;
  /** Flange on the wall plate: Ø × thickness. */
  flange: { diameter: Mm; thickness: Mm };
  /** The flange's screws into the plate (the arm is the male side). */
  plateScrews: JointInterface;
  /** The hub's threaded stub (the arm's end boss is the female side). */
  hubJoint: JointInterface;
  quality: Quality;
}

// ---------------------------------------------------------------- fit test

/**
 * One piece of the fit-test pair (part kinds `fitMale` and `fitFemale`, see
 * geometry/parts/fitPair.ts): a short section of the outer shade's collar
 * (male) or of the hub's outer collar ring (female), built from the same
 * collar numbers and `JointInterface` as the real parts, on a base so it
 * stands on the bed.
 */
export interface FitPieceParams {
  /** The outer shade's collar and the hub ring around it. */
  collar: CollarDims;
  /** The shade joint (`shadeToHub`); the male piece is its male side, the female piece its female side. */
  joint: JointInterface;
  /** Height of the collar (ring) section above the base. */
  height: Mm;
  /** Thickness of the base: the male's base disc (its top is the collar plane), the female's ring base at its mouth. */
  base: Mm;
  /** Outer radius of the base, a grip margin outside the hub ring's outer radius. */
  baseRadius: Mm;
  quality: Quality;
}
