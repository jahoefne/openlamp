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

/** Whether a parameter is shown for the given values (see `ParamDefBase.visibleWhen`). */
export function isParamVisible(def: ParamDef, values: ParamValues): boolean {
  return def.visibleWhen ? def.visibleWhen(values) : true;
}
