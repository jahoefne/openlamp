/**
 * The mount framework: every mount kind is one `MountModule`, registered in
 * `mounts/index.ts`, so `assemble()` stays generic. Pure, no WASM.
 *
 *   assemble ─► normalize? ─► validate ─► hubFace ─► (hub + shades resolved) ─► parts ─► placement
 *
 * - `hubFace` says what the hub carries on its mount face (belt loops, a cord
 *   boss, a male thread stub or a female thread bore) before the hub is built
 *   around the light.
 * - `parts` adds the mount's own parts (canopy, cord grip, stem, base, wall
 *   plate, arm …) and the joints between them (and to the hub).
 * - `placement` puts the hub, the shades and those parts into the world and
 *   says what the lamp is mounted on (ceiling, wall, floor).
 */
import type { HubDerived } from '../../geometry/parts/hub.ts';
import type { Quality } from '../../geometry/quality.ts';
import type {
  Hex,
  JointInterface,
  Mat4,
  MountContext,
  PartDraft,
  PartKind,
  Warning,
} from '../../model/assembly.ts';
import type { HubMountFace, HubParams, LightEnvelope } from '../../model/parts.ts';
import type { Joints, LightSource, MountOf } from '../../model/project.ts';
import type { MountKind } from '../../schema/defs.ts';
import type { PrinterSpec } from '../../schema/printers.ts';

export type { MountKind } from '../../schema/defs.ts';

/** What every step of a mount module may read. */
export interface MountCtx<K extends MountKind = MountKind> {
  /** The mount, clamped to its parameter definitions (and by `normalize`, if any). */
  mount: MountOf<K>;
  light: LightSource;
  envelope: LightEnvelope;
  /** The joint settings, normalised (tolerance, thread pitch / depth, heat-set inserts). */
  joints: Joints;
  printer: PrinterSpec;
  /** Colour overrides by part id or part kind. */
  colours: Readonly<Record<string, Hex>>;
  quality: Quality;
}

/** One part of a shade, for `placement`. */
export interface MountShadePart {
  /** Part id. */
  id: string;
  /** Print frame → shade frame (the hub's frame: the collar plane at z 0, the shade below it). */
  transform: Mat4;
  /**
   * Print frame → shade frame of every copy of a part with instances (a
   * tiered shade's spacers); `placement` gives each copy the shade's transform
   * too, in `MountPlacement.instanceTransforms`.
   */
  instanceTransforms?: readonly Mat4[];
}

/**
 * A shade hanging from the hub, for `placement`. Its frame is the hub's (the
 * collar planes meet at z 0); `placement` gives every one of its parts the
 * shade's transform (`hangingTransforms`, or the standing lamp's flip) applied
 * after the part's own (`mountShadeParts`).
 */
export interface MountShade {
  /** Part id of its collar part. */
  id: string;
  /** Height of its collar plane in its collar part's print frame; it meets the hub's collar plane (z 0). */
  zCollar: number;
  /** Its lowest point in the shade frame (≤ 0); default −zCollar (a part standing on its open end). */
  zBottom?: number;
  /** Its parts; default the collar part alone, hanging at −zCollar. */
  parts?: readonly MountShadePart[];
}

/** `MountCtx` once the hub is resolved. */
export interface MountHubCtx<K extends MountKind = MountKind> extends MountCtx<K> {
  hub: {
    params: HubParams;
    /** In the hub's print frame: the collar plane at z 0, the mount face at `zFace`, the top at `hubHeight`. */
    derived: HubDerived;
  };
  /** The shades hanging from the hub. */
  shades: readonly MountShade[];
}

export interface MountParts {
  /** The mount's own parts. Their ids must not clash with `hub` and `shade`. */
  parts: PartDraft[];
  /** Joints between them and to the hub (also copied into both parts' params). */
  interfaces: JointInterface[];
  /** Warnings about them (non-adjusting). */
  warnings?: Warning[];
}

export interface MountPlacement {
  /** Hub print frame → world. */
  hubTransform: Mat4;
  /** Print frame → world of every shade part, by part id. */
  shadeTransforms: Record<string, Mat4>;
  /** Print frame → world for each of the mount's parts, by part id. */
  partTransforms: Record<string, Mat4>;
  /**
   * Print frame → world of every copy of a part with `instances` (as many as
   * it has), by part id: the mount's own parts (the stacked stem segments) and
   * the shades' parts with copies (`MountShadePart.instanceTransforms` with the
   * shade's transform applied, see `hangingTransforms`); without an entry
   * every copy is at its `partTransforms` / `shadeTransforms` one.
   */
  instanceTransforms?: Record<string, Mat4[]>;
  /** World z of the lamp's lowest point (the viewport lifts the scene by −bottomZ). */
  bottomZ: number;
  /** What the lamp is mounted on, in world coordinates. */
  context: MountContext;
  /** Extra world-frame numbers for `Assembly.derived` (ghosts, panels). */
  derived: Record<string, number>;
}

/**
 * One mount kind. `K` ties the module to its variant of `Mount`.
 */
export interface MountModule<K extends MountKind = MountKind> {
  readonly kind: K;
  /** The part kinds this mount adds (the CLI's `part <kind>` uses the mount's defaults). */
  readonly partKinds: readonly PartKind[];
  /**
   * Cross-parameter rules after the schema clamp (`normalizeMountParams`):
   * adjust and warn (paramPath `mount.…`).
   */
  normalize?(mount: MountOf<K>): { mount: MountOf<K>; warnings: Warning[] };
  /** Project checks that adjust nothing (errors, warnings, infos). */
  validate(ctx: MountCtx<K>): Warning[];
  /** What the hub carries on its mount face. */
  hubFace(ctx: MountCtx<K>): HubMountFace;
  /** The mount's own parts and joints. Not called in fit-test mode (the joint's test pair is printed instead). */
  parts(ctx: MountHubCtx<K>): MountParts;
  /** World transforms of everything, and what the lamp is mounted on. */
  placement(ctx: MountHubCtx<K>, parts: MountParts): MountPlacement;
  /** For the CLI's `part <kind>`: this mount, changed so that it has a part of `kind`. */
  withPart?(kind: PartKind, mount: MountOf<K>): MountOf<K>;
}
