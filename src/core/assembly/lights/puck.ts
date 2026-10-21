/**
 * LED puck lights (the Bambu Lab LED Lamp Kit-001 and custom pucks): the
 * envelope the hub is built around and the pocket it cuts.
 */
import type { LightEnvelope, PuckInsert } from '../../model/parts.ts';
import type { LightSource } from '../../model/project.ts';

type PuckLight = Extract<LightSource, { kind: 'puck' }>;

/**
 * The hub core around a puck is today's housing: `rCore = Ø/2 + clearance +
 * bossWall` (the classic shade's `rBoss`). The insert reaches from the mount
 * face down through the pocket and the ledge; the cable leaves sideways. An
 * LED puck stays cool: no heat zone.
 */
export function puckEnvelope(light: PuckLight): LightEnvelope {
  const rPocket = light.diameter / 2 + light.clearance;
  return {
    rCore: rPocket + light.bossWall,
    insertDepth: light.height + light.pocketExtraDepth + light.ledgeThickness,
    cableDiameter: light.cableWidth,
    cablePath: 'side',
  };
}

/** The pocket the hub cuts for the puck. */
export function puckInsert(light: PuckLight): PuckInsert {
  return {
    kind: 'puck',
    diameter: light.diameter,
    height: light.height,
    clearance: light.clearance,
    lightHoleDiameter: light.lightHoleDiameter,
    ledgeThickness: light.ledgeThickness,
    cableWidth: light.cableWidth,
    bossWall: light.bossWall,
    pocketExtraDepth: light.pocketExtraDepth,
  };
}
