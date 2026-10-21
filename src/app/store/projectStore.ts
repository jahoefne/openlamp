/**
 * The project store: the one piece of app state that is saved, shared and
 * undoable. zustand + immer + zundo `temporal`.
 *
 * Every mutation bumps `project.revision`, which is what the history compares
 * (`equality`): a `set` that leaves the revision alone (e.g. `dirty`) is never
 * an undo step.
 *
 * Slider drags are one undo step: the first transient edit remembers the
 * project before the drag and pauses the history, the commit resumes it, and
 * the step it records goes back to the remembered project. A drag that ends
 * where it started records nothing.
 *
 * Steps are throttled (one per 300 ms): a burst of quick commits (typing in a
 * number field or the project name, holding an arrow key on a slider) merges
 * into the step its first commit opened.
 */
import { create, useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal, type TemporalState } from 'zundo';
import type { Draft } from 'immer';
import type { Quality } from '@core/geometry/quality.ts';
import { canonicalJson } from '@core/hash.ts';
import type { Hex } from '@core/model/assembly.ts';
import {
  HUB_PARAM_PATHS,
  classicParamsToProject,
  createDefaultProject,
  projectToClassicParams,
  type Project,
} from '@core/model/project.ts';
import type {
  ClassicShadeKey,
  ClassicShadeParams,
  HubJointKey,
  HubJointParams,
} from '@core/schema/defs.ts';
import type { PrinterSpec } from '@core/schema/printers.ts';

/** Minimum time between two undo steps; quicker commits merge into the open step. */
export const HISTORY_THROTTLE_MS = 300;
export const HISTORY_LIMIT = 100;

export interface EditOptions {
  /**
   * An intermediate value of a continuous edit (slider drag): applied and
   * built, but not an undo step of its own. The next non-transient edit ends it.
   */
  transient?: boolean;
}

export interface ProjectState {
  project: Project;
  /** Changed since it was last loaded or saved to a file. */
  dirty: boolean;
  /**
   * How many whole projects have been loaded (`replaceProject`). Not part of
   * the history: the camera rig frames the lamp when it changes.
   */
  loads: number;
  /** Load a whole project (example, file, reset). Undoable. */
  replaceProject(project: Project): void;
  /** The project at this revision was saved to a file: clear `dirty` unless it changed since. */
  markSaved(revision: number): void;
  setProjectName(name: string): void;
  setPrinter(printer: PrinterSpec): void;
  setQuality(which: 'preview' | 'export', quality: Quality): void;
  setFitTest(fitTest: boolean): void;
  /** Set one flat classic-shade parameter (see `CLASSIC_PARAM_PATHS` for where it lives). */
  setClassicParam<K extends ClassicShadeKey>(
    key: K,
    value: ClassicShadeParams[K],
    options?: EditOptions,
  ): void;
  /** Set one flat hub / joint parameter (see `HUB_PARAM_PATHS` for where it lives). */
  setHubParam<K extends HubJointKey>(key: K, value: HubJointParams[K], options?: EditOptions): void;
  /** Print hub and shade as one part (the classic shade) or as two parts joined by a collar. */
  setFused(fused: boolean): void;
  /**
   * End a transient edit without a final value (a drag released where it
   * started): one undo step if the project changed, none if it did not.
   */
  endTransient(): void;
  setShadeColour(colour: Hex): void;
}

/** What the history stores: just the project. */
export type HistoryState = Pick<ProjectState, 'project'>;

// ---------------------------------------------------------------- history bookkeeping

/** The project before the transient edit in progress, or null. */
let dragOrigin: Project | null = null;
/** When the last undo step was recorded (Date.now()). */
let lastStepAt = -Infinity;

/** The project without its bookkeeping fields, for "did anything change?". */
function contentKey(project: Project): string {
  return canonicalJson({ ...project, revision: 0, updatedAt: '' });
}

function touch(project: Draft<Project>): void {
  project.revision += 1;
  project.updatedAt = new Date().toISOString();
}

/** Set the value at a dotted path such as `joints.tolerance` in a draft. */
function setAtPath(target: Draft<Project>, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  let node = target as unknown as Record<string, unknown>;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  node[last] = value;
}

// ---------------------------------------------------------------- store

export const useProjectStore = create<ProjectState>()(
  temporal(
    immer((set, get) => {
      /** Apply a change to the project as one (undoable) revision. */
      const edit = (recipe: (project: Draft<Project>) => void): void => {
        set((s) => {
          recipe(s.project);
          touch(s.project);
          s.dirty = true;
        });
      };

      /** Leave transient mode (if in it) so the next `set` is recorded against the drag origin. */
      const resumeHistory = (): void => {
        if (dragOrigin) useProjectStore.temporal.getState().resume();
      };

      /**
       * A parameter edit that may be transient (a slider drag): the first
       * transient edit remembers the project and pauses the history, a final
       * one resumes it so its step goes back to the remembered project.
       */
      const editParam = (
        options: EditOptions,
        apply: (current: Project, draft: Draft<ProjectState>) => void,
      ): void => {
        const current = get().project;
        if (options.transient) {
          if (!dragOrigin) {
            dragOrigin = current;
            useProjectStore.temporal.getState().pause();
          }
        } else {
          resumeHistory();
        }
        set((s) => {
          apply(current, s);
          touch(s.project);
          s.dirty = true;
        });
        if (!options.transient) dragOrigin = null;
      };

      return {
        project: createDefaultProject(),
        dirty: false,
        loads: 0,

        replaceProject(project) {
          cancelTransient();
          set((s) => {
            // A fresh revision even when the incoming one is equal: the history
            // (and everything keyed on the revision) must see a change.
            s.project = {
              ...project,
              revision: Math.max(project.revision, s.project.revision) + 1,
            };
            s.dirty = false;
            s.loads += 1;
          });
        },

        markSaved(revision) {
          if (get().project.revision === revision && get().dirty) set({ dirty: false });
        },

        setProjectName(name) {
          edit((p) => {
            p.name = name;
          });
        },

        setPrinter(printer) {
          const copy: PrinterSpec = {
            ...printer,
            bed: [printer.bed[0], printer.bed[1], printer.bed[2]],
          };
          edit((p) => {
            p.printer = copy;
          });
        },

        setQuality(which, quality) {
          edit((p) => {
            p.quality[which] = quality;
          });
        },

        setFitTest(fitTest) {
          edit((p) => {
            p.fitTest = fitTest;
          });
        },

        setClassicParam(key, value, options = {}) {
          editParam(options, (current, draft) => {
            const flat: ClassicShadeParams = { ...projectToClassicParams(current), [key]: value };
            draft.project = classicParamsToProject(flat, current);
          });
        },

        setHubParam(key, value, options = {}) {
          editParam(options, (_current, draft) => {
            setAtPath(draft.project, HUB_PARAM_PATHS[key], value);
          });
        },

        setFused(fused) {
          edit((p) => {
            p.hub.fused = fused;
          });
        },

        endTransient() {
          if (!dragOrigin) return;
          resumeHistory();
          // Record the drag as it ended (handleSet drops it if nothing changed).
          edit(() => {});
          dragOrigin = null;
        },

        setShadeColour(colour) {
          edit((p) => {
            p.shades[0].colour = colour;
          });
        },
      };
    }),
    {
      partialize: (s): HistoryState => ({ project: s.project }),
      limit: HISTORY_LIMIT,
      equality: (past, current) => past.project.revision === current.project.revision,
      handleSet: (handleSet) => (pastState, _replace, currentState) => {
        // A drag's step goes back to where the drag started, not to its last
        // intermediate value.
        const past = (dragOrigin ? { project: dragOrigin } : pastState) as HistoryState;
        dragOrigin = null;
        if (contentKey(past.project) === contentKey(currentState.project)) return;
        const now = Date.now();
        if (now - lastStepAt < HISTORY_THROTTLE_MS) return; // merge into the open step
        lastStepAt = now;
        handleSet(past);
      },
    },
  ),
);

/** Abandon a transient edit in progress (its intermediate values stay, unrecorded). */
function cancelTransient(): void {
  if (!dragOrigin) return;
  dragOrigin = null;
  useProjectStore.temporal.getState().resume();
}

// ---------------------------------------------------------------- history API

/** Subscribe a component to the undo history. */
export function useTemporal<T>(selector: (state: TemporalState<HistoryState>) => T): T {
  return useStore(useProjectStore.temporal, selector);
}

export function canUndo(): boolean {
  return useProjectStore.temporal.getState().pastStates.length > 0;
}

export function canRedo(): boolean {
  return useProjectStore.temporal.getState().futureStates.length > 0;
}

export function undo(): void {
  cancelTransient();
  if (!canUndo()) return;
  lastStepAt = -Infinity; // the next edit opens a new step (and clears the redo stack)
  useProjectStore.temporal.getState().undo();
  useProjectStore.setState({ dirty: true });
}

export function redo(): void {
  cancelTransient();
  if (!canRedo()) return;
  lastStepAt = -Infinity;
  useProjectStore.temporal.getState().redo();
  useProjectStore.setState({ dirty: true });
}

/** Forget the whole undo history (tests; a future "new project"). */
export function clearHistory(): void {
  cancelTransient();
  lastStepAt = -Infinity;
  useProjectStore.temporal.getState().clear();
}
