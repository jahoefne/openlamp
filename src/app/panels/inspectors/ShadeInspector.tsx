/**
 * The outer shade: its shape and surface (the classic shade's `SHADE_GROUPS`;
 * with the single-piece print they shape the fused print) and its colour.
 */
import { SHADE_GROUPS } from '@core/schema/defs.ts';
import { ColourField } from '../../forms/fields/ColourField.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { ClassicForm } from './ClassicForm.tsx';

export function ShadeInspector() {
  const colour = useProjectStore((s) => s.project.shades[0].colour);
  const inner = useProjectStore((s) => s.project.shades.length > 1);
  return (
    <>
      <ClassicForm groups={SHADE_GROUPS} />
      <fieldset>
        <legend>Colour</legend>
        <ColourField
          id="p-colour"
          label={inner ? 'Outer shade colour' : 'Shade colour'}
          value={colour}
          onChange={(c) => useProjectStore.getState().setShadeColour(c)}
        />
      </fieldset>
    </>
  );
}
