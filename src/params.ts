/**
 * Parameter schema for the lamp shade generator.
 *
 * All lengths are millimetres, angles are degrees. The same schema drives the
 * web UI form, the CLI flags and validation, so every parameter lives here.
 */

/** A numeric parameter, rendered as a slider plus a number input. */
export interface NumberParamDef<K extends string = NumberParamKey> {
  readonly type?: 'number';
  readonly key: K;
  readonly label: string;
  readonly unit?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
  readonly help?: string;
}

/** A parameter with a fixed set of string options, rendered as a dropdown. */
export interface SelectParamDef<K extends string = SelectParamKey> {
  readonly type: 'select';
  readonly key: K;
  readonly label: string;
  readonly options: readonly string[];
  readonly default: string;
  readonly help?: string;
}

export type ParamDef = NumberParamDef | SelectParamDef;

export interface ParamGroup<D = ParamDef> {
  readonly id: string;
  readonly label: string;
  readonly params: readonly D[];
}

// The schema is a const literal so the `Params` type below can be derived from it:
// every key, and the exact option union of every select.
const SCHEMA = [
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
        options: ['smooth', 'ribbed', 'faceted'],
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
        options: ['draft', 'normal', 'fine'],
        default: 'normal',
        help: 'Draft is fast for previews. Fine gives the smoothest STL at a larger file size.',
      },
      {
        key: 'fitTest',
        label: 'Fit test only',
        type: 'select',
        options: ['no', 'yes'],
        default: 'no',
        help: 'Export just the puck housing ring (≈ 10 min print) to check the puck fit and strap tunnels before printing the whole shade.',
      },
    ],
  },
] as const satisfies readonly ParamGroup<NumberParamDef<string> | SelectParamDef<string>>[];

type SchemaParam = (typeof SCHEMA)[number]['params'][number];

/** One complete, normalized parameter set. */
export type Params = {
  [P in SchemaParam as P['key']]: P extends { readonly options: readonly (infer O)[] } ? O : number;
};

export type ParamKey = keyof Params;
export type SelectParamKey = Extract<SchemaParam, { type: 'select' }>['key'];
export type NumberParamKey = Exclude<ParamKey, SelectParamKey>;
export type ShadeStyle = Params['style'];
export type Quality = Params['quality'];

export const PARAM_GROUPS: readonly ParamGroup[] = SCHEMA;

export const PARAMS: readonly ParamDef[] = PARAM_GROUPS.flatMap((g) => g.params);

// Built from the schema at runtime; the schema guarantees one entry per key.
export const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.key, p.default])) as Params;

export const PRESETS: Record<string, Partial<Params>> = {
  'Bell (default)': {},
  'Straight cone': { curve: 0, bottomDiameter: 180, topDiameter: 90, height: 110, style: 'smooth' },
  Drum: {
    bottomDiameter: 140,
    topDiameter: 140,
    height: 100,
    curve: 0,
    style: 'ribbed',
    patternCount: 60,
    ribDepth: 1.2,
    twist: 0,
  },
  'Fluted twist': {
    bottomDiameter: 150,
    topDiameter: 100,
    height: 150,
    curve: 0.35,
    style: 'ribbed',
    patternCount: 48,
    ribDepth: 2,
    twist: 60,
  },
  Faceted: {
    bottomDiameter: 170,
    topDiameter: 96,
    height: 120,
    curve: 0.15,
    style: 'faceted',
    patternCount: 10,
    twist: 15,
  },
  'Wide & shallow': {
    bottomDiameter: 240,
    topDiameter: 110,
    height: 70,
    curve: -0.3,
    style: 'smooth',
  },
  Trumpet: {
    bottomDiameter: 200,
    topDiameter: 80,
    height: 140,
    curve: -0.6,
    style: 'ribbed',
    patternCount: 72,
    ribDepth: 1,
    twist: 0,
  },
};

/**
 * Coerce, clamp and sanity-check a parameter object. Returns a fresh object
 * plus a list of human-readable warnings for values that had to be adjusted.
 */
export function normalizeParams(input: Partial<Record<ParamKey, unknown>> = {}): {
  params: Params;
  warnings: string[];
} {
  const out: Params = { ...DEFAULTS };
  const warnings: string[] = [];
  for (const p of PARAMS) {
    const v = input[p.key];
    if (!(p.key in input) || v === undefined || v === null || v === '') continue;
    if (p.type === 'select') {
      if (typeof v === 'string' && p.options.includes(v)) {
        // v is one of p.options, which is exactly the option union of Params[p.key].
        (out as Record<SelectParamKey, string>)[p.key] = v;
      } else {
        warnings.push(`${p.key}: unknown option "${String(v)}", using "${p.default}"`);
      }
      continue;
    }
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (!Number.isFinite(n)) {
      warnings.push(`${p.key}: not a number, using ${p.default}`);
      continue;
    }
    const clamped = Math.min(p.max, Math.max(p.min, n));
    if (clamped !== n) warnings.push(`${p.key}: ${n} clamped to ${clamped}`);
    out[p.key] = clamped;
  }

  // Cross-parameter constraints.
  const rPocket = out.puckDiameter / 2 + out.puckClearance;
  const bossDiameter = 2 * (rPocket + out.bossWall);
  if (out.topDiameter < bossDiameter + 2) {
    warnings.push(
      `topDiameter raised to ${Math.ceil(bossDiameter + 2)} mm so the shoulder clears the puck housing`,
    );
    out.topDiameter = Math.ceil(bossDiameter + 2);
  }
  const maxHole = 2 * (rPocket - 1.5);
  if (out.lightHoleDiameter > maxHole) {
    warnings.push(
      `lightHoleDiameter reduced to ${maxHole.toFixed(1)} mm to keep a 1.5 mm ledge under the puck`,
    );
    out.lightHoleDiameter = maxHole;
  }
  if (out.strapWidth + 2 * out.loopWall > bossDiameter - 2) {
    const w = Math.floor(bossDiameter - 2 - 2 * out.loopWall);
    warnings.push(`strapWidth reduced to ${w} mm to fit the puck housing`);
    out.strapWidth = w;
  }
  return { params: out, warnings };
}

export const QUALITY = {
  draft: { segments: 128, wallStep: 3 },
  normal: { segments: 256, wallStep: 1.5 },
  fine: { segments: 512, wallStep: 1 },
} as const satisfies Record<Quality, { segments: number; wallStep: number }>;
