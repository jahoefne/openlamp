/**
 * What both shade inspectors share for a shade's style family: the Style
 * family select (Revolved / Tiered / Slatted / Geometric; switching carries
 * the diameters and the height over and is one undo step) and the family's
 * parameter groups, edited through the shade's flat keys
 * (`SHADE_FAMILY_PARAM_PATHS`).
 */
import { useMemo } from 'react';
import {
  shadeParamPath,
  shadeToParams,
  type ShadeRole,
  type ShadeSpec,
} from '@core/model/project.ts';
import {
  SHADE_FAMILIES,
  SHADE_FAMILY_DESCRIPTIONS,
  SHADE_FAMILY_LABELS,
  type ParamGroup,
  type ShadeFamily,
} from '@core/schema/defs.ts';
import type { EditSession } from '../../forms/editSession.ts';
import { SelectField } from '../../forms/fields/SelectField.tsx';
import { SchemaForm } from '../../forms/SchemaForm.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { useWarningsByPath } from './warnings.ts';

const isFamily = (f: string): f is ShadeFamily => (SHADE_FAMILIES as readonly string[]).includes(f);

export interface ShadeFamilyFieldProps {
  role: ShadeRole;
  family: ShadeFamily;
  /** Prefix of the select's element id (`p-` → `#p-shadeFamily`). */
  idPrefix: string;
}

/** The Style family select of one shade, with the family's description and its notes. */
export function ShadeFamilyField({ role, family, idPrefix }: ShadeFamilyFieldProps) {
  const byPath = useWarningsByPath();
  const index = role === 'inner' ? 1 : 0;
  const setFamily = (next: string) => {
    if (!isFamily(next)) return;
    useProjectStore.getState().setShadeFamily(role, next);
    useUiStore.getState().requestFit(true); // the lamp changes shape: frame it once built
  };
  return (
    <SelectField
      id={`${idPrefix}shadeFamily`}
      label="Style family"
      value={family}
      options={SHADE_FAMILIES}
      optionLabel={(f) => (isFamily(f) ? SHADE_FAMILY_LABELS[f] : f)}
      help={SHADE_FAMILY_DESCRIPTIONS[family]}
      warnings={byPath.get(`shades.${index}.style.family`)}
      onChange={setFamily}
    />
  );
}

export interface ShadeFamilyFormProps {
  role: ShadeRole;
  shade: ShadeSpec;
  /** The family's groups (relabelled and with prefixed ids for the inner shade). */
  groups: readonly ParamGroup[];
  idPrefix: string;
  edits: EditSession<string, number | string>;
}

/** A shade's parameters, those of its style's family. */
export function ShadeFamilyForm({ role, shade, groups, idPrefix, edits }: ShadeFamilyFormProps) {
  const values = useMemo(() => shadeToParams(shade), [shade]);
  const byPath = useWarningsByPath();
  const family = shade.style.family;
  const warningsFor = (key: string) => byPath.get(shadeParamPath(role, key, family) ?? '') ?? [];
  return (
    <SchemaForm
      groups={groups}
      values={values}
      idPrefix={idPrefix}
      warningsFor={warningsFor}
      onTransient={(key, v) => edits.transient(key, v)}
      onCommit={(key, v) => edits.commit(key, v)}
      onEnd={edits.end}
    />
  );
}
