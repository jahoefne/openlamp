/**
 * Classic-shade parameter groups (the flat keys of `CLASSIC_PARAM_PATHS`): the
 * outer shade's shape and surface, or the puck's `kit` group, or the velcro
 * strap's `mount` group.
 */
import { useMemo } from 'react';
import { CLASSIC_PARAM_PATHS, projectToClassicParams } from '@core/model/project.ts';
import type { ClassicShadeKey, ClassicShadeParams, ParamGroup } from '@core/schema/defs.ts';
import { commitEdit, editTransient, endEdit } from '../../forms/editSession.ts';
import { SchemaForm } from '../../forms/SchemaForm.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { useWarningsByPath } from './warnings.ts';

const asKey = (key: string) => key as ClassicShadeKey;
const asValue = (value: number | string) => value as ClassicShadeParams[ClassicShadeKey];

export function ClassicForm({ groups }: { groups: readonly ParamGroup[] }) {
  const project = useProjectStore((s) => s.project);
  const values = useMemo(() => projectToClassicParams(project), [project]);
  const byPath = useWarningsByPath();
  const warningsFor = (key: string) => byPath.get(CLASSIC_PARAM_PATHS[asKey(key)]) ?? [];

  return (
    <SchemaForm
      groups={groups}
      values={values}
      warningsFor={warningsFor}
      onTransient={(key, v) => editTransient(asKey(key), v)}
      onCommit={(key, v) => commitEdit(asKey(key), asValue(v))}
      onEnd={endEdit}
    />
  );
}
