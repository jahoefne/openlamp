/**
 * Hub & joints: fused (one print) or split into a hub and a shade, and the
 * split lamp's hub and shade joint (type, clearance, thread, collar wall,
 * radial gap, shoulder, vents). The fit-test pair is printed from these.
 */
import { useMemo } from 'react';
import { HUB_PARAM_PATHS, projectToHubParams } from '@core/model/project.ts';
import { type HubJointKey, type HubJointParams, type ParamGroup } from '@core/schema/defs.ts';
import { hubEdits } from '../../forms/editSession.ts';
import { ToggleField } from '../../forms/fields/ToggleField.tsx';
import { SchemaForm } from '../../forms/SchemaForm.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import styles from '../Inspector.module.css';
import { useWarningsByPath } from './warnings.ts';
import { HUB_LAYOUT } from './hardwareLayout.ts';
import { ParameterSection } from '../ParameterSection.tsx';
import { nordicLettering } from '../../brand/lettering.ts';

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
  const form = (groups: readonly ParamGroup[]) => (
    <SchemaForm
      groups={groups}
      values={values}
      warningsFor={warningsFor}
      onTransient={(key, v) => hubEdits.transient(asHubKey(key), v)}
      onCommit={(key, v) => hubEdits.commit(asHubKey(key), asHubValue(v))}
      onEnd={hubEdits.end}
    />
  );
  return (
    <>
      <fieldset>
        <legend aria-label="Assembly">{nordicLettering('Assembly')}</legend>
        {strap && puck && revolved ? (
          <ToggleField
            id="p-fused"
            label="Single-piece print (fused)"
            checked={fused}
            help="On: hub and shade print as one part. Off: a separate hub holds the light and the shade connects with a bayonet, press fit or thread."
            onChange={setFused}
          />
        ) : (
          <p className={styles.hint}>
            With this {!puck ? 'light' : !strap ? 'mount' : 'shade style'} the hub and shade print
            separately, joined by a bayonet, press fit or thread.
          </p>
        )}
      </fieldset>
      {form(HUB_LAYOUT.primary)}
      {HUB_LAYOUT.sections.map((section) => (
        <ParameterSection
          key={section.id}
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
