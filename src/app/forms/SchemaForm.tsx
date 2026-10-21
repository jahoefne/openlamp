/**
 * A parameter form generated from core `ParamDef` groups: one fieldset per
 * group, a slider + number input per number, a select per option list. Rows
 * whose `visibleWhen` is false for the current values are left out.
 */
import type { ReactNode } from 'react';
import type { Warning } from '@core/model/assembly.ts';
import { isParamVisible, type ParamGroup, type ParamValues } from '@core/schema/defs.ts';
import { NumberField } from './fields/NumberField.tsx';
import { SelectField } from './fields/SelectField.tsx';

export interface SchemaFormProps {
  groups: readonly ParamGroup[];
  values: ParamValues;
  /** The core's warnings about one parameter (clamped, adjusted), shown under it. */
  warningsFor?: ((key: string) => readonly Warning[]) | undefined;
  /** An intermediate slider value (drag in progress). */
  onTransient(key: string, value: number): void;
  onCommit(key: string, value: number | string): void;
  /** A slider drag ended without a final value. */
  onEnd(): void;
  /** Hand-made rows at the top of a group's fieldset (a toggle, say); the group shows whenever it has some. */
  lead?: ((groupId: string) => ReactNode) | undefined;
}

export function SchemaForm({
  groups,
  values,
  warningsFor,
  onTransient,
  onCommit,
  onEnd,
  lead,
}: SchemaFormProps) {
  return groups.map((group) => {
    const visible = group.params.filter((def) => isParamVisible(def, values));
    const leading = lead?.(group.id);
    if (visible.length === 0 && !leading) return null;
    return (
      <fieldset key={group.id}>
        <legend>{group.label}</legend>
        {leading}
        {visible.map((def) =>
          def.type === 'select' ? (
            <SelectField
              key={def.key}
              id={`p-${def.key}`}
              label={def.label}
              value={String(values[def.key])}
              options={def.options}
              help={def.help}
              warnings={warningsFor?.(def.key)}
              onChange={(v) => onCommit(def.key, v)}
            />
          ) : (
            <NumberField
              key={def.key}
              def={def}
              value={Number(values[def.key])}
              warnings={warningsFor?.(def.key)}
              onTransient={(v) => onTransient(def.key, v)}
              onCommit={(v) => onCommit(def.key, v)}
              onEnd={onEnd}
            />
          ),
        )}
      </fieldset>
    );
  });
}
