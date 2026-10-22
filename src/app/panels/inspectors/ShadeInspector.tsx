/**
 * The outer shade: its style family, the family's parameters (a revolved
 * shade has the classic shade's `SHADE_GROUPS`; with the single-piece print
 * they shape the fused print) and its colour.
 */
import { SHADE_FAMILY_GROUPS, SHADE_GROUPS } from '@core/schema/defs.ts';
import { outerShadeEdits } from '../../forms/editSession.ts';
import { ColourField } from '../../forms/fields/ColourField.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { ClassicForm } from './ClassicForm.tsx';
import { ShadeFamilyField, ShadeFamilyForm } from './ShadeFamilyForm.tsx';

export function ShadeInspector() {
  const shade = useProjectStore((s) => s.project.shades[0]);
  const inner = useProjectStore((s) => s.project.shades.length > 1);
  const family = shade.style.family;
  return (
    <>
      <fieldset>
        <legend>Style</legend>
        <ShadeFamilyField role="outer" family={family} idPrefix="p-" />
      </fieldset>
      {family === 'revolved' ? (
        <ClassicForm groups={SHADE_GROUPS} />
      ) : (
        <ShadeFamilyForm
          role="outer"
          shade={shade}
          groups={SHADE_FAMILY_GROUPS[family]}
          idPrefix="p-"
          edits={outerShadeEdits}
        />
      )}
      <fieldset>
        <legend>Colour</legend>
        <ColourField
          id="p-colour"
          label={inner ? 'Outer shade colour' : 'Shade colour'}
          value={shade.colour}
          onChange={(c) => useProjectStore.getState().setShadeColour(c)}
        />
      </fieldset>
    </>
  );
}
