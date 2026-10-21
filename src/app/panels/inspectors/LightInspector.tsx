/**
 * Which light (a USB puck, an E27 or E14 bulb, an LED strip), and its
 * parameters. Switching keeps the shade, the mount and the joints; a new
 * kind starts from its defaults, a new bulb size keeps what you changed.
 */
import { useMemo } from 'react';
import { lightChoiceOf, lightParamPath, lightToParams, type LightOf } from '@core/model/project.ts';
import {
  LIGHT_CHOICES,
  LIGHT_CHOICE_DESCRIPTIONS,
  LIGHT_CHOICE_LABELS,
  LIGHT_GROUPS,
  type FlatLightKind,
  type LightChoice,
} from '@core/schema/defs.ts';
import { lightEdits } from '../../forms/editSession.ts';
import { SelectField } from '../../forms/fields/SelectField.tsx';
import { SchemaForm } from '../../forms/SchemaForm.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { ClassicForm } from './ClassicForm.tsx';
import { useWarningsByPath } from './warnings.ts';

const isLightChoice = (c: string): c is LightChoice =>
  (LIGHT_CHOICES as readonly string[]).includes(c);

/** A bulb's or a strip's parameters (flat keys, see `LIGHT_PARAM_PATHS`). */
function FlatLightForm({ light }: { light: LightOf<FlatLightKind> }) {
  const values = useMemo(() => lightToParams(light), [light]);
  const byPath = useWarningsByPath();
  const warningsFor = (key: string) => byPath.get(lightParamPath(light.kind, key) ?? '') ?? [];
  return (
    <SchemaForm
      groups={LIGHT_GROUPS[light.kind]}
      values={values}
      warningsFor={warningsFor}
      onTransient={(key, v) => lightEdits.transient(key, v)}
      onCommit={(key, v) => lightEdits.commit(key, v)}
      onEnd={lightEdits.end}
    />
  );
}

export function LightInspector() {
  const light = useProjectStore((s) => s.project.light);
  const choice = lightChoiceOf(light);
  const byPath = useWarningsByPath();
  const setLight = (c: string) => {
    if (!isLightChoice(c)) return;
    useProjectStore.getState().setLight(c);
    useUiStore.getState().requestFit(true); // the hub changes shape: frame it once built
  };
  return (
    <>
      <fieldset>
        <legend>Light</legend>
        <SelectField
          id="p-light"
          label="Light"
          value={choice}
          options={LIGHT_CHOICES}
          optionLabel={(c) => (isLightChoice(c) ? LIGHT_CHOICE_LABELS[c] : c)}
          help={LIGHT_CHOICE_DESCRIPTIONS[choice]}
          warnings={byPath.get('light.kind')}
          onChange={setLight}
        />
      </fieldset>
      {light.kind === 'puck' ? (
        <ClassicForm groups={LIGHT_GROUPS.puck} />
      ) : (
        <FlatLightForm light={light} />
      )}
    </>
  );
}
