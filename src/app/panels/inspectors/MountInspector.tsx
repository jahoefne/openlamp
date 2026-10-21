/**
 * Which mount, and its parameters (they shape the mount's parts: canopy, cord
 * grip, stem, base, lid, wall plate, arm). Switching keeps the light, the
 * shade, the hub and the joints and gives the new mount its defaults (one
 * undo step).
 */
import { useMemo } from 'react';
import { mountParamPath, mountToParams } from '@core/model/project.ts';
import {
  MOUNT_DESCRIPTIONS,
  MOUNT_GROUPS,
  MOUNT_KINDS,
  MOUNT_LABELS,
  type MountKind,
} from '@core/schema/defs.ts';
import { mountEdits } from '../../forms/editSession.ts';
import { SelectField } from '../../forms/fields/SelectField.tsx';
import { SchemaForm } from '../../forms/SchemaForm.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { useWarningsByPath } from './warnings.ts';

const isMountKind = (k: string): k is MountKind => (MOUNT_KINDS as readonly string[]).includes(k);

export function MountInspector() {
  const mount = useProjectStore((s) => s.project.mount);
  const values = useMemo(() => mountToParams(mount), [mount]);
  const byPath = useWarningsByPath();
  const warningsFor = (key: string) => byPath.get(mountParamPath(mount.kind, key) ?? '') ?? [];
  const setMount = (kind: string) => {
    if (!isMountKind(kind)) return;
    useProjectStore.getState().setMount(kind);
    useUiStore.getState().requestFit(true); // the lamp changes shape: frame it once built
  };
  return (
    <>
      <fieldset>
        <legend>Mount</legend>
        <SelectField
          id="p-mount"
          label="Mount"
          value={mount.kind}
          options={MOUNT_KINDS}
          optionLabel={(k) => (isMountKind(k) ? MOUNT_LABELS[k] : k)}
          help={MOUNT_DESCRIPTIONS[mount.kind]}
          warnings={byPath.get('mount.kind')}
          onChange={setMount}
        />
      </fieldset>
      <SchemaForm
        groups={MOUNT_GROUPS[mount.kind]}
        values={values}
        warningsFor={warningsFor}
        onTransient={(key, v) => mountEdits.transient(key, v)}
        onCommit={(key, v) => mountEdits.commit(key, v)}
        onEnd={mountEdits.end}
      />
    </>
  );
}
