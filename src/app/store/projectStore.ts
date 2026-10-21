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
import { withInnerShade, withoutInnerShade } from '@core/assembly/innerShade.ts';
import { standingDefaults } from '@core/assembly/mounts/standing.ts';
import type { Quality } from '@core/geometry/quality.ts';
import { canonicalJson } from '@core/hash.ts';
import type { Hex } from '@core/model/assembly.ts';
import {
  HUB_PARAM_PATHS,
  classicParamsToProject,
  createDefaultProject,
  defaultMount,
  lightForChoice,
  lightParamPath,
  mountFromParams,
  mountParamPath,
  mountToParams,
  projectToClassicParams,
  shadeParamPath,
  withBulbPreset,
  type MountOf,
  type Project,
  type ShadeRole,
} from '@core/model/project.ts';
import {
  BULB_FITTINGS,
  BULB_SIZES,
  DEFAULT_VENTS,
  STANDING_VARIANTS,
  type ClassicShadeKey,
  type ClassicShadeParams,
  type HubJointKey,
  type HubJointParams,
  type LightChoice,
  type MountKind,
  type StandingMountParams,
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
   * Switch to another mount with that mount's defaults (light, shade, hub and
   * joints stay). One undo step; nothing happens if it already is that mount.
   */
  setMount(kind: MountKind): void;
  /**
   * Set one flat parameter of the current mount (see `MOUNT_PARAM_PATHS`);
   * a key the current mount does not have is ignored. Switching the standing
   * lamp's variant (`standingVariant`) also gives every parameter that still
   * has the old variant's default the new one's (`standingDefaults`), in the
   * same undo step.
   */
  setMountParam(key: string, value: number | string, options?: EditOptions): void;
  /**
   * Switch the light (the Light select): another kind gets its defaults and
   * the hub the vents it starts with (`DEFAULT_VENTS`); another bulb size keeps
   * the fields the user changed (`lightForChoice`). One undo step; nothing
   * happens if nothing changes.
   */
  setLight(choice: LightChoice): void;
  /**
   * Set one flat parameter of the current bulb or strip (see
   * `LIGHT_PARAM_PATHS`); a new bulb size or fitting applies its preset to the
   * fields the user has not changed (`withBulbPreset`). A key the current
   * light does not have is ignored.
   */
  setLightParam(key: string, value: number | string, options?: EditOptions): void;
  /**
   * Add an inner shade (the outer shade's style scaled to fit inside it,
   * smooth, white; see `defaultInnerShade`) and turn the single-piece print
   * off, as one undo step. Nothing happens if there already is one.
   */
  addInnerShade(): void;
  /** Remove the inner shade (one undo step). Nothing happens if there is none. */
  removeInnerShade(): void;
  /**
   * Set one flat parameter (see `SHADE_PARAM_PATHS`) of the outer or the
   * inner shade; a key that is not a shade parameter, or the inner shade's
   * when there is none, is ignored.
   */
  setShadeParam(role: ShadeRole, key: string, value: number | string, options?: EditOptions): void;
  /**
   * End a transient edit without a final value (a drag released where it
   * started): one undo step if the project changed, none if it did not.
   */
  endTransient(): void;
  /** The colour of the outer shade (default) or of the inner shade (if there is one). */
  setShadeColour(colour: Hex, role?: ShadeRole): void;
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

/** The flat key of the standing lamp's variant (table or floor lamp). */
const STANDING_VARIANT_KEY = 'standingVariant';

type StandingMount = MountOf<'standing'>;

/**
 * The standing mount as `variant`: every parameter that still has the
 * current variant's default (`standingDefaults`) takes the new variant's (a
 * floor lamp is taller, on a wider base); values the user changed stay.
 */
function withVariantDefaults(
  mount: StandingMount,
  variant: StandingMount['variant'],
): StandingMount {
  const before: Readonly<Record<string, unknown>> = mountToParams(standingDefaults(mount.variant));
  const after: Readonly<Record<string, unknown>> = mountToParams(standingDefaults(variant));
  const params: Record<string, unknown> = { ...mountToParams(mount) };
  for (const key of Object.keys(params)) {
    if (params[key] === before[key]) params[key] = after[key];
  }
  params[STANDING_VARIANT_KEY] = variant;
  return mountFromParams('standing', params as StandingMountParams);
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

        setMount(kind) {
          if (get().project.mount.kind === kind) return;
          cancelTransient();
          const mount = defaultMount(kind);
          edit((p) => {
            p.mount = mount;
          });
        },

        setMountParam(key, value, options = {}) {
          const path = mountParamPath(get().project.mount.kind, key);
          if (path === undefined) return;
          editParam(options, (current, draft) => {
            setAtPath(draft.project, path, value);
            // A table lamp turned into a floor lamp (or back) takes that variant's defaults.
            if (current.mount.kind === 'standing' && key === STANDING_VARIANT_KEY) {
              const variant = STANDING_VARIANTS.find((v) => v === value);
              if (variant && variant !== current.mount.variant) {
                draft.project.mount = withVariantDefaults(current.mount, variant);
              }
            }
          });
        },

        setLight(choice) {
          const current = get().project.light;
          const next = lightForChoice(current, choice);
          if (next === current) return;
          cancelTransient();
          edit((p) => {
            p.light = next;
            if (next.kind !== current.kind) p.hub.ventCount = DEFAULT_VENTS[next.kind];
          });
        },

        setLightParam(key, value, options = {}) {
          const light = get().project.light;
          const path = lightParamPath(light.kind, key);
          if (light.kind === 'puck' || path === undefined) return;
          editParam(options, (current, draft) => {
            const bulb = current.light;
            if (bulb.kind === 'bulb' && (key === 'bulbSize' || key === 'bulbFitting')) {
              const size = BULB_SIZES.find((s) => s === (key === 'bulbSize' ? value : bulb.size));
              const fitting = BULB_FITTINGS.find(
                (f) => f === (key === 'bulbFitting' ? value : bulb.fitting),
              );
              if (size && fitting) draft.project.light = withBulbPreset(bulb, size, fitting);
              return;
            }
            setAtPath(draft.project, path, value);
          });
        },

        addInnerShade() {
          const current = get().project;
          if (current.shades[1]) return;
          cancelTransient();
          const next = withInnerShade(current);
          edit((p) => {
            p.hub.fused = next.hub.fused;
            p.shades = next.shades;
          });
        },

        removeInnerShade() {
          const current = get().project;
          if (!current.shades[1]) return;
          cancelTransient();
          const next = withoutInnerShade(current);
          edit((p) => {
            p.shades = next.shades;
          });
        },

        setShadeParam(role, key, value, options = {}) {
          const path = shadeParamPath(role, key);
          if (path === undefined || (role === 'inner' && !get().project.shades[1])) return;
          editParam(options, (_current, draft) => {
            setAtPath(draft.project, path, value);
          });
        },

        endTransient() {
          if (!dragOrigin) return;
          resumeHistory();
          // Record the drag as it ended (handleSet drops it if nothing changed).
          edit(() => {});
          dragOrigin = null;
        },

        setShadeColour(colour, role = 'outer') {
          if (role === 'inner' && !get().project.shades[1]) return;
          edit((p) => {
            const shade = role === 'inner' ? p.shades[1] : p.shades[0];
            if (shade) shade.colour = colour;
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
