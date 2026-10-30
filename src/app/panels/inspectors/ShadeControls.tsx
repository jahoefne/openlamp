import {
  shadeParamPath,
  shadeToParams,
  type ShadeRole,
  type ShadeSpec,
} from '@core/model/project.ts';
import { type ParamGroup } from '@core/schema/defs.ts';
import { innerShadeEdits, outerShadeEdits } from '../../forms/editSession.ts';
import { ColourField } from '../../forms/fields/ColourField.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { ParameterSection } from '../ParameterSection.tsx';
import { ClassicForm } from './ClassicForm.tsx';
import { ShadeFamilyField, ShadeFamilyForm } from './ShadeFamilyForm.tsx';
import { SHADE_LAYOUT } from './shadeLayout.ts';
import { useWarningsByPath } from './warnings.ts';

/** Shared hierarchy for both shades; the original edit sessions preserve drag and undo semantics. */
export function ShadeControls({ role, shade }: { role: ShadeRole; shade: ShadeSpec }) {
  const family = shade.style.family;
  const layout = SHADE_LAYOUT[family];
  const idPrefix = role === 'inner' ? 'p-inner-' : 'p-';
  const values = shadeToParams(shade);
  const byPath = useWarningsByPath();
  const hasInner = useProjectStore((s) => s.project.shades.length > 1);
  const form = (groups: readonly ParamGroup[]) =>
    role === 'outer' && family === 'revolved' ? (
      <ClassicForm groups={groups} />
    ) : (
      <ShadeFamilyForm
        role={role}
        shade={shade}
        groups={groups}
        idPrefix={idPrefix}
        edits={role === 'inner' ? innerShadeEdits : outerShadeEdits}
      />
    );
  const technical = (groups: readonly ParamGroup[], title: string, description: string) => {
    return (
      <ParameterSection
        key={`${role}-${family}-${title}`}
        title={title}
        description={description}
        groups={groups}
        values={values}
        warningsFor={(key) => byPath.get(shadeParamPath(role, key, family) ?? '') ?? []}
      >
        {form(groups)}
      </ParameterSection>
    );
  };
  return (
    <>
      {form(layout.shape)}
      <fieldset>
        <legend>Style & colour</legend>
        <ShadeFamilyField role={role} family={family} idPrefix={idPrefix} />
        <ColourField
          id={`${idPrefix}colour`}
          label={
            role === 'inner'
              ? 'Inner shade colour'
              : hasInner
                ? 'Outer shade colour'
                : 'Shade colour'
          }
          value={shade.colour}
          onChange={(colour) => useProjectStore.getState().setShadeColour(colour, role)}
        />
      </fieldset>
      {form(layout.appearance)}
      {technical(layout.construction, 'Construction', 'Wall thickness and structural details')}
      {technical(layout.pattern, 'Pattern details', 'Fine adjustments to the surface and spacing')}
    </>
  );
}
