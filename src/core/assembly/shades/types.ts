/**
 * The shade framework: every shade style family is one `ShadeModule`,
 * registered in `shades/index.ts`, so `assemble()` stays generic (it mirrors
 * the mounts' `MountModule`). Pure, no WASM.
 *
 *   assemble ─► (collar joints resolved) ─► normalize? ─► widen the top ─► validate ─► parts ─► profile?
 *
 * - `normalize` clamps the family's flat parameters and applies its rules
 *   that adjust (the slatted shade's slat count, say);
 * - the assembler then widens the top the body presents to the collar
 *   (`collarTop`, `widenTop`) to clear the hub ring (`widenShadeTop` in
 *   interfaces.ts);
 * - `validate` adds the family's checks that adjust nothing;
 * - `parts` returns the shade's printable parts (one, or several: a tiered
 *   shade's tiers and spacers), each with its transform into the shade frame;
 * - `profile` returns the shade's radii for the inner / outer clearance check
 *   (a family without one gets an info instead of the check).
 *
 * The shade frame is the hub's frame: the collar plane at z 0, the shade
 * hanging below it (z < 0). The mount places every part of a shade, and
 * every copy of a part with instances, with the shade's transform
 * (`hangingTransforms`, the standing lamp's flip).
 */
import type { Quality } from '../../geometry/quality.ts';
import type {
  Hex,
  JointInterface,
  Mat4,
  PartDraft,
  PartKind,
  Warning,
} from '../../model/assembly.ts';
import type { CollarDims, LightEnvelope } from '../../model/parts.ts';
import type { Joints, LightSource, ShadeRole, ShadeStyleOf } from '../../model/project.ts';
import type { ShadeFamily } from '../../schema/defs.ts';
import type { PrinterSpec } from '../../schema/printers.ts';

export type { ShadeFamily } from '../../schema/defs.ts';

/** What every step of a shade module may read. */
export interface ShadeCtx<F extends ShadeFamily = ShadeFamily> {
  /** The outer shade (`shades[0]`) or the inner one (`shades[1]`). */
  role: ShadeRole;
  /**
   * Part id of the shade's collar part (`shade`, `innerShade`); its further
   * parts are `<id>-<suffix>` (see `shadePartId`), so they belong to its node.
   */
  id: string;
  /** The shade's style (clamped and widened once `normalize` and the widening ran). */
  style: ShadeStyleOf<F>;
  /** The shade's wall (the spec's `wallThickness`, clamped by `normalize`). */
  wallThickness: number;
  /** The collar part's colour: an override by part id (`colours.shade`), else the shade's own. */
  colour: Hex;
  /** Colour overrides by part id or part kind. */
  colours: Readonly<Record<string, Hex>>;
  /** The collar and the hub ring it sits in. */
  collar: CollarDims;
  /** The shade's collar joint (the shade is its male side). */
  joint: JointInterface;
  /** The smallest top Ø (whole mm) that clears the hub ring: `minShadeTopDiameter(collar)`. */
  minTopDiameter: number;
  light: LightSource;
  envelope: LightEnvelope;
  /** The joint settings, normalised. */
  joints: Joints;
  printer: PrinterSpec;
  quality: Quality;
}

/** One printable part of a shade. */
export interface ShadePart {
  draft: PartDraft;
  /** Print frame → shade frame (the collar plane at z 0, the shade hanging below it). */
  transform: Mat4;
  /**
   * Print frame → shade frame of every copy of a part with `draft.instances`
   * (as many as it has, e.g. the spacers of one gap of a tiered shade, turned
   * about the lamp's axis); `transform` is the first one. Without it every
   * copy is at `transform`.
   */
  instanceTransforms?: Mat4[];
}

export interface ShadeParts {
  /** The shade's parts; the first one carries the collar and has the shade's id. */
  parts: ShadePart[];
  /** Joints between them (a tier and its spacers); the collar joint is the assembler's. */
  interfaces: JointInterface[];
  /** Height of the collar plane in the collar part's print frame. */
  zCollar: number;
  /** The shade's lowest point in the shade frame (≤ 0). */
  zBottom: number;
  /** Warnings about them (non-adjusting). */
  warnings?: Warning[];
}

/**
 * A shade's radii in the shade frame, for checks that need no mesh (the
 * clearance between an inner and an outer shade, a bulb's heat zone), for
 * `−depth ≤ z < 0`.
 */
export interface ShadeProfile {
  /** How far the shade reaches below the collar plane (−zBottom). */
  depth: number;
  /** The outermost surface at height z (a pattern's crests included). */
  outerAt(z: number): number;
  /** Where the material starts, seen from the axis (a pattern's troughs included). */
  innerAt(z: number): number;
}

/**
 * One shade style family. `F` ties the module to its variant of `ShadeStyle`.
 */
export interface ShadeModule<F extends ShadeFamily = ShadeFamily> {
  readonly family: F;
  /** The part kinds this family builds (the CLI's `list`). */
  readonly partKinds: readonly PartKind[];
  /** Its own parts are not built yet: `parts` returns a revolved stand-in (M3a's tiered and geometric stubs). */
  readonly pending?: boolean;
  /**
   * Clamp the style and the wall to the family's definitions and apply its
   * rules that adjust; warnings with project paths (`shades.<i>.style.…`).
   */
  normalize?(ctx: ShadeCtx<F>): {
    style: ShadeStyleOf<F>;
    wallThickness: number;
    warnings: Warning[];
  };
  /** Checks that adjust nothing (errors, warnings, infos). */
  validate(ctx: ShadeCtx<F>): Warning[];
  /** The Ø the top of the body presents to the collar (the hub ring must clear it). */
  collarTop(ctx: ShadeCtx<F>): number;
  /**
   * The style widened so that `collarTop` is at least `minCollarTop`; by
   * default `topDiameter` grows by the difference (exact when `collarTop` is
   * `topDiameter`).
   */
  widenTop?(ctx: ShadeCtx<F>, minCollarTop: number): ShadeStyleOf<F>;
  /** The shade's parts, their transforms into the shade frame and their joints. */
  parts(ctx: ShadeCtx<F>): ShadeParts;
  /** Radii for the inner / outer clearance check; none: the check is an info. */
  profile?(ctx: ShadeCtx<F>): ShadeProfile | undefined;
}
