import type { ReactNode } from 'react';
import { useProjectStore } from '../store/projectStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import styles from './Viewport.module.css';

const ICONS: Record<string, ReactNode> = {
  lamp: <path d="M9 3h6l5 12H4L9 3Zm3 12v6m-4 0h8" />,
  bed: (
    <>
      <path d="m3 9 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5" />
    </>
  ),
  frame: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
    </>
  ),
};
function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

/** View controls share the existing UI state and never rebuild the lamp. */
export function ViewportChrome() {
  const name = useProjectStore((s) => s.project.name);
  const bed = useUiStore((s) => s.viewMode === 'bed');
  const light = useUiStore((s) => s.lightOn);
  const simple = useUiStore((s) => s.simpleLight);
  const lit = light && !bed;
  const { setViewMode, toggleLightOn, setSimpleLight, requestFit } = useUiStore.getState();
  return (
    <>
      <div className={styles.sceneHeading}>
        <span className={styles.eyebrow}>OPENLAMP {lit ? 'AFTERGLOW' : 'ATELIER'}</span>
        <h1>{bed ? 'Ready to make.' : lit ? 'Find your afterglow.' : 'Made of light.'}</h1>
        <p>
          {name || 'Untitled lamp'}{' '}
          <span>
            /{' '}
            {bed
              ? 'Print layout'
              : lit
                ? 'Warm white lighting preview'
                : 'Your design, taking shape'}
          </span>
        </p>
      </div>
      <div className={styles.viewBar} role="toolbar" aria-label="Preview controls">
        <div className={styles.viewModes} role="group" aria-label="Preview layout">
          <button type="button" aria-pressed={!bed} onClick={() => setViewMode('assembled')}>
            <Icon name="lamp" />
            Assembled
          </button>
          <button type="button" aria-pressed={bed} onClick={() => setViewMode('bed')}>
            <Icon name="bed" />
            Print bed
          </button>
        </div>
        <button
          type="button"
          onClick={() => requestFit(false)}
          title="Frame lamp (F)"
          aria-label="Frame lamp"
        >
          <Icon name="frame" />
        </button>
        <button type="button" aria-pressed={light && !bed} disabled={bed} onClick={toggleLightOn}>
          <Icon name="light" />
          Light {light && !bed ? 'on' : 'off'}
        </button>
        {lit && (
          <div className={styles.renderSettings} role="group" aria-label="Lighting quality">
            <button
              type="button"
              aria-pressed={simple}
              onClick={() => setSimpleLight(!simple)}
              title="Use lighter materials for slower devices"
            >
              Simple preview <span>{simple ? 'On' : 'Off'}</span>
            </button>
          </div>
        )}
      </div>
      <span className={styles.orbitHint}>Drag to orbit · Scroll to zoom</span>
    </>
  );
}
