/**
 * Starts persistence for the page, before the first render:
 * - opens the startup project (`#p=` link → legacy `?query` link → latest
 *   autosave → default project), without an undo step back to the default;
 * - autosaves every change (debounced, flushed when the page is hidden);
 * - mirrors committed edits into the URL hash (not the intermediate values of
 *   a slider drag, while the undo history is paused);
 * - opens a `#p=` link pasted into the address bar of the running app.
 */
import { clearHistory, useProjectStore } from '../store/projectStore.ts';
import { connectAutosave, getAutosave } from './autosave.ts';
import {
  decodeProjectHash,
  encodeProjectHash,
  resolveStartupProject,
  writeHash,
  type StartupSource,
} from './urlState.ts';

let started: StartupSource | null = null;

/** Idempotent; returns where the startup project came from. */
export function initPersistence(): StartupSource {
  if (started) return started;
  const autosave = getAutosave();
  const start = resolveStartupProject(window.location, () => autosave.latest());
  started = start.source;

  if (start.source !== 'default') {
    // `loads: 1` frames the camera on it once built, as for any loaded project.
    useProjectStore.setState({ project: start.project, dirty: false, loads: 1 });
    clearHistory();
  }
  if (start.source === 'legacy') writeHash(start.project, { dropQuery: true });

  connectAutosave(autosave, useProjectStore);
  useProjectStore.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    // Paused history = a slider drag in progress; its commit writes the hash.
    if (!useProjectStore.temporal.getState().isTracking) return;
    writeHash(state.project);
  });

  const flush = () => autosave.flush();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    const shared = decodeProjectHash(hash);
    if (!shared) return;
    if (hash === encodeProjectHash(useProjectStore.getState().project)) return;
    useProjectStore.getState().replaceProject(shared);
  });

  return start.source;
}
