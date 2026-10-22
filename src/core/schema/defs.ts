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
        help: 'Export just the puck housing ring of the single-piece shade (≈ 10 min print) to check the puck fit and the strap tunnels, or, for a two-part lamp, a test pair of the shade joint (a collar piece and a hub-ring piece) to check its clearance before printing the whole lamp.',
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

// ---------------------------------------------------------------- one shade

/**
 * The classic shade's groups that describe a shade itself (its shape and its
 * surface): every shade of a split lamp, the outer and the inner one, has
 * these flat parameters (`SHADE_PARAM_PATHS` in project.ts says where each
 * lives inside a `ShadeSpec`).
 */
export const SHADE_GROUP_IDS = ['shape', 'style'] as const;

type ShadeSchemaParam = Extract<
  (typeof CLASSIC_SHADE_SCHEMA)[number],
  { id: (typeof SHADE_GROUP_IDS)[number] }
>['params'][number];

/** The flat parameters of one shade (a subset of the classic shade's). */
export type FlatShadeKey = ShadeSchemaParam['key'];
export type FlatShadeParams = Pick<ClassicShadeParams, FlatShadeKey>;

export const SHADE_GROUPS: readonly ParamGroup<ClassicShadeParamDef>[] =
  CLASSIC_SHADE_GROUPS.filter((g) => (SHADE_GROUP_IDS as readonly string[]).includes(g.id));

export const SHADE_DEFS: readonly ClassicShadeParamDef[] = SHADE_GROUPS.flatMap((g) => g.params);

export const FLAT_SHADE_KEYS: readonly FlatShadeKey[] = SHADE_DEFS.map(
  (d) => d.key as FlatShadeKey,
);

// ---------------------------------------------------------------- hub & joint

const split = (v: ParamValues) => v.fused !== true;
/** The radial gap matters with an inner shade only: the form passes `innerShade`. */
const splitInner = (v: ParamValues) => split(v) && v.innerShade === true;
const splitThread = (v: ParamValues) => split(v) && v.shadeToHub === 'thread';
/** The vents are a bulb feature: the form passes the light's kind as `lightKind`. */
const splitBulb = (v: ParamValues) => split(v) && v.lightKind === 'bulb';

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
        help: "Air between the hub's two collar rings: the inner shade's collar is in the inner ring, the outer shade's collar sits in this gap inside the outer ring. Raised if the outer collar would come closer than 2 mm to the inner ring.",
        visibleWhen: splitInner,
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
      {
        key: 'ventCount',
        label: 'Vents',
        unit: '',
        min: 0,
        max: 12,
        step: 1,
        default: 0,
        help: "Ø6 mm vents through the hub's shoulder let the bulb's warm air out of the shade (bulb lights; 8 when you pick a bulb).",
        visibleWhen: splitBulb,
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

// ---------------------------------------------------------------- lights

/** The light sources (`project.light.kind`). */
export const LIGHT_KINDS = ['puck', 'bulb', 'strip'] as const;
export type LightKind = (typeof LIGHT_KINDS)[number];

/** Bulb lampholders: the cap size … */
export const BULB_SIZES = ['E27', 'E14'] as const;
export type BulbSize = (typeof BULB_SIZES)[number];
/** … and how the lampholder is held: a threaded sleeve and its shade ring, or an M10 nipple and a nut. */
export const BULB_FITTINGS = ['shadeRing', 'm10Nipple'] as const;
export type BulbFitting = (typeof BULB_FITTINGS)[number];

/** What the inspector's Light select offers: a light kind, and for bulbs the size. */
export const LIGHT_CHOICES = ['puck', 'E27', 'E14', 'strip'] as const;
export type LightChoice = (typeof LIGHT_CHOICES)[number];

export const LIGHT_CHOICE_LABELS: Readonly<Record<LightChoice, string>> = {
  puck: 'USB puck',
  E27: 'E27 bulb',
  E14: 'E14 bulb',
  strip: 'LED strip',
};

/** One line per light choice for the form (and the CLI). */
export const LIGHT_CHOICE_DESCRIPTIONS: Readonly<Record<LightChoice, string>> = {
  puck: 'A USB LED puck (the Bambu Lab LED Lamp Kit-001 or similar) in a pocket of the hub.',
  E27: 'A mains lampholder for an E27 LED bulb, held in a plate in the hub by its shade ring or an M10 nipple; vents in the hub let the warm air out.',
  E14: 'A mains lampholder for an E14 LED bulb, held in a plate in the hub by its shade ring or an M10 nipple; vents in the hub let the warm air out.',
  strip: 'An LED strip stuck into a ring channel under a wide, flat hub.',
};

/**
 * The diameters each bulb size and fitting starts with: the plate's hole fits
 * the lampholder's threaded sleeve (E27 Ø40, E14 Ø28) or an M10 nipple; the
 * skirt around it and the bulb (A60 / C35) by size.
 */
export const BULB_PRESETS: {
  readonly [S in BulbSize]: {
    readonly holeDiameter: Readonly<Record<BulbFitting, number>>;
    readonly skirtDiameter: number;
    readonly bulbDiameter: number;
    readonly bulbLength: number;
  };
} = {
  E27: {
    holeDiameter: { shadeRing: 40.5, m10Nipple: 10.5 },
    skirtDiameter: 50,
    bulbDiameter: 60,
    bulbLength: 110,
  },
  E14: {
    holeDiameter: { shadeRing: 28.5, m10Nipple: 10.5 },
    skirtDiameter: 38,
    bulbDiameter: 35,
    bulbLength: 100,
  },
};

// The bulb's and the strip's parameters as flat keys (unique across all forms);
// `LIGHT_PARAM_PATHS` says where each lives inside `project.light`. The puck's
// are the classic shade's `kit` group (the fused print needs them too).
const BULB_LIGHT_SCHEMA = [
  {
    id: 'bulbHolder',
    label: 'Lampholder',
    params: [
      {
        key: 'bulbFitting',
        label: 'Fitting',
        type: 'select',
        options: BULB_FITTINGS,
        default: 'shadeRing',
        optionLabels: { shadeRing: 'Threaded sleeve + shade ring', m10Nipple: 'M10 nipple + nut' },
        help: "A lampholder with a threaded sleeve goes through the plate and its shade ring clamps it; a lampholder on an M10 × 1 nipple is held by a nut in a recess on the plate's mount side.",
      },
      {
        key: 'bulbHoleDiameter',
        label: 'Plate hole Ø',
        unit: 'mm',
        min: 6,
        max: 60,
        step: 0.5,
        default: BULB_PRESETS.E27.holeDiameter.shadeRing,
        help: 'E27 sleeve Ø40.5, E14 sleeve Ø28.5, M10 nipple Ø10.5. A new size or fitting sets it unless you changed it.',
      },
      {
        key: 'bulbPlateThickness',
        label: 'Plate thickness',
        unit: 'mm',
        min: 2,
        max: 8,
        step: 0.1,
        default: 3,
      },
      {
        key: 'bulbSkirtDiameter',
        label: 'Skirt Ø',
        unit: 'mm',
        min: 24,
        max: 100,
        step: 0.5,
        default: BULB_PRESETS.E27.skirtDiameter,
        help: 'The tube around the lampholder under the plate; the hub and its collar grow with it.',
      },
      {
        key: 'bulbSkirtHeight',
        label: 'Skirt height',
        unit: 'mm',
        min: 4,
        max: 40,
        step: 0.5,
        default: 12,
      },
      {
        key: 'bulbCableDiameter',
        label: 'Cable Ø',
        unit: 'mm',
        min: 3,
        max: 12,
        step: 0.1,
        default: 6,
        help: "The lampholder's mains cable; it runs through the hub's mount face (the cord of a pendant, the bore of the arm or stem).",
      },
    ],
  },
  {
    id: 'bulb',
    label: 'Bulb',
    params: [
      {
        key: 'bulbDiameter',
        label: 'Bulb Ø',
        unit: 'mm',
        min: 20,
        max: 150,
        step: 1,
        default: BULB_PRESETS.E27.bulbDiameter,
      },
      {
        key: 'bulbLength',
        label: 'Bulb length',
        unit: 'mm',
        min: 30,
        max: 250,
        step: 1,
        default: BULB_PRESETS.E27.bulbLength,
        help: 'Overall length, cap included.',
      },
      {
        key: 'bulbHeatClearance',
        label: 'Heat clearance',
        unit: 'mm',
        min: 0,
        max: 50,
        step: 1,
        default: 15,
        help: 'How far printed parts should stay from the bulb. LED bulbs only; 15 mm or more is safe.',
      },
    ],
  },
] as const satisfies readonly ParamGroup[];

/** Bulb parameters that are clamped like the form's but chosen elsewhere (the Light select picks the size). */
const BULB_EXTRA_DEFS = [
  {
    key: 'bulbSize',
    label: 'Size',
    type: 'select',
    options: BULB_SIZES,
    default: 'E27',
  },
] as const satisfies readonly ParamDef[];

const STRIP_LIGHT_SCHEMA = [
  {
    id: 'strip',
    label: 'LED strip ring',
    params: [
      {
        key: 'stripRingDiameter',
        label: 'Ring Ø',
        unit: 'mm',
        min: 60,
        max: 300,
        step: 1,
        default: 120,
        help: 'Inner Ø of the ring channel the strip is stuck into; the hub is a disc as wide as the ring plus the strip and two walls.',
      },
      {
        key: 'stripWidth',
        label: 'Strip width',
        unit: 'mm',
        min: 3,
        max: 20,
        step: 0.5,
        default: 10,
        help: 'The channel is 0.4 mm wider. Up to 10.6 mm its ceiling prints as a short bridge.',
      },
      {
        key: 'stripThickness',
        label: 'Strip thickness',
        unit: 'mm',
        min: 0.5,
        max: 6,
        step: 0.1,
        default: 2,
      },
      {
        key: 'stripChannelDepth',
        label: 'Channel depth',
        unit: 'mm',
        min: 1,
        max: 10,
        step: 0.1,
        default: 3.5,
        help: 'At least the strip thickness + 0.5 mm.',
      },
      {
        key: 'stripCableWidth',
        label: 'Cable width',
        unit: 'mm',
        min: 2,
        max: 10,
        step: 0.1,
        default: 4.5,
        help: "The strip's cable leaves the channel through a slot and runs to the hub's boss.",
      },
    ],
  },
] as const satisfies readonly ParamGroup[];

/** The light kinds with flat parameters of their own (the puck's are the classic shade's). */
export type FlatLightKind = Exclude<LightKind, 'puck'>;

export type BulbLightParams = FlatParamsOf<typeof BULB_LIGHT_SCHEMA> & { bulbSize: BulbSize };
export type StripLightParams = FlatParamsOf<typeof STRIP_LIGHT_SCHEMA>;

/** The bulb's and the strip's parameters as flat values, by light kind. */
export interface LightParamsByKind {
  bulb: BulbLightParams;
  strip: StripLightParams;
}

const KIT_GROUPS: readonly ParamGroup[] = CLASSIC_SHADE_GROUPS.filter((g) => g.id === 'kit');

/** The form groups of each light (the puck's is the classic shade's `kit` group). */
export const LIGHT_GROUPS: Readonly<Record<LightKind, readonly ParamGroup[]>> = {
  puck: KIT_GROUPS,
  bulb: BULB_LIGHT_SCHEMA,
  strip: STRIP_LIGHT_SCHEMA,
};

/** Every parameter definition of the bulb and the strip. */
export const LIGHT_DEFS: Readonly<Record<FlatLightKind, readonly ParamDef[]>> = {
  bulb: [...defsOf(BULB_LIGHT_SCHEMA), ...BULB_EXTRA_DEFS],
  strip: defsOf(STRIP_LIGHT_SCHEMA),
};

/** Where each flat light parameter lives inside `project.light`: the project path is `light.<path>`. */
export const LIGHT_PARAM_PATHS: {
  readonly [K in FlatLightKind]: Readonly<Record<keyof LightParamsByKind[K], string>>;
} = {
  bulb: {
    bulbSize: 'size',
    bulbFitting: 'fitting',
    bulbHoleDiameter: 'holeDiameter',
    bulbPlateThickness: 'plateThickness',
    bulbSkirtDiameter: 'skirtDiameter',
    bulbSkirtHeight: 'skirtHeight',
    bulbDiameter: 'bulbDiameter',
    bulbLength: 'bulbLength',
    bulbHeatClearance: 'heatClearance',
    bulbCableDiameter: 'cableDiameter',
  },
  strip: {
    stripRingDiameter: 'ringDiameter',
    stripWidth: 'stripWidth',
    stripThickness: 'stripThickness',
    stripChannelDepth: 'channelDepth',
    stripCableWidth: 'cableWidth',
  },
};

/** The default flat parameters of the bulb (an E27 on a shade ring) and the strip. */
export const LIGHT_DEFAULTS: { readonly [K in FlatLightKind]: Readonly<LightParamsByKind[K]> } = {
  bulb: defaultsOf<BulbLightParams>(LIGHT_DEFS.bulb),
  strip: defaultsOf<StripLightParams>(LIGHT_DEFS.strip),
};

/** The hub's vents a light starts with (`hub.ventCount`): eight for a bulb, none otherwise. */
export const DEFAULT_VENTS: Readonly<Record<LightKind, number>> = { puck: 0, bulb: 8, strip: 0 };

// ---------------------------------------------------------------- shade families

/** The shade style families (`ShadeSpec.style.family`), in the order the form offers them. */
export const SHADE_FAMILIES = ['revolved', 'tiered', 'slatted', 'geometric'] as const;
export type ShadeFamily = (typeof SHADE_FAMILIES)[number];

/** The Style family select's labels. */
export const SHADE_FAMILY_LABELS: Readonly<Record<ShadeFamily, string>> = {
  revolved: 'Revolved',
  tiered: 'Tiered',
  slatted: 'Slatted',
  geometric: 'Geometric',
};

/** One line per family for the form and the CLI. */
export const SHADE_FAMILY_DESCRIPTIONS: Readonly<Record<ShadeFamily, string>> = {
  revolved:
    'A turned wall with its own shoulder: smooth, ribbed or faceted, the pattern optionally twisted.',
  tiered:
    'PH-style tiers that overlap so the light is never seen directly; every tier prints on its own and spacers hold them apart.',
  slatted:
    'A bottom and a top ring joined by flat slats, optionally twisted around the shade and turned like louvres.',
  geometric:
    'Folded and pierced forms: a twisted polygon (polyhedral), Yoshimura pleats or a lattice of holes.',
};

/** The geometric family's forms (`style.variant`). */
export const GEOMETRIC_VARIANTS = ['polyhedral', 'pleated', 'lattice'] as const;
export type GeometricVariant = (typeof GEOMETRIC_VARIANTS)[number];
/** The lattice's hole shapes. */
export const LATTICE_HOLE_SHAPES = ['hex', 'round'] as const;

/** The shade's wall in the family forms (the same range as the classic shade's). */
const FAMILY_WALL = {
  key: 'wallThickness',
  label: 'Wall thickness',
  unit: 'mm',
  min: 0.4,
  max: 3,
  step: 0.1,
  default: 0.8,
  help: 'Two 0.4 mm perimeters (0.8 mm) diffuse the light best.',
} as const;

// Each family's parameters as flat keys: a key that means the same as the
// revolved family's (bottomDiameter, topDiameter, height, wallThickness) keeps
// its name and path; the others are unique across all forms (they are element
// ids: `slatTwist`, not `twist`, which is the revolved surface's).
// `SHADE_FAMILY_PARAM_PATHS` says where each lives inside a `ShadeSpec`.
const TIERED_SHADE_SCHEMA = [
  {
    id: 'tiers',
    label: 'Tiers',
    params: [
      {
        key: 'tiers',
        label: 'Tiers',
        unit: '',
        min: 2,
        max: 8,
        step: 1,
        default: 4,
        help: 'How many overlapping tiers, each printed on its own.',
      },
      {
        key: 'topDiameter',
        label: 'Top tier Ø',
        unit: 'mm',
        min: 60,
        max: 320,
        step: 1,
        default: 120,
        help: 'Outer diameter of the top tier, which carries the collar.',
      },
      {
        key: 'bottomDiameter',
        label: 'Bottom tier Ø',
        unit: 'mm',
        min: 80,
        max: 400,
        step: 1,
        default: 320,
        help: 'Outer diameter of the widest, lowest tier.',
      },
      {
        key: 'tierDrop',
        label: 'Tier drop',
        unit: 'mm',
        min: 5,
        max: 80,
        step: 1,
        default: 28,
        help: 'Vertical distance from one tier to the next.',
      },
      {
        key: 'tierOverlap',
        label: 'Overlap',
        unit: 'mm',
        min: 0,
        max: 60,
        step: 0.5,
        default: 12,
        help: 'How far each tier reaches in under the one above it, so the light is never seen directly.',
      },
      {
        key: 'tierCurve',
        label: 'Tier curve',
        unit: '',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.3,
        help: '0 makes every tier a straight cone, 1 a strongly curved bowl.',
      },
      {
        key: 'tierSpacers',
        label: 'Spacers per gap',
        unit: '',
        min: 3,
        max: 4,
        step: 1,
        default: 3,
        help: 'Ø5 mm rods between the tiers.',
      },
      FAMILY_WALL,
    ],
  },
] as const satisfies readonly ParamGroup[];

const SLATTED_SHADE_SCHEMA = [
  {
    id: 'slattedShape',
    label: 'Shade shape',
    params: [
      {
        key: 'bottomDiameter',
        label: 'Bottom ring Ø',
        unit: 'mm',
        min: 60,
        max: 320,
        step: 1,
        default: 200,
        help: 'Outer diameter of the bottom ring, the open end that faces the room.',
      },
      {
        key: 'topDiameter',
        label: 'Top ring Ø',
        unit: 'mm',
        min: 60,
        max: 320,
        step: 1,
        default: 120,
        help: 'Outer diameter of the top ring; a 45° shoulder rises from it to the collar.',
      },
      {
        key: 'height',
        label: 'Height',
        unit: 'mm',
        min: 40,
        max: 300,
        step: 1,
        default: 180,
        help: 'From the bottom of the bottom ring to the top of the top ring (the shoulder and the collar add on top).',
      },
      {
        key: 'ringHeight',
        label: 'Ring height',
        unit: 'mm',
        min: 3,
        max: 30,
        step: 0.5,
        default: 8,
        help: 'Height of the bottom and the top ring the slats are held in.',
      },
      { ...FAMILY_WALL, help: "Wall of the top ring's shoulder cone up to the collar." },
    ],
  },
  {
    id: 'slats',
    label: 'Slats',
    params: [
      {
        key: 'slatCount',
        label: 'Slats',
        unit: '',
        min: 6,
        max: 96,
        step: 1,
        default: 24,
        help: 'Reduced if the slats would touch at the narrowest ring.',
      },
      {
        key: 'slatWidth',
        label: 'Slat width',
        unit: 'mm',
        min: 3,
        max: 30,
        step: 0.5,
        default: 12,
      },
      {
        key: 'slatThickness',
        label: 'Slat thickness',
        unit: 'mm',
        min: 0.8,
        max: 6,
        step: 0.1,
        default: 2.4,
        help: 'At least two nozzle widths, so a slat gets two perimeters.',
      },
      {
        key: 'louvreAngle',
        label: 'Louvre angle',
        unit: '°',
        min: -80,
        max: 80,
        step: 5,
        default: 0,
        help: 'Turns every slat about its own long axis: 0 lies along the rings like a barrel stave, larger angles turn it like a louvre toward a radial fin.',
      },
      {
        key: 'slatTwist',
        label: 'Twist',
        unit: '°',
        min: -120,
        max: 120,
        step: 5,
        default: 0,
        help: 'How far each slat runs around the shade from the bottom ring to the top ring. Keep the lean under 50° (a short shade leans faster).',
      },
    ],
  },
] as const satisfies readonly ParamGroup[];

const polyhedral = (v: ParamValues) => v.geometricVariant === 'polyhedral';
const pleated = (v: ParamValues) => v.geometricVariant === 'pleated';
const lattice = (v: ParamValues) => v.geometricVariant === 'lattice';

const GEOMETRIC_SHADE_SCHEMA = [
  {
    id: 'geometricShape',
    label: 'Shade shape',
    params: [
      {
        key: 'geometricVariant',
        label: 'Form',
        type: 'select',
        options: GEOMETRIC_VARIANTS,
        default: 'polyhedral',
        optionLabels: {
          polyhedral: 'Polyhedral (twisted polygon)',
          pleated: 'Pleated (Yoshimura)',
          lattice: 'Lattice of holes',
        },
      },
      {
        key: 'bottomDiameter',
        label: 'Bottom opening Ø',
        unit: 'mm',
        min: 70,
        max: 320,
        step: 1,
        default: 180,
      },
      {
        key: 'topDiameter',
        label: 'Top Ø',
        unit: 'mm',
        min: 60,
        max: 320,
        step: 1,
        default: 110,
      },
      {
        key: 'height',
        label: 'Height',
        unit: 'mm',
        min: 20,
        max: 300,
        step: 1,
        default: 140,
      },
      FAMILY_WALL,
    ],
  },
  {
    id: 'polyhedral',
    label: 'Facets',
    params: [
      {
        key: 'sides',
        label: 'Sides',
        unit: '',
        min: 3,
        max: 24,
        step: 1,
        default: 8,
        visibleWhen: polyhedral,
      },
      {
        key: 'geometricTwist',
        label: 'Twist',
        unit: '°',
        min: -180,
        max: 180,
        step: 5,
        default: 20,
        help: 'Rotation of the top polygon against the bottom one; the facets fold like origami.',
        visibleWhen: polyhedral,
      },
    ],
  },
  {
    id: 'pleated',
    label: 'Pleats',
    params: [
      {
        key: 'pleatCount',
        label: 'Pleats',
        unit: '',
        min: 6,
        max: 48,
        step: 1,
        default: 16,
        visibleWhen: pleated,
      },
      {
        key: 'pleatDepth',
        label: 'Pleat depth',
        unit: 'mm',
        min: 1,
        max: 20,
        step: 0.5,
        default: 6,
        visibleWhen: pleated,
      },
      {
        key: 'bands',
        label: 'Bands',
        unit: '',
        min: 1,
        max: 12,
        step: 1,
        default: 5,
        help: 'Rows of pleats up the shade; each band is offset by half a pleat.',
        visibleWhen: pleated,
      },
    ],
  },
  {
    id: 'lattice',
    label: 'Lattice',
    params: [
      {
        key: 'holeShape',
        label: 'Hole shape',
        type: 'select',
        options: LATTICE_HOLE_SHAPES,
        default: 'hex',
        optionLabels: { hex: 'Hexagon', round: 'Round' },
        visibleWhen: lattice,
      },
      {
        key: 'holeSize',
        label: 'Hole size',
        unit: 'mm',
        min: 2,
        max: 20,
        step: 0.5,
        default: 6,
        visibleWhen: lattice,
      },
      {
        key: 'holePitch',
        label: 'Hole pitch',
        unit: 'mm',
        min: 4,
        max: 30,
        step: 0.5,
        default: 11,
        help: 'Distance between neighbouring holes.',
        visibleWhen: lattice,
      },
    ],
  },
] as const satisfies readonly ParamGroup[];

export type TieredFlatParams = FlatParamsOf<typeof TIERED_SHADE_SCHEMA>;
export type SlattedFlatParams = FlatParamsOf<typeof SLATTED_SHADE_SCHEMA>;
export type GeometricFlatParams = FlatParamsOf<typeof GEOMETRIC_SHADE_SCHEMA>;

/** Every family's flat parameters, by family (the revolved family's are the classic shade's shape and surface). */
export interface ShadeParamsByFamily {
  revolved: FlatShadeParams;
  tiered: TieredFlatParams;
  slatted: SlattedFlatParams;
  geometric: GeometricFlatParams;
}

/** The form groups of each family (the revolved family's are `SHADE_GROUPS`). */
export const SHADE_FAMILY_GROUPS: Readonly<Record<ShadeFamily, readonly ParamGroup[]>> = {
  revolved: SHADE_GROUPS,
  tiered: TIERED_SHADE_SCHEMA,
  slatted: SLATTED_SHADE_SCHEMA,
  geometric: GEOMETRIC_SHADE_SCHEMA,
};

/** Every parameter definition of each family. */
export const SHADE_FAMILY_DEFS: Readonly<Record<ShadeFamily, readonly ParamDef[]>> = {
  revolved: SHADE_DEFS,
  tiered: defsOf(TIERED_SHADE_SCHEMA),
  slatted: defsOf(SLATTED_SHADE_SCHEMA),
  geometric: defsOf(GEOMETRIC_SHADE_SCHEMA),
};

/**
 * Where each flat shade parameter lives inside a `ShadeSpec`, by family, as a
 * dotted path (the project path is `shades.<index>.<path>`).
 */
export const SHADE_FAMILY_PARAM_PATHS: {
  readonly [F in ShadeFamily]: Readonly<Record<keyof ShadeParamsByFamily[F], string>>;
} = {
  revolved: {
    bottomDiameter: 'style.bottomDiameter',
    topDiameter: 'style.topDiameter',
    height: 'style.height',
    curve: 'style.curve',
    wallThickness: 'wallThickness',
    shoulderAngle: 'style.shoulderAngle',
    style: 'style.surface.style',
    patternCount: 'style.surface.patternCount',
    ribDepth: 'style.surface.ribDepth',
    twist: 'style.surface.twist',
  },
  tiered: {
    tiers: 'style.tiers',
    topDiameter: 'style.topDiameter',
    bottomDiameter: 'style.bottomDiameter',
    tierDrop: 'style.tierDrop',
    tierOverlap: 'style.overlap',
    tierCurve: 'style.curve',
    tierSpacers: 'style.spacers',
    wallThickness: 'wallThickness',
  },
  slatted: {
    bottomDiameter: 'style.bottomDiameter',
    topDiameter: 'style.topDiameter',
    height: 'style.height',
    ringHeight: 'style.ringHeight',
    wallThickness: 'wallThickness',
    slatCount: 'style.slatCount',
    slatWidth: 'style.slatWidth',
    slatThickness: 'style.slatThickness',
    louvreAngle: 'style.louvreAngle',
    slatTwist: 'style.twist',
  },
  geometric: {
    geometricVariant: 'style.variant',
    bottomDiameter: 'style.bottomDiameter',
    topDiameter: 'style.topDiameter',
    height: 'style.height',
    wallThickness: 'wallThickness',
    sides: 'style.sides',
    geometricTwist: 'style.twist',
    pleatCount: 'style.pleatCount',
    pleatDepth: 'style.pleatDepth',
    bands: 'style.bands',
    holeShape: 'style.holeShape',
    holeSize: 'style.holeSize',
    holePitch: 'style.holePitch',
  },
};

/** The default flat parameters of each family, from its definitions. */
export const SHADE_FAMILY_DEFAULTS: {
  readonly [F in ShadeFamily]: Readonly<ShadeParamsByFamily[F]>;
} = {
  revolved: defaultsOf<FlatShadeParams>(SHADE_DEFS),
  tiered: defaultsOf<TieredFlatParams>(SHADE_FAMILY_DEFS.tiered),
  slatted: defaultsOf<SlattedFlatParams>(SHADE_FAMILY_DEFS.slatted),
  geometric: defaultsOf<GeometricFlatParams>(SHADE_FAMILY_DEFS.geometric),
};

/** Whether a parameter is shown for the given values (see `ParamDefBase.visibleWhen`). */
export function isParamVisible(def: ParamDef, values: ParamValues): boolean {
  return def.visibleWhen ? def.visibleWhen(values) : true;
}
