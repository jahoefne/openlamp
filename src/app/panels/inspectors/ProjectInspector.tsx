/**
 * The project node: what the lamp is, reset, the output options (preview and
 * export mesh quality, fit-test mode) and the view options (bed view,
 * explode, section, light on and its simple preview, ghosts, mounted). The
 * project's name and the printer chip are in the project bar.
 */
import { QUALITIES, type Quality } from '@core/geometry/quality.ts';
import { createDefaultProject } from '@core/model/project.ts';
import { CLASSIC_SHADE_DEFS } from '@core/schema/defs.ts';
import { RangeField } from '../../forms/fields/RangeField.tsx';
import { SelectField } from '../../forms/fields/SelectField.tsx';
import { ToggleField } from '../../forms/fields/ToggleField.tsx';
import { newProjectId } from '../../persistence/identity.ts';
import { useProjectStore } from '../../store/projectStore.ts';
import { useUiStore, type SectionAxis } from '../../store/uiStore.ts';
import styles from '../Inspector.module.css';
import { nordicLettering } from '../../brand/lettering.ts';

const FIT_TEST_HELP = CLASSIC_SHADE_DEFS.find((d) => d.key === 'fitTest')?.help;

function OutputOptions() {
  const quality = useProjectStore((s) => s.project.quality);
  const fitTest = useProjectStore((s) => s.project.fitTest);
  const { setQuality, setFitTest } = useProjectStore.getState();
  return (
    <fieldset>
      <legend aria-label="Output">{nordicLettering('Output')}</legend>
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
        label="Fit test only (joint test pair)"
        checked={fitTest}
        help={FIT_TEST_HELP}
        onChange={(on) => {
          setFitTest(on);
          useUiStore.getState().requestFit(true); // other parts: frame them once built
        }}
      />
    </fieldset>
  );
}

function ViewOptions() {
  const section = useUiStore((s) => s.section);
  const axis = useUiStore((s) => s.sectionAxis);
  const ghosts = useUiStore((s) => s.ghosts);
  const mounted = useUiStore((s) => s.mounted);
  const explode = useUiStore((s) => s.explode);
  const bedView = useUiStore((s) => s.viewMode === 'bed');
  const lightOn = useUiStore((s) => s.lightOn);
  const simpleLight = useUiStore((s) => s.simpleLight);
  const {
    setSection,
    setSectionAxis,
    setGhosts,
    setMounted,
    setExplode,
    setViewMode,
    setLightOn,
    setSimpleLight,
  } = useUiStore.getState();
  return (
    <fieldset>
      <legend>View</legend>
      <ToggleField
        id="v-bed"
        label="Bed view (parts as printed) · B"
        checked={bedView}
        help="Every part in its print orientation where the export lays it out on the printer's bed; parts that do not fit lie beside it in red."
        onChange={(on) => setViewMode(on ? 'bed' : 'assembled')}
      />
      <RangeField
        id="v-explode"
        label="Explode"
        value={explode}
        disabled={bedView}
        help="Moves the parts apart along the lamp's axis."
        onChange={setExplode}
      />
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
        id="v-light"
        label="Light on · L"
        checked={lightOn}
        help={
          bedView
            ? 'Shows in the assembled view (the bed view shows the parts as printed).'
            : 'Dims the room and lights the lamp: a warm light at the light source, shining through the shades; a light-coloured inner shade reflects it.'
        }
        onChange={setLightOn}
      />
      {lightOn && (
        <ToggleField
          id="v-simple-light"
          label="Simple light preview"
          checked={simpleLight}
          help="Translucent shades instead of light passing through them: faster on slow graphics (on by default with 4 or fewer CPU cores)."
          onChange={setSimpleLight}
        />
      )}
      <ToggleField
        id="v-ghosts"
        label="Show the light, strap and cord"
        checked={ghosts}
        onChange={setGhosts}
      />
      <ToggleField
        id="v-mounted"
        label="Show as mounted (ceiling, wall or floor)"
        checked={mounted}
        onChange={setMounted}
      />
      <p className={styles.hint}>
        F frames the lamp · L lights it · drag to orbit · click a part to select it, empty space for
        the project
      </p>
    </fieldset>
  );
}

export function ProjectInspector() {
  const name = useProjectStore((s) => s.project.name);
  // A new project (fresh id), so its autosave starts a slot of its own.
  const reset = () => {
    useProjectStore.getState().replaceProject(createDefaultProject({ id: newProjectId() }));
    useUiStore.getState().clearSelection();
  };
  return (
    <>
      <div className={styles.header}>
        <p className={styles.sub}>
          <strong className={styles.projectName}>{name || 'Untitled lamp'}</strong>A printable lamp:
          pick a node in the lamp tree to shape the shade, choose a light (USB puck, E27 / E14 bulb,
          LED strip) and a mount.
        </p>
        <button type="button" title="Back to the default shade" onClick={reset}>
          Reset
        </button>
      </div>
      <OutputOptions />
      <ViewOptions />
    </>
  );
}
