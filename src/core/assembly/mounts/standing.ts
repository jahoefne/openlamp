/**
 * The standing lamp (table or floor): a weighted base on the floor, a stem of
 * equal segments screwed together, the hub turned over on top of the stem
 * (light face up) and the shade flaring upward from it.
 *
 *          ╲   shade   ╱     open end up (flipped like the hub)
 *           ╲─┬─────┬─╱      hubZ: the hub's collar plane
 *             │ hub │        light face up, mount face down
 *             └┬───┬┘        stemZ1: the hub's female bore takes the top segment's male thread
 *              │   │         stem segments (one part, `instances` copies) …
 *              ├───┤         … stem ↔ stem thread joints (same Ø20 × 14 thread)
 *              │   │
 *            ══╧═══╧══       stemZ0: the stem foot's flange, 4 M3 screws into the base
 *        ╭────────────────╮  base: weight pocket, lid, cable groove out through the rim
 *   ═════╧════════════════╧═════ floorZ 0
 *
 * The hub's mount face is a female thread bore (`hubFaceJoint`, root Ø20,
 * 14 deep); every stem segment carries the same male thread on top, and every
 * segment but the foot the same female thread at its bottom, so the segments
 * above the foot are identical: one part with `instances`. With a single
 * segment, it is the foot. `table` and `floor` differ by their defaults only
 * (`standingDefaults`).
 */
import {
  BASE_SPOKE_WIDTH,
  BASE_TOP_SKIN,
  baseFootprint,
  baseLidThickness,
  basePocketRadii,
} from '../../geometry/parts/base.ts';
import { baseLidFootprint } from '../../geometry/parts/baseLid.ts';
import { minStemDiameter, stemFootprint } from '../../geometry/parts/stem.ts';
import type { JointInterface, Mat4, PartDraft, Warning } from '../../model/assembly.ts';
import type { BaseLidParams, BaseParams, StemParams } from '../../model/parts.ts';
import { defaultMount, type MountOf } from '../../model/project.ts';
import type { STANDING_VARIANTS } from '../../schema/defs.ts';
import { printerLabel } from '../../schema/printers.ts';
import {
  HUB_THREAD_BORE,
  SNAP_CLEARANCE_REDUCTION,
  mountThreadJoint,
  screwJoint,
} from '../interfaces.ts';
import { compose, flipX, translation } from '../transforms.ts';
import { mountPartColour } from './common.ts';
import type { MountCtx, MountModule } from './types.ts';

type StandingMount = MountOf<'standing'>;
type StandingVariant = (typeof STANDING_VARIANTS)[number];

/** The id of the stem ↔ hub joint (the stem's top is male, the hub's bore female). */
export const STEM_TO_HUB_JOINT_ID = 'stemToHub';
/** The joint between stem segments (the lower one's top is male, the upper one's bottom female). */
export const STEM_TO_STEM_JOINT_ID = 'stemToStem';
/** The stem foot's flange screwed to the base (4 × M3, inserts or tapping holes in the base). */
export const STEM_TO_BASE_JOINT_ID = 'stemToBase';
/** A screwed lid of the weight pocket (3 × M3 tapping into bosses in the base). */
export const LID_TO_BASE_JOINT_ID = 'lidToBase';

/**
 * The stem foot's flange: Ø stem + 20 × 4 mm, 4 M3 screws on a bolt circle of
 * Ø stem + 11 (the heads sit on the flange: no counterbore in 4 mm).
 */
export const STEM_FLANGE = Object.freeze({
  extraDiameter: 20,
  thickness: 4,
  boltCircleExtra: 11,
  screws: 4,
});
/** Screws of a screwed lid. */
export const LID_SCREWS = 3;
/** The central cable bore of the base: at least this Ø, and the cable + 1. */
export const BASE_BORE = 10;
/** The cable groove under the base: at least width × depth, and the cable + 1 (within the spoke). */
export const BASE_GROOVE = Object.freeze({ width: 5, depth: 4 });
/** Wall the spoke keeps on each side of the groove, mm. */
const GROOVE_WALL = 1.6;
/** The 45° chamfer around the base's top edge: at most this, and a third of the base's height. */
const BASE_CHAMFER = 4;
/** Room for the weight above a lid in the pocket, mm. */
const MIN_WEIGHT_SPACE = 3;

/** Defaults by variant; the table lamp's are the schema's (MOUNT_DEFAULTS). */
const FLOOR_DEFAULTS = Object.freeze({
  base: { diameter: 280, height: 30, pocketDepth: 22 },
  stem: { totalHeight: 1300, segmentLength: 220, diameter: 32 },
});

/** The standing mount with every parameter at the default of its variant (a floor lamp is taller, on a Ø280 base). */
export function standingDefaults(variant: StandingVariant): StandingMount {
  const m = defaultMount('standing');
  if (variant === 'table') return { ...m, variant };
  return {
    ...m,
    variant,
    base: { ...m.base, ...FLOOR_DEFAULTS.base },
    stem: { ...m.stem, ...FLOOR_DEFAULTS.stem },
  };
}

/** How the stem is split: `count` equal segments of `length` (each plus the male thread on top). Pure. */
export function stemLayout(mount: Pick<StandingMount, 'stem'>): { count: number; length: number } {
  const { totalHeight, segmentLength } = mount.stem;
  const count = Math.max(1, Math.ceil(totalHeight / segmentLength - 1e-9));
  return { count, length: totalHeight / count };
}

const mm = (n: number) => (Math.round(n * 10) / 10).toString();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The thread joint of the hub's mount face: the top stem segment's male
 * thread (root Ø20, 14 mm) into the hub's female bore.
 */
export function hubFaceJoint(ctx: MountCtx<'standing'>) {
  return mountThreadJoint(
    STEM_TO_HUB_JOINT_ID,
    { male: 'stem', female: 'hub' },
    HUB_THREAD_BORE,
    ctx.joints,
    ctx.printer.nozzle,
  );
}

const SEGMENT_PRINT_NOTES = [
  'Print as exported: female thread on the bed, male thread up. No supports needed.',
  'Assembly: feed the cable through the segments, then screw each one onto the one below, clockwise seen from above, until the shoulders meet.',
];
const FOOT_PRINT_NOTES = [
  'Print as exported: flange on the bed, thread up. No supports needed.',
  'Screw the flange onto the base with 4 M3 × 8 screws; the heads sit on the flange.',
];
const BASE_PRINT_NOTES = [
  'Print as exported: top face on the bed, weight pocket and cable groove up. No supports needed.',
  'Fill the pocket with steel shot, washers or sand, close it with the lid, and lay the cable in the groove under the base, out through the notch in the rim.',
];
const BASE_INSERT_NOTE = 'Press 4 M3 heat-set inserts into the pockets in the top face.';
const BASE_TAP_NOTE = 'The stem screws tap into the 4 holes in the top face.';
const LID_PRINT_NOTES = [
  'Print as exported: flat, the side that faces into the pocket on the bed.',
];
const LID_SNAP_NOTE =
  "Press the lid into the pocket's mouth, notch over the spoke; the three crush ribs hold it.";
const LID_SCREW_NOTE = 'Fix the lid with 3 M3 × 6 screws into the bosses in the pocket.';

/** The resolved stem: segments, Ø (raised for the threads, with a warning), joints. */
function resolveStem(ctx: MountCtx<'standing'>, warnings: Warning[]) {
  const { mount, joints } = ctx;
  const layout = stemLayout(mount);
  const hub = hubFaceJoint(ctx).iface;
  let diameter = mount.stem.diameter;
  const min = Math.ceil(2 * minStemDiameter(hub)) / 2;
  if (diameter < min) {
    warnings.push({
      severity: 'warning',
      code: 'adjusted',
      partId: 'stem',
      paramPath: 'mount.stem.diameter',
      message: `Stem Ø raised to ${mm(min)} mm so the Ø${HUB_THREAD_BORE.diameter} mm threads between the segments fit inside it`,
    });
    diameter = min;
  }
  let between: JointInterface | undefined;
  if (layout.count > 1) {
    const j = mountThreadJoint(
      STEM_TO_STEM_JOINT_ID,
      { male: 'stemFoot', female: 'stem' },
      HUB_THREAD_BORE,
      joints,
      ctx.printer.nozzle,
    );
    warnings.push(...j.warnings);
    between = j.iface;
  }
  const footId = layout.count > 1 ? 'stemFoot' : 'stem';
  const flangeScrews = screwJoint(
    STEM_TO_BASE_JOINT_ID,
    { male: footId, female: 'base' },
    diameter + STEM_FLANGE.boltCircleExtra,
    joints,
    STEM_FLANGE.screws,
  );
  // No counterbore in a 4 mm flange: the heads sit on it.
  const screws: JointInterface = flangeScrews.screw
    ? {
        ...flangeScrews,
        screw: { ...flangeScrews.screw, counterbore: [flangeScrews.screw.counterbore[0], 0] },
      }
    : flangeScrews;
  return { ...layout, diameter, hub, between, screws, footId };
}

/** Whether `len + thread` and the base fit the printer (infos at the fields; the bed-fit warnings name the parts). */
function bedInfos(ctx: MountCtx<'standing'>): Warning[] {
  const { mount, printer } = ctx;
  const [bx, by, bz] = printer.bed;
  const name = printerLabel(printer);
  const out: Warning[] = [];
  const { length } = stemLayout(mount);
  const tall = length + HUB_THREAD_BORE.length;
  if (tall > bz) {
    out.push({
      severity: 'info',
      code: 'stem-bed',
      paramPath: 'mount.stem.segmentLength',
      message: `Stem segments are ${mm(length)} mm plus the ${HUB_THREAD_BORE.length} mm thread (${mm(tall)} mm), taller than the ${name}'s ${bz} mm; a segment length up to ${mm(bz - HUB_THREAD_BORE.length)} mm prints upright.`,
    });
  }
  const bed = Math.min(bx, by);
  if (mount.base.diameter > bed) {
    out.push({
      severity: 'info',
      code: 'base-bed',
      paramPath: 'mount.base.diameter',
      message:
        mount.variant === 'floor'
          ? `A floor lamp wants a wide base, but Ø${mm(mount.base.diameter)} mm does not fit the ${name}'s ${bed} mm bed; print the base on a larger printer, or make it Ø${bed} mm or less and fill the pocket with heavier weights.`
          : `The Ø${mm(mount.base.diameter)} mm base does not fit the ${name}'s ${bed} mm bed; make it Ø${bed} mm or less.`,
    });
  }
  return out;
}

export const standingMount: MountModule<'standing'> = {
  kind: 'standing',
  partKinds: ['stem', 'base', 'baseLid'],

  /** The weight pocket keeps a top skin over it and room for the weight over its lid. */
  normalize(mount) {
    const warnings: Warning[] = [];
    const { height, pocketDepth, lid } = mount.base;
    const max = height - BASE_TOP_SKIN;
    const min = baseLidThickness(lid) + MIN_WEIGHT_SPACE;
    let depth = pocketDepth;
    if (depth > max) {
      depth = max;
      warnings.push({
        severity: 'warning',
        code: 'adjusted',
        partId: 'base',
        paramPath: 'mount.base.pocketDepth',
        message: `Weight pocket depth reduced to ${mm(depth)} mm so ${BASE_TOP_SKIN} mm of the ${mm(height)} mm base stay over it`,
      });
    } else if (depth < min) {
      depth = min;
      warnings.push({
        severity: 'warning',
        code: 'adjusted',
        partId: 'base',
        paramPath: 'mount.base.pocketDepth',
        message: `Weight pocket depth raised to ${mm(depth)} mm so the ${mm(baseLidThickness(lid))} mm lid leaves room for the weight`,
      });
    }
    if (depth === pocketDepth) return { mount, warnings };
    return { mount: { ...mount, base: { ...mount.base, pocketDepth: depth } }, warnings };
  },

  validate(ctx) {
    const joint = hubFaceJoint(ctx);
    const warnings = [...joint.warnings, ...bedInfos(ctx)];
    // §2.8: a thread at least three layers deep (layers of half the nozzle).
    const depth = joint.iface.thread?.depth ?? 0;
    const layers = 3 * (ctx.printer.nozzle / 2);
    if (depth < layers - 1e-9) {
      warnings.push({
        severity: 'warning',
        code: 'joint',
        partId: 'stem',
        paramPath: 'joints.threadDepth',
        message: `A ${mm(depth)} mm deep thread is under three ${mm(ctx.printer.nozzle / 2)} mm layers; the stem's threads may strip.`,
      });
    }
    return warnings;
  },

  hubFace: (ctx) => ({
    kind: 'threadFemale',
    joint: hubFaceJoint(ctx).iface,
    cableDiameter: ctx.mount.stem.cableDiameter,
  }),

  parts(ctx) {
    const { mount, joints, quality } = ctx;
    const warnings: Warning[] = [];
    const stem = resolveStem(ctx, warnings);
    const cable = mount.stem.cableDiameter;
    const boreDiameter = cable + 1;
    const parts: PartDraft[] = [];

    const foot: StemParams = {
      variant: 'base',
      length: stem.length,
      diameter: stem.diameter,
      boreDiameter,
      top: stem.between ?? stem.hub,
      flange: {
        diameter: stem.diameter + STEM_FLANGE.extraDiameter,
        thickness: STEM_FLANGE.thickness,
        screws: stem.screws,
      },
      quality,
    };
    if (stem.between) {
      // Every segment above the foot: the top one's male thread screws into the
      // hub, the others' into the next segment (the same thread: one part).
      const segment: StemParams = {
        variant: 'segment',
        length: stem.length,
        diameter: stem.diameter,
        boreDiameter,
        top: stem.between,
        bottom: stem.between,
        quality,
      };
      const copies = stem.count - 1;
      parts.push({
        id: 'stem',
        kind: 'stem',
        displayName: copies > 1 ? `Stem segment ×${copies}` : 'Stem segment',
        params: segment,
        colour: mountPartColour(ctx, 'stem', 'stem'),
        footprint: stemFootprint(segment),
        printNotes: [...(copies > 1 ? [`Print ${copies} of these.`] : []), ...SEGMENT_PRINT_NOTES],
        instances: copies,
      });
    }
    parts.push({
      id: stem.footId,
      kind: 'stem',
      displayName: stem.between ? 'Stem foot' : 'Stem',
      params: foot,
      colour: mountPartColour(ctx, stem.footId, 'stem'),
      footprint: stemFootprint(foot),
      printNotes: [...FOOT_PRINT_NOTES],
    });

    // The base: the cable groove runs in the spoke, as wide and deep as the cable needs.
    const height = mount.base.height;
    const chamfer = Math.min(BASE_CHAMFER, height / 3);
    const maxGroove = BASE_SPOKE_WIDTH - 2 * GROOVE_WALL;
    const groove = {
      width: clamp(cable + 1, BASE_GROOVE.width, maxGroove),
      depth: clamp(cable + 1, BASE_GROOVE.depth, height - chamfer - 2),
      spokeWidth: BASE_SPOKE_WIDTH,
    };
    if (cable + 1 > maxGroove) {
      warnings.push({
        severity: 'warning',
        code: 'cable-groove',
        partId: 'base',
        paramPath: 'mount.stem.cableDiameter',
        message: `A Ø${mm(cable)} mm cable is wider than the base's ${mm(maxGroove)} mm cable groove; use a thinner cable.`,
      });
    }
    const pocket = {
      diameter: mount.base.diameter,
      height,
      pocketDepth: mount.base.pocketDepth,
      chamfer,
      stemScrews: stem.screws,
    };
    const { rIn, rOut } = basePocketRadii(pocket);
    const lidJoint =
      mount.base.lid === 'screws'
        ? screwJoint(
            LID_TO_BASE_JOINT_ID,
            { male: 'baseLid', female: 'base' },
            rIn + rOut,
            { heatSet: false },
            LID_SCREWS,
          )
        : undefined;
    const base: BaseParams = {
      ...pocket,
      boreDiameter: Math.max(BASE_BORE, cable + 1),
      cableGroove: groove,
      lid: mount.base.lid,
      ...(lidJoint ? { lidJoint } : {}),
      quality,
    };
    parts.push({
      id: 'base',
      kind: 'base',
      displayName: 'Base',
      params: base,
      colour: mountPartColour(ctx, 'base', 'base'),
      footprint: baseFootprint(base),
      printNotes: [...BASE_PRINT_NOTES, joints.heatSet ? BASE_INSERT_NOTE : BASE_TAP_NOTE],
    });
    const lid: BaseLidParams = {
      outerDiameter: 2 * rOut,
      innerDiameter: 2 * rIn,
      thickness: baseLidThickness(mount.base.lid),
      lid: mount.base.lid,
      ...(lidJoint ? { joint: lidJoint } : {}),
      // The press fit's clearance, as the shade's snap collar (rounded: 0.3 − 0.1 is not 0.2).
      tolerance: Math.max(
        0.05,
        Math.round((joints.tolerance - SNAP_CLEARANCE_REDUCTION) * 100) / 100,
      ),
      quality,
    };
    parts.push({
      id: 'baseLid',
      kind: 'baseLid',
      displayName: 'Base lid',
      params: lid,
      colour: mountPartColour(ctx, 'baseLid', 'baseLid'),
      footprint: baseLidFootprint(lid),
      printNotes: [...LID_PRINT_NOTES, lidJoint ? LID_SCREW_NOTE : LID_SNAP_NOTE],
    });

    const interfaces = [stem.hub, ...(stem.between ? [stem.between] : []), stem.screws];
    if (lidJoint) interfaces.push(lidJoint);
    return { parts, interfaces, warnings };
  },

  placement(ctx, parts) {
    const { mount } = ctx;
    const { count, length } = stemLayout(mount);
    const H = mount.base.height;
    const d = ctx.hub.derived;
    // In fit-test mode the hub alone stands on the floor as it would on the stem.
    const stemTop = ctx.fitTest ? 0 : H + count * length;
    // The hub turned over (light face up), its mount face on the stem's top.
    const hubZ = stemTop + d.zFace;
    const hubTransform = compose(translation(0, 0, hubZ), flipX());
    const shadeTransforms: Record<string, Mat4> = {};
    let topZ = hubZ;
    for (const shade of ctx.shades) {
      shadeTransforms[shade.id] = compose(hubTransform, translation(0, 0, -shade.zCollar));
      topZ = Math.max(topZ, hubZ + shade.zCollar);
    }
    const partTransforms: Record<string, Mat4> = {};
    for (const part of parts.parts) {
      switch (part.kind) {
        case 'stem':
          // The foot stands on the base; the segments' part is shown as the top one.
          partTransforms[part.id] = translation(
            0,
            0,
            part.params.variant === 'base' ? H : H + (count - 1) * length,
          );
          break;
        case 'base':
          // Printed top face down: half a turn about x, its top face at H.
          partTransforms[part.id] = compose(translation(0, 0, part.params.height), flipX());
          break;
        case 'baseLid':
          // Printed pocket side down: half a turn, its floor face on the floor.
          partTransforms[part.id] = compose(translation(0, 0, part.params.thickness), flipX());
          break;
        default:
          break;
      }
    }
    const puckHeight = ctx.hub.params.insert.height;
    return {
      hubTransform,
      shadeTransforms,
      partTransforms,
      bottomZ: Math.min(0, hubZ - d.hubHeight),
      context: { kind: 'floor', floorZ: 0 },
      derived: {
        floorZ: 0,
        baseDiameter: mount.base.diameter,
        baseHeight: H,
        stemZ0: ctx.fitTest ? 0 : H,
        stemZ1: stemTop,
        stemSegments: count,
        stemSegmentLength: length,
        hubZ,
        topZ,
        // The puck in the turned-over hub: its underside (in the hub) is now its top.
        puckZ: hubZ - d.zPuck - puckHeight,
      },
    };
  },
};
