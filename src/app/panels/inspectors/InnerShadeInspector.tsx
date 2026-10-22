/**
 * The inner shade: its style family, its own parameters and colour, and
 * removing it (one undo step; the selection moves to the outer shade). Adding
 * one is the lamp tree's "Add inner shade" row.
 */
import { SHADE_FAMILY_GROUPS, type ParamGroup, type ShadeFamily } from '@core/schema/defs.ts';
import { innerShadeEdits } from '../../forms/editSession.ts';
import { ColourField } from '../../forms/fields/ColourField.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import styles from '../Inspector.module.css';
import { ShadeFamilyField, ShadeFamilyForm } from './ShadeFamilyForm.tsx';

const INNER_GROUP_LABELS: Readonly<Record<string, string>> = {
  shape: 'Inner shade shape',
  style: 'Inner shade surface',
};

/** A family's groups for the inner shade: `inner-` ids, "Inner shade …" labels. */
const innerGroups = (family: ShadeFamily): readonly ParamGroup[] =>
  SHADE_FAMILY_GROUPS[family].map((g) => ({
    ...g,
    id: `inner-${g.id}`,
    label: INNER_GROUP_LABELS[g.id] ?? `Inner shade · ${g.label}`,
  }));

const INNER_SHADE_GROUPS: Readonly<Record<ShadeFamily, readonly ParamGroup[]>> = {
  revolved: innerGroups('revolved'),
  tiered: innerGroups('tiered'),
  slatted: innerGroups('slatted'),
  geometric: innerGroups('geometric'),
};

export function InnerShadeInspector() {
  const inner = useProjectStore((s) => s.project.shades[1]);
  if (!inner) return null;
  const family = inner.style.family;
  const remove = () => {
    useProjectStore.getState().removeInnerShade();
    useUiStore.getState().select('outerShade', 'shade');
    useUiStore.getState().requestFit(true); // the lamp changes shape: frame it once built
  };
  return (
    <>
      <fieldset>
        <legend>Inner shade</legend>
        <p className={styles.hint}>
          A second shade hangs inside the outer one from its own collar ring on the hub.
        </p>
        <ShadeFamilyField role="inner" family={family} idPrefix="p-inner-" />
        <ColourField
          id="p-inner-colour"
          label="Inner shade colour"
          value={inner.colour}
          onChange={(c) => useProjectStore.getState().setShadeColour(c, 'inner')}
        />
        <button type="button" className={styles.wide} onClick={remove}>
          Remove inner shade
        </button>
      </fieldset>
      <ShadeFamilyForm
        role="inner"
        shade={inner}
        groups={INNER_SHADE_GROUPS[family]}
        idPrefix="p-inner-"
        edits={innerShadeEdits}
      />
    </>
  );
}
