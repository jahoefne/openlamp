/**
 * Parameter definitions: the schema that drives the parameter form, the CLI
 * flags and normalisation (see normalize.ts).
 *
 * All lengths are millimetres, angles are degrees.
 */

import { QUALITIES } from '../geometry/quality.ts';
import { SURFACE_STYLES } from '../geometry/surface.ts';
import { SHADE_JOINT_TYPES } from '../model/assembly.ts';

/** Current values of the parameters a definition belongs to, for `visibleWhen`. */
export type ParamValues = Readonly<Record<string, unknown>>;

interface ParamDefBase<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly help?: string;
  /** Whether the field is shown for the current values; always shown when absent. */
  readonly visibleWhen?: (values: ParamValues) => boolean;
}

/** A numeric parameter, rendered as a slider plus a number input. */
export interface NumberParamDef<K extends string = string> extends ParamDefBase<K> {
  readonly type?: 'number';
  readonly unit?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}

/** A parameter with a fixed set of string options, rendered as a dropdown. */
export interface SelectParamDef<K extends string = string> extends ParamDefBase<K> {
  readonly type: 'select';
  readonly options: readonly string[];
  readonly default: string;
  /** Display text per option (the form capitalises the option otherwise). */
  readonly optionLabels?: Readonly<Record<string, string>>;
}

export type ParamDef<K extends string = string> = NumberParamDef<K> | SelectParamDef<K>;

export interface ParamGroup<D = ParamDef> {
  readonly id: string;
  readonly label: string;
  readonly params: readonly D[];
}

const notSmooth = (v: ParamValues) => v.style !== 'smooth';
const ribbedOnly = (v: ParamValues) => v.style === 'ribbed';

// The schema is a const literal so the `ClassicShadeParams` type below can be
// derived from it: every key, and the exact option union of every select.
const CLASSIC_SHADE_SCHEMA = [
  {
    id: 'shape',
    label: 'Shade shape',
    params: [
      {
        key: 'bottomDiameter',
        label: 'Bottom opening Ø',
        unit: 'mm',
        min: 70,
        max: 320,
        step: 1,
        default: 160,
        help: 'Diameter of the open end that faces the room.',
      },
      {
        key: 'topDiameter',
        label: 'Top Ø at shoulder',
        unit: 'mm',
        min: 66,
        max: 320,
        step: 1,
        default: 92,
        help: 'Diameter where the wall meets the sloped shoulder. Must be wider than the puck housing.',
      },
      {
        key: 'height',
        label: 'Wall height',
        unit: 'mm',
        min: 20,
        max: 300,
        step: 1,
        default: 120,
        help: 'Height of the wall from the bottom edge to the shoulder (the housing adds ~34 mm on top).',
      },
      {
        key: 'curve',
        label: 'Profile curve',
        unit: '',
        min: -1,
        max: 1,
        step: 0.05,
        default: 0.25,
        help: 'Negative flares the bottom out like a trumpet, positive bulges the wall out like a bell.',
      },
      {
        key: 'wallThickness',
        label: 'Wall thickness',
        unit: 'mm',
        min: 0.4,
        max: 3,
        step: 0.1,
        default: 0.8,
        help: 'Bambu recommends 0.8 mm (two 0.4 mm perimeters) for good translucency.',
      },
      {
        key: 'shoulderAngle',
        label: 'Shoulder angle',
        unit: '°',
        min: 40,
        max: 70,
        step: 1,
        default: 50,
        help: 'Slope of the roof from the wall to the puck housing, measured from horizontal. Keep ≥ 45° for support-free printing.',
      },
    ],
  },
  {
    id: 'style',
    label: 'Surface style',
    params: [
      {
        key: 'style',
        label: 'Style',
        type: 'select',
        options: SURFACE_STYLES,
        default: 'ribbed',
      },
      {
        key: 'patternCount',
        label: 'Ribs / facets',
        unit: '',
        min: 3,
        max: 160,
        step: 1,
        default: 40,
        visibleWhen: notSmooth,
      },
      {
        key: 'ribDepth',
        label: 'Rib depth',
        unit: 'mm',
        min: 0.3,
        max: 8,
        step: 0.1,
        default: 1.6,
        help: 'Peak-to-valley depth of the ribs (ignored for smooth and faceted).',
        visibleWhen: ribbedOnly,
      },
      {
        key: 'twist',
        label: 'Twist',
        unit: '°',
        min: -180,
        max: 180,
        step: 5,
        default: 25,
        help: 'Rotation of the pattern from bottom to top.',
        visibleWhen: notSmooth,
      },
    ],
  },
  {
    id: 'kit',
    label: 'LED Lamp Kit-001 puck',
    params: [
      {
        key: 'puckDiameter',
        label: 'Puck Ø',
        unit: 'mm',
        min: 40,
        max: 90,
        step: 0.1,
        default: 59,
        help: 'Bambu lists the puck as D59 mm. Measure yours to be sure.',
      },
      {
        key: 'puckHeight',
        label: 'Puck thickness',
        unit: 'mm',
        min: 3,
        max: 30,
        step: 0.1,
        default: 8,
        help: "Bambu's store lists H8 mm, some resellers list 18 mm. Measure yours.",
      },
      {
        key: 'puckClearance',
        label: 'Fit clearance',
        unit: 'mm',
        min: 0,
        max: 1.5,
        step: 0.05,
        default: 0.7,
        help: 'Radial gap around the puck (pocket Ø = puck Ø + 2 × this). 0.2 mm printed too tight on a real kit; 0.7 mm gives an easy drop-in fit.',
      },
      {
        key: 'pocketExtraDepth',
        label: 'Pocket extra depth',
        unit: 'mm',
        min: 0,
        max: 5,
        step: 0.1,
        default: 0.3,
        help: 'The pocket is this much deeper than the puck so the strap lies flat.',
      },
      {
        key: 'lightHoleDiameter',
        label: 'Light opening Ø',
        unit: 'mm',
        min: 30,
        max: 88,
        step: 0.5,
        default: 50,
        help: 'Hole in the ledge the puck rests on. The diffuser is ~46 mm, the metal rim ~59 mm.',
      },
      {
        key: 'ledgeThickness',
        label: 'Ledge thickness',
        unit: 'mm',
        min: 1,
        max: 5,
        step: 0.1,
        default: 2,
      },
      {
        key: 'bossWall',
        label: 'Housing wall',
        unit: 'mm',
        min: 1.5,
        max: 6,
        step: 0.1,
        default: 2.4,
      },
      {
        key: 'cableSlotWidth',
        label: 'Cable slot width',
        unit: 'mm',
        min: 2,
        max: 10,
        step: 0.1,
        default: 4.5,
      },
    ],
  },
  {
    id: 'mount',
    label: 'Velcro ceiling mount',
    params: [
      {
        key: 'strapWidth',
        label: 'Strap width',
        unit: 'mm',
        min: 10,
        max: 60,
        step: 1,
        default: 25,
        help: 'Width of the hook-and-loop strap that runs across the top through the two side tunnels.',
      },
      {
        key: 'strapThickness',
        label: 'Tunnel gap',
        unit: 'mm',
        min: 1,
        max: 6,
        step: 0.1,
        default: 2.5,
        help: 'Thickness of the strap plus a little clearance.',
      },
      {
        key: 'loopLength',
        label: 'Tunnel length',
        unit: 'mm',
        min: 4,
        max: 30,
        step: 0.5,
        default: 10,
        help: 'Vertical length of the belt-loop tunnels on the housing sides.',
      },
      {
        key: 'loopWall',
        label: 'Tunnel wall',
        unit: 'mm',
        min: 1.2,
        max: 6,
        step: 0.1,
        default: 2.4,
      },
    ],
  },
  {
    id: 'output',
    label: 'Output',
    params: [
      {
        key: 'quality',
        label: 'Mesh quality',
        type: 'select',
        options: QUALITIES,
        default: 'normal',
        help: 'Draft is fast for previews. Fine gives the smoothest STL at a larger file size.',
      },
      {
        key: 'fitTest',
        label: 'Fit test only',
        type: 'select',
        options: ['no', 'yes'],
        default: 'no',
        help: 'Export just the puck housing ring of the single-piece shade (≈ 10 min print), or just the hub of a two-part lamp, to check the puck fit and strap tunnels before printing the whole lamp.',
      },
    ],
  },
] as const satisfies readonly ParamGroup[];

type SchemaParam = (typeof CLASSIC_SHADE_SCHEMA)[number]['params'][number];

/** One complete, normalised parameter set of the classic shade. */
export type ClassicShadeParams = {
  [P in SchemaParam as P['key']]: P extends { readonly options: readonly (infer O)[] } ? O : number;
};

export type ClassicShadeKey = keyof ClassicShadeParams;
export type ClassicSelectKey = Extract<SchemaParam, { type: 'select' }>['key'];
export type ClassicNumberKey = Exclude<ClassicShadeKey, ClassicSelectKey>;
export type ClassicShadeParamDef =
  NumberParamDef<ClassicNumberKey> | SelectParamDef<ClassicSelectKey>;

export const CLASSIC_SHADE_GROUPS: readonly ParamGroup<ClassicShadeParamDef>[] =
  CLASSIC_SHADE_SCHEMA;

export const CLASSIC_SHADE_DEFS: readonly ClassicShadeParamDef[] = CLASSIC_SHADE_GROUPS.flatMap(
  (g) => g.params,
);

/** Built from the schema at runtime; the schema guarantees one entry per key. */
export const CLASSIC_SHADE_DEFAULTS: Readonly<ClassicShadeParams> = Object.freeze(
  Object.fromEntries(CLASSIC_SHADE_DEFS.map((p) => [p.key, p.default])) as ClassicShadeParams,
);

// ---------------------------------------------------------------- hub & joint

const split = (v: ParamValues) => v.fused !== true;
const splitThread = (v: ParamValues) => split(v) && v.shadeToHub === 'thread';

// The hub and the shade joint of a two-part lamp (`hub.fused: false`). Keys are
// flat; `HUB_PARAM_PATHS` (project.ts) says where each one lives. The form shows
// them only while the lamp is split (`fused` is a value of the form, not a
// definition: it is a toggle).
const HUB_JOINT_SCHEMA = [
  {
    id: 'hubJoint',
    label: 'Hub & joint',
    params: [
      {
        key: 'shadeToHub',
        label: 'Shade joint',
        type: 'select',
        options: SHADE_JOINT_TYPES,
        default: 'bayonet',
        help: 'How the shade hangs from the hub: a bayonet (push in, twist 35° to lock), a press fit with crush ribs, or a printed thread.',
        visibleWhen: split,
      },
      {
        key: 'jointTolerance',
        label: 'Joint clearance',
        unit: 'mm',
        min: 0.1,
        max: 0.8,
        step: 0.05,
        default: 0.3,
        help: 'Radial gap between the shade collar and the hub ring (the press fit uses 0.1 mm less). Raise it if the parts print too tight.',
        visibleWhen: split,
      },
      {
        key: 'threadPitch',
        label: 'Thread pitch',
        unit: 'mm',
        min: 1.6,
        max: 5,
        step: 0.1,
        default: 2.5,
        visibleWhen: splitThread,
      },
      {
        key: 'threadDepth',
        label: 'Thread depth',
        unit: 'mm',
        min: 0.4,
        max: 2,
        step: 0.05,
        default: 0.8,
        help: 'At most 0.4 × the pitch, so the teeth keep a crest and a root.',
        visibleWhen: splitThread,
      },
      {
        key: 'collarWall',
        label: 'Collar wall',
        unit: 'mm',
        min: 1.2,
        max: 5,
        step: 0.1,
        default: 2,
        help: 'Wall of the shade collar and of the hub ring around it.',
        visibleWhen: split,
      },
      {
        key: 'radialGap',
        label: 'Radial gap',
        unit: 'mm',
        min: 2,
        max: 30,
        step: 0.5,
        default: 8,
        help: 'Gap between the outer and an inner shade collar (inner shades arrive in a later version).',
        visibleWhen: split,
      },
      {
        key: 'hubShoulderAngle',
        label: 'Hub shoulder angle',
        unit: '°',
        min: 40,
        max: 70,
        step: 1,
        default: 50,
        help: "Slope of the hub's roof from its collar ring up to the puck housing. Keep ≥ 45° for support-free printing.",
        visibleWhen: split,
      },
    ],
  },
] as const satisfies readonly ParamGroup[];

/** Hub parameters that are clamped like the form's but not shown in it. */
const HUB_EXTRA_DEFS = [
  {
    key: 'hubWallThickness',
    label: 'Hub wall',
    unit: 'mm',
    min: 1,
    max: 5,
    step: 0.1,
    default: 2,
  },
  {
    key: 'ventCount',
    label: 'Vents',
    unit: '',
    min: 0,
    max: 12,
    step: 1,
    default: 0,
  },
] as const satisfies readonly ParamDef[];

type HubSchemaParam =
  (typeof HUB_JOINT_SCHEMA)[number]['params'][number] | (typeof HUB_EXTRA_DEFS)[number];

/** The hub and shade-joint parameters as flat values. */
export type HubJointParams = {
  [P in HubSchemaParam as P['key']]: P extends { readonly options: readonly (infer O)[] }
    ? O
    : number;
};

export type HubJointKey = keyof HubJointParams;

export const HUB_JOINT_GROUPS: readonly ParamGroup[] = HUB_JOINT_SCHEMA;

export const HUB_JOINT_DEFS: readonly ParamDef<HubJointKey>[] = [
  ...HUB_JOINT_SCHEMA.flatMap((g) => g.params),
  ...HUB_EXTRA_DEFS,
];

export const HUB_JOINT_DEFAULTS: Readonly<HubJointParams> = Object.freeze(
  Object.fromEntries(HUB_JOINT_DEFS.map((p) => [p.key, p.default])) as HubJointParams,
);

// ---------------------------------------------------------------- mounts

/** The mounts, in the order the form offers them (`project.mount.kind`). */
export const MOUNT_KINDS = ['ceilingStrap', 'ceilingCord', 'wallArm', 'standing'] as const;
export type MountKind = (typeof MOUNT_KINDS)[number];

/** The mount select's labels. */
export const MOUNT_LABELS: Readonly<Record<MountKind, string>> = {
  ceilingStrap: 'Velcro strap',
  ceilingCord: 'Pendant on a cord',
  wallArm: 'Wall arm',
  standing: 'Standing lamp',
};

/** One line per mount for the form and the CLI. */
export const MOUNT_DESCRIPTIONS: Readonly<Record<MountKind, string>> = {
  ceilingStrap:
    'Flush on the ceiling: a velcro strap runs across the hub through two belt-loop tunnels (LED pucks only).',
  ceilingCord:
    'Hangs on a cord from a canopy screwed to the ceiling; the cord is knotted in the canopy or held by a collet and a screw-on grip.',
  wallArm: 'A wall plate and an arm; the hub screws onto the end of the arm.',
  standing: 'A weighted base and a segmented stem; the hub screws onto the top of the stem.',
};

export const CORD_GRIPS = ['knot', 'collet'] as const;
export const ARM_SHAPES = ['straight', 'angled', 'curved'] as const;
export const STANDING_VARIANTS = ['table', 'floor'] as const;
export const BASE_LIDS = ['snap', 'screws'] as const;

const bentArm = (v: ParamValues) => v.armShape !== 'straight';

// The mounts' parameters as flat keys (unique across all forms, so they can be
// element ids); `MOUNT_PARAM_PATHS` says where each lives inside `project.mount`.
const CORD_MOUNT_SCHEMA = [
  {
    id: 'cord',
    label: 'Cord',
    params: [
      {
        key: 'cordDiameter',
        label: 'Cord Ø',
        unit: 'mm',
        min: 2,
        max: 10,
        step: 0.1,
        default: 4,
        help: "Diameter of the cord the lamp hangs from. The hub's boss and the canopy get holes 1 mm wider.",
      },
      {
        key: 'dropLength',
        label: 'Drop length',
        unit: 'mm',
        min: 50,
        max: 3000,
        step: 10,
        default: 600,
        help: 'Cord between the top of the hub and the canopy.',
      },
      {
        key: 'grip',
        label: 'Cord grip',
        type: 'select',
        options: CORD_GRIPS,
        default: 'knot',
        optionLabels: { knot: 'Knot in the canopy', collet: 'Collet + screw-on grip' },
        help: 'A knot inside the canopy fixes the drop when you tie it; a collet neck and a screw-on grip (print it in PETG) clamp the cord anywhere, so the drop stays adjustable.',
      },
    ],
  },
  {
    id: 'canopy',
    label: 'Ceiling canopy',
    params: [
      {
        key: 'canopyDiameter',
        label: 'Canopy Ø',
        unit: 'mm',
        min: 60,
        max: 160,
        step: 1,
        default: 90,
      },
      {
        key: 'canopyHeight',
        label: 'Canopy height',
        unit: 'mm',
        min: 15,
        max: 50,
        step: 0.5,
        default: 25,
      },
      {
        key: 'canopyScrewSpacing',
        label: 'Screw spacing',
        unit: 'mm',
        min: 30,
        max: 140,
        step: 1,
        default: 60,
        help: 'Distance between the two ceiling screws; the slots allow ±5 mm.',
      },
    ],
  },
] as const satisfies readonly ParamGroup[];

const WALL_ARM_MOUNT_SCHEMA = [
  {
    id: 'wallPlate',
    label: 'Wall plate',
    params: [
      {
        key: 'plateWidth',
        label: 'Plate width',
        unit: 'mm',
        min: 50,
        max: 200,
        step: 1,
        default: 80,
      },
      {
        key: 'plateHeight',
        label: 'Plate height',
        unit: 'mm',
        min: 60,
        max: 250,
        step: 1,
        default: 120,
      },
      {
        key: 'plateThickness',
        label: 'Plate thickness',
        unit: 'mm',
        min: 3,
        max: 15,
        step: 0.5,
        default: 6,
      },
      {
        key: 'keyholeSpacing',
        label: 'Keyhole spacing',
        unit: 'mm',
        min: 20,
        max: 200,
        step: 1,
        default: 60,
        help: 'Vertical distance between the two keyhole slots the plate hangs on.',
      },
    ],
  },
  {
    id: 'wallArm',
    label: 'Arm',
    params: [
      {
        key: 'armShape',
        label: 'Arm shape',
        type: 'select',
        options: ARM_SHAPES,
        default: 'straight',
        help: 'Straight out from the wall, angled upward, or curved upward.',
      },
      {
        key: 'armLength',
        label: 'Arm length',
        unit: 'mm',
        min: 80,
        max: 600,
        step: 5,
        default: 250,
        help: 'From the wall plate to the axis of the hub.',
      },
      {
        key: 'armRiseAngle',
        label: 'Rise angle',
        unit: '°',
        min: 0,
        max: 45,
        step: 1,
        default: 20,
        help: 'How far an angled or curved arm rises from horizontal (at most 45° so it prints standing on its flange).',
        visibleWhen: bentArm,
      },
      {
        key: 'armTubeDiameter',
        label: 'Tube Ø',
        unit: 'mm',
        min: 14,
        max: 40,
        step: 0.5,
        default: 24,
      },
      {
        key: 'armCableDiameter',
        label: 'Cable Ø',
        unit: 'mm',
        min: 3,
        max: 12,
        step: 0.1,
        default: 6,
        help: 'The bore through the arm is 1 mm wider.',
      },
    ],
  },
] as const satisfies readonly ParamGroup[];

const STANDING_MOUNT_SCHEMA = [
  {
    id: 'standing',
    label: 'Standing lamp',
    params: [
      {
        key: 'standingVariant',
        label: 'Lamp',
        type: 'select',
        options: STANDING_VARIANTS,
        default: 'table',
        optionLabels: { table: 'Table lamp', floor: 'Floor lamp' },
      },
    ],
  },
  {
    id: 'base',
    label: 'Weighted base',
    params: [
      {
        key: 'baseDiameter',
        label: 'Base Ø',
        unit: 'mm',
        min: 100,
        max: 320,
        step: 1,
        default: 180,
      },
      {
        key: 'baseHeight',
        label: 'Base height',
        unit: 'mm',
        min: 12,
        max: 60,
        step: 0.5,
        default: 22,
      },
      {
        key: 'basePocketDepth',
        label: 'Weight pocket depth',
        unit: 'mm',
        min: 4,
        max: 50,
        step: 0.5,
        default: 14,
        help: 'The annular pocket under the base takes steel shot, washers or sand as a weight.',
      },
      {
        key: 'baseLid',
        label: 'Pocket lid',
        type: 'select',
        options: BASE_LIDS,
        default: 'snap',
        optionLabels: { snap: 'Snap ring', screws: 'Three screws' },
      },
    ],
  },
  {
    id: 'stem',
    label: 'Stem',
    params: [
      {
        key: 'stemTotalHeight',
        label: 'Stem height',
        unit: 'mm',
        min: 60,
        max: 1800,
        step: 5,
        default: 400,
        help: 'From the top of the base to the hub.',
      },
      {
        key: 'stemSegmentLength',
        label: 'Segment length',
        unit: 'mm',
        min: 60,
        max: 320,
        step: 5,
        default: 200,
        help: 'The stem is printed in equal segments no longer than this, screwed together.',
      },
      {
        key: 'stemDiameter',
        label: 'Stem Ø',
        unit: 'mm',
        min: 16,
        max: 50,
        step: 0.5,
        default: 28,
      },
      {
        key: 'stemCableDiameter',
        label: 'Cable Ø',
        unit: 'mm',
        min: 3,
        max: 12,
        step: 0.1,
        default: 6,
        help: 'The bore through the stem is 1 mm wider.',
      },
    ],
  },
] as const satisfies readonly ParamGroup[];

/** The flat parameter values of a schema (key → number, or the option union of a select). */
type FlatParamsOf<S extends readonly ParamGroup[]> = {
  [P in S[number]['params'][number] as P['key']]: P extends {
    readonly options: readonly (infer O)[];
  }
    ? O
    : number;
};

/** The velcro strap's parameters: the classic shade's `mount` group (the fused print needs them too). */
export type StrapMountParams = Pick<
  ClassicShadeParams,
  'strapWidth' | 'strapThickness' | 'loopLength' | 'loopWall'
>;
export type CordMountParams = FlatParamsOf<typeof CORD_MOUNT_SCHEMA>;
export type WallArmMountParams = FlatParamsOf<typeof WALL_ARM_MOUNT_SCHEMA>;
export type StandingMountParams = FlatParamsOf<typeof STANDING_MOUNT_SCHEMA>;

/** Every mount's parameters as flat values, by mount kind. */
export interface MountParamsByKind {
  ceilingStrap: StrapMountParams;
  ceilingCord: CordMountParams;
  wallArm: WallArmMountParams;
  standing: StandingMountParams;
}

const STRAP_MOUNT_GROUPS: readonly ParamGroup[] = CLASSIC_SHADE_GROUPS.filter(
  (g) => g.id === 'mount',
);

/** The form groups of each mount (the strap's is the classic shade's `mount` group). */
export const MOUNT_GROUPS: Readonly<Record<MountKind, readonly ParamGroup[]>> = {
  ceilingStrap: STRAP_MOUNT_GROUPS,
  ceilingCord: CORD_MOUNT_SCHEMA,
  wallArm: WALL_ARM_MOUNT_SCHEMA,
  standing: STANDING_MOUNT_SCHEMA,
};

const defsOf = (groups: readonly ParamGroup[]): readonly ParamDef[] =>
  groups.flatMap((g) => g.params);

/** Every parameter definition of each mount. */
export const MOUNT_DEFS: Readonly<Record<MountKind, readonly ParamDef[]>> = {
  ceilingStrap: defsOf(STRAP_MOUNT_GROUPS),
  ceilingCord: defsOf(CORD_MOUNT_SCHEMA),
  wallArm: defsOf(WALL_ARM_MOUNT_SCHEMA),
  standing: defsOf(STANDING_MOUNT_SCHEMA),
};

/**
 * Where each flat mount parameter lives inside `project.mount` (dotted, without
 * the `mount.` prefix): the project path is `mount.<path>`.
 */
export const MOUNT_PARAM_PATHS: {
  readonly [K in MountKind]: Readonly<Record<keyof MountParamsByKind[K], string>>;
} = {
  ceilingStrap: {
    strapWidth: 'strapWidth',
    strapThickness: 'strapThickness',
    loopLength: 'loopLength',
    loopWall: 'loopWall',
  },
  ceilingCord: {
    cordDiameter: 'cordDiameter',
    dropLength: 'dropLength',
    grip: 'grip',
    canopyDiameter: 'canopy.diameter',
    canopyHeight: 'canopy.height',
    canopyScrewSpacing: 'canopy.screwSpacing',
  },
  wallArm: {
    plateWidth: 'plate.width',
    plateHeight: 'plate.height',
    plateThickness: 'plate.thickness',
    keyholeSpacing: 'plate.keyholeSpacing',
    armShape: 'arm.shape',
    armLength: 'arm.length',
    armRiseAngle: 'arm.riseAngle',
    armTubeDiameter: 'arm.tubeDiameter',
    armCableDiameter: 'arm.cableDiameter',
  },
  standing: {
    standingVariant: 'variant',
    baseDiameter: 'base.diameter',
    baseHeight: 'base.height',
    basePocketDepth: 'base.pocketDepth',
    baseLid: 'base.lid',
    stemTotalHeight: 'stem.totalHeight',
    stemSegmentLength: 'stem.segmentLength',
    stemDiameter: 'stem.diameter',
    stemCableDiameter: 'stem.cableDiameter',
  },
};

/** The default flat parameters of each mount, from its definitions. */
export const MOUNT_DEFAULTS: { readonly [K in MountKind]: Readonly<MountParamsByKind[K]> } = {
  ceilingStrap: defaultsOf<StrapMountParams>(MOUNT_DEFS.ceilingStrap),
  ceilingCord: defaultsOf<CordMountParams>(MOUNT_DEFS.ceilingCord),
  wallArm: defaultsOf<WallArmMountParams>(MOUNT_DEFS.wallArm),
  standing: defaultsOf<StandingMountParams>(MOUNT_DEFS.standing),
};

/** Built from the schema at runtime; the schema guarantees one entry per key. */
function defaultsOf<T>(defs: readonly ParamDef[]): T {
  return Object.freeze(Object.fromEntries(defs.map((p) => [p.key, p.default]))) as T;
}

/** Whether a parameter is shown for the given values (see `ParamDefBase.visibleWhen`). */
export function isParamVisible(def: ParamDef, values: ParamValues): boolean {
  return def.visibleWhen ? def.visibleWhen(values) : true;
}
