/**
 * Part registry: one builder per part kind, and `buildPart` to run the right one
 * for a part spec.
 */
import type { GeometryStats, PartKind, PartParamsByKind, PartStats } from '../model/assembly.ts';
import type { Kernel, Manifold } from './kernel.ts';
import { buildBase } from './parts/base.ts';
import { buildBaseLid } from './parts/baseLid.ts';
import { buildCanopy } from './parts/canopy.ts';
import { buildCordGrip } from './parts/cordGrip.ts';
import { buildFitFemale, buildFitMale } from './parts/fitPair.ts';
import { buildHanger } from './parts/hanger.ts';
import { buildHub } from './parts/hub.ts';
import { buildKnee } from './parts/knee.ts';
import { buildKnob } from './parts/knob.ts';
import { buildShade } from './parts/shade.ts';
import { buildSpacer } from './parts/spacer.ts';
import { buildStem } from './parts/stem.ts';
import { buildTierPart } from './parts/tier.ts';
import { buildWallArm } from './parts/wallArm.ts';
import { buildWallPlate } from './parts/wallPlate.ts';
import type { Quality } from './quality.ts';

/**
 * Builds one part in its print orientation (bed = z 0). The caller owns the
 * returned manifold and must dispose it.
 */
export type Builder<P> = (
  k: Kernel,
  params: P,
  quality: Quality,
) => { manifold: Manifold; stats: GeometryStats };

export const PART_BUILDERS: { readonly [K in PartKind]: Builder<PartParamsByKind[K]> } = {
  hub: buildHub,
  shade: buildShade,
  tier: buildTierPart,
  spacer: buildSpacer,
  canopy: buildCanopy,
  cordGrip: buildCordGrip,
  stem: buildStem,
  base: buildBase,
  baseLid: buildBaseLid,
  wallPlate: buildWallPlate,
  knee: buildKnee,
  wallArm: buildWallArm,
  hanger: buildHanger,
  knob: buildKnob,
  fitMale: buildFitMale,
  fitFemale: buildFitFemale,
};

/** One line per part kind, for the CLI's `list`. */
export const PART_KIND_DESCRIPTIONS: { readonly [K in PartKind]: string } = {
  hub: 'holds the light, hangs from the mount and holds the shade (two-part lamps)',
  shade:
    'the shade: hub and shade fused into one print (the classic shade), or a shade with a collar (revolved, slatted, geometric)',
  tier: 'one tier of a tiered (PH-style) shade; the top tier carries the collar (M3b)',
  spacer: 'a Ø5 mm rod with pins that holds two tiers of a tiered shade apart (M3b)',
  canopy: 'the ceiling canopy of a pendant: cord hole, screw slots, collet neck (grip collet)',
  cordGrip: 'the screw-on grip that clamps the cord in the canopy collet (print in PETG)',
  stem: 'a stem segment of the standing lamp: tube with cable bore, male thread on top, female thread or screw flange below',
  base: 'the weighted base of the standing lamp: weight pocket, cable groove, insert pockets for the stem flange',
  baseLid: 'the lid of the base weight pocket (snap ring or three screws)',
  wallPlate:
    'the canopy plate of the wall arm: blind keyholes, the cable groove in its back, the socket boss the knee turns in',
  knee: 'the wall arm’s knee: a spigot that turns in a socket (swing), a toothed tang that carries a link (tilt)',
  wallArm:
    'a link of the wall arm: straight or curved tube between toothed clevises (or a tang), or a socket boss for a swing elbow',
  hanger: 'the wall arm’s hanger: a toothed tang over the female thread the hub screws into',
  knob: 'a knob for a hinge of the wall arm: holds the M5 nut that clamps the hinge’s teeth',
  fitMale:
    'fit test: a section of the shade collar with the joint (lugs, ribs or thread) on a base disc',
  fitFemale: "fit test: a section of the hub's collar ring with the joint's slots or thread",
};

/** What a builder needs of a part spec: its kind and the matching params. */
export type BuildableSpec = {
  [K in PartKind]: { kind: K; params: PartParamsByKind[K] };
}[PartKind];

/**
 * Build a part and time it. The quality defaults to the one `assemble()` baked
 * into the part's params (and its buildKey).
 */
export function buildPart(
  k: Kernel,
  spec: BuildableSpec,
  quality: Quality = spec.params.quality,
): { manifold: Manifold; stats: PartStats } {
  const t0 = Date.now();
  const { manifold, stats } = runBuilder(k, spec, quality);
  return { manifold, stats: { ...stats, buildMs: Date.now() - t0 } };
}

function runBuilder(
  k: Kernel,
  spec: BuildableSpec,
  quality: Quality,
): { manifold: Manifold; stats: GeometryStats } {
  switch (spec.kind) {
    case 'hub':
      return PART_BUILDERS.hub(k, spec.params, quality);
    case 'shade':
      return PART_BUILDERS.shade(k, spec.params, quality);
    case 'tier':
      return PART_BUILDERS.tier(k, spec.params, quality);
    case 'spacer':
      return PART_BUILDERS.spacer(k, spec.params, quality);
    case 'canopy':
      return PART_BUILDERS.canopy(k, spec.params, quality);
    case 'cordGrip':
      return PART_BUILDERS.cordGrip(k, spec.params, quality);
    case 'stem':
      return PART_BUILDERS.stem(k, spec.params, quality);
    case 'base':
      return PART_BUILDERS.base(k, spec.params, quality);
    case 'baseLid':
      return PART_BUILDERS.baseLid(k, spec.params, quality);
    case 'wallPlate':
      return PART_BUILDERS.wallPlate(k, spec.params, quality);
    case 'knee':
      return PART_BUILDERS.knee(k, spec.params, quality);
    case 'wallArm':
      return PART_BUILDERS.wallArm(k, spec.params, quality);
    case 'hanger':
      return PART_BUILDERS.hanger(k, spec.params, quality);
    case 'knob':
      return PART_BUILDERS.knob(k, spec.params, quality);
    case 'fitMale':
      return PART_BUILDERS.fitMale(k, spec.params, quality);
    case 'fitFemale':
      return PART_BUILDERS.fitFemale(k, spec.params, quality);
  }
}
