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
import type { ClassicShadeParams } from '../schema/defs.ts';
import type { Deg, JointInterface, Mm } from './assembly.ts';

// ---------------------------------------------------------------- lights

/** What the hub has to make room for, whatever the light source (see assembly/lights). */
export interface LightEnvelope {
  /** Radius of the hub core around the light (the puck housing: pocket + boss wall). */
  rCore: Mm;
  /** How deep the light insert reaches into the hub, measured from its mount face. */
  insertDepth: Mm;
  cableDiameter: Mm;
  /** The cable leaves the hub through its side wall or along the axis. */
  cablePath: 'side' | 'axial';
  /** The light's own body plus the clearance hot parts must keep from it. */
  heatZone: { radius: Mm; length: Mm; clearance: Mm };
}

/** The pocket a puck light sits in: today's pocket, ledge, light opening and cable slot. */
export interface PuckInsert {
  kind: 'puck';
  diameter: Mm;
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

/** The light insert the hub cuts (bulb sockets and strip channels join in M2.3). */
export type LightInsert = PuckInsert;

// ---------------------------------------------------------------- mounts

/** Belt-loop tunnels for a velcro strap across the top of the hub. */
export interface StrapMountFace {
  kind: 'strap';
  strapWidth: Mm;
  strapThickness: Mm;
  loopLength: Mm;
  loopWall: Mm;
}

/** What a mount puts on the hub's mount face (cord bosses and threads join in M2.2). */
export type MountFace = StrapMountFace;

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
  mountFace: MountFace;
  /** Wall of the hub's shoulder cone. */
  wallThickness: Mm;
  /** Slope of the hub's shoulder cone from horizontal (≥ 45° prints without support). */
  shoulderAngle: Deg;
  collar: CollarDims;
  /** The shade joint; the hub is its female side. */
  joint: JointInterface;
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

/** Hub and outer shade as one print: the classic shade's flat parameters. */
export type FusedShadeParams = ClassicShadeParams & { variant: 'fused' };

export type ShadeParams = FusedShadeParams | RevolvedShadeParams;
