/** Light choice and hardware dimensions first; fitting and construction details below. */
import { useMemo } from 'react';
import {
  CLASSIC_PARAM_PATHS,
  lightChoiceOf,
  lightParamPath,
  lightToParams,
  projectToClassicParams,
} from '@core/model/project.ts';
import {
  LIGHT_CHOICES,
  LIGHT_CHOICE_DESCRIPTIONS,
  LIGHT_CHOICE_LABELS,
  type ClassicShadeKey,
  type LightChoice,
  type ParamGroup,
} from '@core/schema/defs.ts';
import { lightEdits } from '../../forms/editSession.ts';
import { SelectField } from '../../forms/fields/SelectField.tsx';
import { SchemaForm } from '../../forms/SchemaForm.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { ParameterSection } from '../ParameterSection.tsx';
import { ClassicForm } from './ClassicForm.tsx';
import { LIGHT_LAYOUT } from './hardwareLayout.ts';
import { useWarningsByPath } from './warnings.ts';

const isLightChoice = (c: string): c is LightChoice =>
  (LIGHT_CHOICES as readonly string[]).includes(c);

export function LightInspector() {
  const project = useProjectStore((s) => s.project);
  const light = project.light;
  const choice = lightChoiceOf(light);
  const byPath = useWarningsByPath();
  const values = useMemo(
    () => (light.kind === 'puck' ? projectToClassicParams(project) : lightToParams(light)),
    [project, light],
  );
  const layout = LIGHT_LAYOUT[light.kind];
  const warningsFor = (key: string) =>
    byPath.get(
      light.kind === 'puck'
        ? CLASSIC_PARAM_PATHS[key as ClassicShadeKey]
        : (lightParamPath(light.kind, key) ?? ''),
    ) ?? [];
  const form = (groups: readonly ParamGroup[]) =>
    light.kind === 'puck' ? (
      <ClassicForm groups={groups} />
    ) : (
      <SchemaForm
        groups={groups}
        values={values}
        warningsFor={warningsFor}
        onTransient={(key, v) => lightEdits.transient(key, v)}
        onCommit={(key, v) => lightEdits.commit(key, v)}
        onEnd={lightEdits.end}
      />
    );
  const setLight = (c: string) => {
    if (!isLightChoice(c)) return;
    useProjectStore.getState().setLight(c);
    useUiStore.getState().requestFit(true);
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
      {form(layout.primary)}
      {layout.sections.map((section) => (
        <ParameterSection
          key={`${light.kind}-${section.id}`}
          title={section.title}
          description={section.description}
          groups={section.groups}
          values={values}
          warningsFor={warningsFor}
        >
          {form(section.groups)}
        </ParameterSection>
      ))}
    </>
  );
}
