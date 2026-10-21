/**
 * The inner shade: its own shape, surface and colour, and removing it (one
 * undo step; the selection moves to the outer shade). Adding one is the lamp
 * tree's "Add inner shade" row.
 */
import { useMemo } from 'react';
import { shadeParamPath, shadeToParams } from '@core/model/project.ts';
import { SHADE_GROUPS, type ParamGroup } from '@core/schema/defs.ts';
import { innerShadeEdits } from '../../forms/editSession.ts';
import { ColourField } from '../../forms/fields/ColourField.tsx';
import { SchemaForm } from '../../forms/SchemaForm.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import styles from '../Inspector.module.css';
import { useWarningsByPath } from './warnings.ts';

const INNER_GROUP_LABELS: Readonly<Record<string, string>> = {
  shape: 'Inner shade shape',
  style: 'Inner shade surface',
};
const INNER_SHADE_GROUPS: readonly ParamGroup[] = SHADE_GROUPS.map((g) => ({
  ...g,
  id: `inner-${g.id}`,
  label: INNER_GROUP_LABELS[g.id] ?? `Inner shade · ${g.label}`,
}));

export function InnerShadeInspector() {
  const inner = useProjectStore((s) => s.project.shades[1]);
  const values = useMemo(() => (inner ? shadeToParams(inner) : undefined), [inner]);
  const byPath = useWarningsByPath();
  const warningsFor = (key: string) => byPath.get(shadeParamPath('inner', key) ?? '') ?? [];
  if (!inner || !values) return null;
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
      <SchemaForm
        groups={INNER_SHADE_GROUPS}
        values={values}
        idPrefix="p-inner-"
        warningsFor={warningsFor}
        onTransient={(key, v) => innerShadeEdits.transient(key, v)}
        onCommit={(key, v) => innerShadeEdits.commit(key, v)}
        onEnd={innerShadeEdits.end}
      />
    </>
  );
}
