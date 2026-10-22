/**
 * Hub & joints: fused (one print) or split into a hub and a shade, and the
 * split lamp's hub and shade joint (type, clearance, thread, collar wall,
 * radial gap, shoulder, vents). The fit-test pair is printed from these.
 */
import { useMemo } from 'react';
import { HUB_PARAM_PATHS, projectToHubParams } from '@core/model/project.ts';
import { HUB_JOINT_GROUPS, type HubJointKey, type HubJointParams } from '@core/schema/defs.ts';
import { hubEdits } from '../../forms/editSession.ts';
import { ToggleField } from '../../forms/fields/ToggleField.tsx';
import { SchemaForm } from '../../forms/SchemaForm.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import styles from '../Inspector.module.css';
import { useWarningsByPath } from './warnings.ts';

const asHubKey = (key: string) => key as HubJointKey;
const asHubValue = (value: number | string) => value as HubJointParams[HubJointKey];

export function HubInspector() {
  const project = useProjectStore((s) => s.project);
  // Only the strap with a puck and a revolved shade has a single-piece print;
  // everything else splits the lamp.
  const strap = project.mount.kind === 'ceilingStrap';
  const puck = project.light.kind === 'puck';
  const revolved = project.shades[0].style.family === 'revolved';
  const fused = strap && puck && revolved && project.hub.fused;
  const lightKind = project.light.kind;
  const innerShade = project.shades.length > 1;
  const values = useMemo(
    () => ({ ...projectToHubParams(project), fused, lightKind, innerShade }),
    [project, fused, lightKind, innerShade],
  );
  const byPath = useWarningsByPath();
  const warningsFor = (key: string) => byPath.get(HUB_PARAM_PATHS[asHubKey(key)]) ?? [];
  const setFused = (on: boolean) => {
    useProjectStore.getState().setFused(on);
    useUiStore.getState().requestFit(true); // the lamp changes shape: frame it once built
  };
  return (
    <SchemaForm
      groups={HUB_JOINT_GROUPS}
      values={values}
      warningsFor={warningsFor}
      onTransient={(key, v) => hubEdits.transient(asHubKey(key), v)}
      onCommit={(key, v) => hubEdits.commit(asHubKey(key), asHubValue(v))}
      onEnd={hubEdits.end}
      lead={() =>
        strap && puck && revolved ? (
          <ToggleField
            id="p-fused"
            label="Single-piece print (fused)"
            checked={fused}
            help="On: hub and shade print as one part (the classic shade). Off: a separate hub holds the puck and hangs from the strap, and the shade hangs from the hub on a bayonet, press fit or thread."
            onChange={setFused}
          />
        ) : (
          <p className={styles.hint}>
            With this {!puck ? 'light' : !strap ? 'mount' : 'shade style'} the hub and the shade
            print separately; the shade hangs from the hub on a bayonet, press fit or thread.
          </p>
        )
      }
    />
  );
}
