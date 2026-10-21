/**
 * The left sidebar: the shade's parameters (from the core schema), the mount
 * (which one, and its parameters), the hub & joint of a two-part lamp, output
 * and colour options, view options and reset. (M2.5 adds the LampTree and one
 * inspector per selected part.)
 */
import { QUALITIES, type Quality } from '@core/geometry/quality.ts';
import type { Warning } from '@core/model/assembly.ts';
import {
  CLASSIC_PARAM_PATHS,
  HUB_PARAM_PATHS,
  createDefaultProject,
  mountParamPath,
  mountToParams,
  projectToClassicParams,
  projectToHubParams,
} from '@core/model/project.ts';
import {
  CLASSIC_SHADE_DEFS,
  CLASSIC_SHADE_GROUPS,
  HUB_JOINT_GROUPS,
  MOUNT_DESCRIPTIONS,
  MOUNT_GROUPS,
  MOUNT_KINDS,
  MOUNT_LABELS,
  type ClassicShadeKey,
  type ClassicShadeParams,
  type HubJointKey,
  type HubJointParams,
  type MountKind,
} from '@core/schema/defs.ts';
import { useMemo } from 'react';
import { ColourField } from '../forms/fields/ColourField.tsx';
import { SelectField } from '../forms/fields/SelectField.tsx';
import { ToggleField } from '../forms/fields/ToggleField.tsx';
import { commitEdit, editTransient, endEdit, hubEdits, mountEdits } from '../forms/editSession.ts';
import { SchemaForm } from '../forms/SchemaForm.tsx';
import { newProjectId } from '../persistence/identity.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { useAssembly } from '../store/selectors.ts';
import { useUiStore, type SectionAxis } from '../store/uiStore.ts';
import styles from './Inspector.module.css';

/**
 * The "Output" group is rendered by hand (quality is per use, fit test is a
 * toggle), the strap's "mount" group with the other mounts.
 */
const SHADE_GROUPS = CLASSIC_SHADE_GROUPS.filter((g) => g.id !== 'output' && g.id !== 'mount');
const isMountKind = (k: string): k is MountKind => (MOUNT_KINDS as readonly string[]).includes(k);
const defOf = (key: ClassicShadeKey) => CLASSIC_SHADE_DEFS.find((d) => d.key === key);

const asKey = (key: string) => key as ClassicShadeKey;
const asValue = (value: number | string) => value as ClassicShadeParams[ClassicShadeKey];
const asHubKey = (key: string) => key as HubJointKey;
const asHubValue = (value: number | string) => value as HubJointParams[HubJointKey];

/** The assembly's warnings by project path, for the fields they are about. */
function useWarningsByPath(): ReadonlyMap<string, Warning[]> {
  const { warnings } = useAssembly();
  return useMemo(() => {
    const map = new Map<string, Warning[]>();
    for (const w of warnings) {
      if (!w.paramPath) continue;
      map.set(w.paramPath, [...(map.get(w.paramPath) ?? []), w]);
    }
    return map;
  }, [warnings]);
}

function ShadeForm() {
  const project = useProjectStore((s) => s.project);
  const values = useMemo(() => projectToClassicParams(project), [project]);
  const byPath = useWarningsByPath();
  const warningsFor = (key: string) => byPath.get(CLASSIC_PARAM_PATHS[asKey(key)]) ?? [];

  return (
    <SchemaForm
      groups={SHADE_GROUPS}
      values={values}
      warningsFor={warningsFor}
      onTransient={(key, v) => editTransient(asKey(key), v)}
      onCommit={(key, v) => commitEdit(asKey(key), asValue(v))}
      onEnd={endEdit}
    />
  );
}

/**
 * Which mount, and its parameters. Switching keeps the light, the shade, the
 * hub and the joints and gives the new mount its defaults (one undo step).
 */
function MountForm() {
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

/** Fused (one print) or split into a hub and a shade, and the split lamp's hub and joint. */
function HubJointForm() {
  const project = useProjectStore((s) => s.project);
  // Only the strap has a single-piece print; every other mount splits the lamp.
  const strap = project.mount.kind === 'ceilingStrap';
  const fused = strap && project.hub.fused;
  const values = useMemo(() => ({ ...projectToHubParams(project), fused }), [project, fused]);
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
        strap ? (
          <ToggleField
            id="p-fused"
            label="Single-piece print (fused)"
            checked={fused}
            help="On: hub and shade print as one part (the classic shade). Off: a separate hub holds the puck and hangs from the strap, and the shade hangs from the hub on a bayonet, press fit or thread."
            onChange={setFused}
          />
        ) : (
          <p className={styles.hint}>
            With this mount the hub and the shade print separately; the shade hangs from the hub on
            a bayonet, press fit or thread.
          </p>
        )
      }
    />
  );
}

function OutputOptions() {
  const quality = useProjectStore((s) => s.project.quality);
  const fitTest = useProjectStore((s) => s.project.fitTest);
  const colour = useProjectStore((s) => s.project.shades[0].colour);
  const { setQuality, setFitTest, setShadeColour } = useProjectStore.getState();
  return (
    <fieldset>
      <legend>Output</legend>
      <SelectField
        id="p-quality"
        label="Mesh quality"
        value={quality.preview}
        options={QUALITIES}
        help="Draft is fast for previews (sliders always preview in draft while you drag)."
        onChange={(q) => setQuality('preview', q as Quality)}
      />
      <SelectField
        id="p-export-quality"
        label="Export quality"
        value={quality.export}
        options={QUALITIES}
        help="Mesh quality of the downloaded STL. Fine gives the smoothest STL at a larger file size."
        onChange={(q) => setQuality('export', q as Quality)}
      />
      <ToggleField
        id="p-fitTest"
        label="Fit test only"
        checked={fitTest}
        help={defOf('fitTest')?.help}
        onChange={setFitTest}
      />
      <ColourField id="p-colour" label="Shade colour" value={colour} onChange={setShadeColour} />
    </fieldset>
  );
}

function ViewOptions() {
  const section = useUiStore((s) => s.section);
  const axis = useUiStore((s) => s.sectionAxis);
  const ghosts = useUiStore((s) => s.ghosts);
  const mounted = useUiStore((s) => s.mounted);
  const { setSection, setSectionAxis, setGhosts, setMounted } = useUiStore.getState();
  return (
    <fieldset>
      <legend>View</legend>
      <ToggleField
        id="v-section"
        label="Section view (cut in half) · X"
        checked={section}
        onChange={setSection}
      />
      {section && (
        <div className={styles.axis} role="radiogroup" aria-label="Section axis">
          <span>Cut across</span>
          {(['x', 'y'] as const satisfies readonly SectionAxis[]).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={axis === a}
              className={styles.axisButton}
              onClick={() => setSectionAxis(a)}
            >
              {a.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      <ToggleField
        id="v-ghosts"
        label="Show LED puck, strap and cord"
        checked={ghosts}
        onChange={setGhosts}
      />
      <ToggleField
        id="v-mounted"
        label="Show as mounted (ceiling, wall or floor)"
        checked={mounted}
        onChange={setMounted}
      />
      <p className={styles.hint}>F frames the lamp · drag to orbit · click a part to select it</p>
    </fieldset>
  );
}

export function Inspector() {
  // A new project (fresh id), so its autosave starts a slot of its own.
  const reset = () =>
    useProjectStore.getState().replaceProject(createDefaultProject({ id: newProjectId() }));
  return (
    <div className={styles.inspector}>
      <header className={styles.header}>
        <p className={styles.sub}>
          A lamp for the Bambu Lab LED Lamp Kit‑001: shape the shade, pick a mount.
        </p>
        <button type="button" title="Back to the default shade" onClick={reset}>
          Reset
        </button>
      </header>
      <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        <ShadeForm />
        <MountForm />
        <HubJointForm />
        <OutputOptions />
        <ViewOptions />
      </form>
    </div>
  );
}
