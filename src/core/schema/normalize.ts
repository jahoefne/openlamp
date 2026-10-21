/**
 * Coerce, clamp and sanity-check parameter objects against their definitions.
 * Values that had to be adjusted come back as warnings, never as errors.
 */
import type { Warning } from '../model/assembly.ts';
import {
  CLASSIC_SHADE_DEFAULTS,
  CLASSIC_SHADE_DEFS,
  HUB_JOINT_DEFAULTS,
  HUB_JOINT_DEFS,
  MOUNT_DEFAULTS,
  MOUNT_DEFS,
  MOUNT_PARAM_PATHS,
  type ClassicShadeKey,
  type ClassicShadeParams,
  type HubJointKey,
  type HubJointParams,
  type MountKind,
  type MountParamsByKind,
  type ParamDef,
} from './defs.ts';

function adjusted(code: string, key: string, message: string): Warning {
  return { severity: 'warning', code, message, paramPath: key };
}

/**
 * Start from each definition's default and take every usable value from
 * `input`: numbers (or numeric strings, as in URLs and CLI flags) are clamped
 * to [min, max], selects must be one of their options. Keys without a
 * definition are dropped.
 */
export function clampToSchema(
  defs: readonly ParamDef[],
  input: Readonly<Record<string, unknown>> = {},
): { values: Record<string, number | string>; warnings: Warning[] } {
  const values: Record<string, number | string> = {};
  const warnings: Warning[] = [];
  for (const def of defs) {
    values[def.key] = def.default;
    const v = input[def.key];
    if (!(def.key in input) || v === undefined || v === null || v === '') continue;
    if (def.type === 'select') {
      if (typeof v === 'string' && def.options.includes(v)) {
        values[def.key] = v;
      } else {
        warnings.push(
          adjusted(
            'invalid-option',
            def.key,
            `${def.key}: unknown option "${String(v)}", using "${def.default}"`,
          ),
        );
      }
      continue;
    }
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (!Number.isFinite(n)) {
      warnings.push(
        adjusted('not-a-number', def.key, `${def.key}: not a number, using ${def.default}`),
      );
      continue;
    }
    const clamped = Math.min(def.max, Math.max(def.min, n));
    if (clamped !== n)
      warnings.push(adjusted('clamped', def.key, `${def.key}: ${n} clamped to ${clamped}`));
    values[def.key] = clamped;
  }
  return { values, warnings };
}

/**
 * Normalise classic-shade parameters: `clampToSchema` plus the cross-parameter
 * constraints that keep the shade printable (the shoulder must clear the puck
 * housing, the ledge must carry the puck, the strap must fit the housing).
 */
export function normalizeClassicShade(
  input: Readonly<Partial<Record<ClassicShadeKey, unknown>>> = {},
): { values: ClassicShadeParams; warnings: Warning[] } {
  const clamped = clampToSchema(CLASSIC_SHADE_DEFS, input);
  // clampToSchema fills every key of CLASSIC_SHADE_DEFS with a number for number
  // definitions and one of the options for selects: exactly ClassicShadeParams.
  const out = { ...CLASSIC_SHADE_DEFAULTS, ...clamped.values } as ClassicShadeParams;
  const warnings = clamped.warnings;

  const rPocket = out.puckDiameter / 2 + out.puckClearance;
  const bossDiameter = 2 * (rPocket + out.bossWall);
  if (out.topDiameter < bossDiameter + 2) {
    warnings.push(
      adjusted(
        'adjusted',
        'topDiameter',
        `topDiameter raised to ${Math.ceil(bossDiameter + 2)} mm so the shoulder clears the puck housing`,
      ),
    );
    out.topDiameter = Math.ceil(bossDiameter + 2);
  }
  const maxHole = 2 * (rPocket - 1.5);
  if (out.lightHoleDiameter > maxHole) {
    warnings.push(
      adjusted(
        'adjusted',
        'lightHoleDiameter',
        `lightHoleDiameter reduced to ${maxHole.toFixed(1)} mm to keep a 1.5 mm ledge under the puck`,
      ),
    );
    out.lightHoleDiameter = maxHole;
  }
  if (out.strapWidth + 2 * out.loopWall > bossDiameter - 2) {
    const w = Math.floor(bossDiameter - 2 - 2 * out.loopWall);
    warnings.push(
      adjusted('adjusted', 'strapWidth', `strapWidth reduced to ${w} mm to fit the puck housing`),
    );
    out.strapWidth = w;
  }
  return { values: out, warnings };
}

/** The largest thread depth per pitch that leaves a crest and a root (see joints/thread.ts). */
const MAX_THREAD_DEPTH_PER_PITCH = 0.4;

/**
 * Normalise the hub and shade-joint parameters: `clampToSchema` plus the
 * thread's depth ≤ 0.4 × pitch. `ventCount` is rounded to a whole number.
 */
export function normalizeHubJoint(input: Readonly<Partial<Record<HubJointKey, unknown>>> = {}): {
  values: HubJointParams;
  warnings: Warning[];
} {
  const clamped = clampToSchema(HUB_JOINT_DEFS, input);
  // As in normalizeClassicShade: every key filled with a value of its definition's type.
  const out = { ...HUB_JOINT_DEFAULTS, ...clamped.values } as HubJointParams;
  const warnings = clamped.warnings;
  out.ventCount = Math.round(out.ventCount);
  const maxDepth = Math.round(MAX_THREAD_DEPTH_PER_PITCH * out.threadPitch * 100) / 100;
  if (out.shadeToHub === 'thread' && out.threadDepth > maxDepth) {
    warnings.push(
      adjusted(
        'adjusted',
        'threadDepth',
        `threadDepth reduced to ${maxDepth} mm (at most 0.4 × the ${out.threadPitch} mm pitch)`,
      ),
    );
    out.threadDepth = maxDepth;
  }
  return { values: out, warnings };
}

/**
 * Clamp a mount's flat parameters (see `MOUNT_PARAM_PATHS`) to its
 * definitions. Warnings carry the project path (`mount.canopy.diameter`).
 * Cross-parameter rules of a mount live in its assembly module
 * (`MountModule.normalize`). The velcro strap is normalised with the classic
 * shade (`normalizeClassicShade`), whose builder shares its parameters.
 */
export function normalizeMountParams<K extends MountKind>(
  kind: K,
  input: Readonly<Partial<Record<string, unknown>>>,
): { values: MountParamsByKind[K]; warnings: Warning[] } {
  const clamped = clampToSchema(MOUNT_DEFS[kind], input);
  // As in normalizeClassicShade: every key filled with a value of its definition's type.
  const values = { ...MOUNT_DEFAULTS[kind], ...clamped.values } as MountParamsByKind[K];
  const paths: Readonly<Record<string, string>> = MOUNT_PARAM_PATHS[kind];
  const warnings = clamped.warnings.map((w) => {
    const path = w.paramPath !== undefined ? paths[w.paramPath] : undefined;
    return path === undefined ? w : { ...w, paramPath: `mount.${path}` };
  });
  return { values, warnings };
}
