/**
 * Edits of the flat parameters from the forms (classic shade, light, mount, hub & joint),
 * including the slider drag lifecycle: the intermediate values of a drag are
 * transient (one undo step for the whole drag) and built at draft quality;
 * the commit returns to the project's preview quality, so the release
 * triggers the full build.
 */
import type {
  ClassicShadeKey,
  ClassicShadeParams,
  HubJointKey,
  HubJointParams,
} from '@core/schema/defs.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { useUiStore } from '../store/uiStore.ts';

type Setter<K extends string, V> = (key: K, value: V, options: { transient: boolean }) => void;

export interface EditSession<K extends string, V> {
  /** An intermediate value of a continuous edit (slider drag). */
  transient(key: K, value: V): void;
  /** A final value: one undo step (a drag in progress ends with it). */
  commit(key: K, value: V): void;
  /** A continuous edit ended without a final value (released where it started). */
  end(): void;
}

function endDraft(): void {
  if (useUiStore.getState().previewQuality !== null) {
    useUiStore.getState().setPreviewQuality(null);
  }
}

function editSession<K extends string, V>(setter: () => Setter<K, V>): EditSession<K, V> {
  return {
    transient(key, value) {
      if (useUiStore.getState().previewQuality !== 'draft') {
        useUiStore.getState().setPreviewQuality('draft');
      }
      setter()(key, value, { transient: true });
    },
    commit(key, value) {
      setter()(key, value, { transient: false });
      endDraft();
    },
    end() {
      useProjectStore.getState().endTransient();
      endDraft();
    },
  };
}

// The forms only offer values of the key's own type (numbers for number
// definitions, one of the options for selects).
const classic = editSession<ClassicShadeKey, ClassicShadeParams[ClassicShadeKey]>(
  () =>
    useProjectStore.getState().setClassicParam as Setter<
      ClassicShadeKey,
      ClassicShadeParams[ClassicShadeKey]
    >,
);

/** Edits of the current mount's flat parameters (see `MOUNT_PARAM_PATHS`). */
export const mountEdits = editSession<string, number | string>(
  () => useProjectStore.getState().setMountParam,
);

/** Edits of the current bulb's or strip's flat parameters (see `LIGHT_PARAM_PATHS`). */
export const lightEdits = editSession<string, number | string>(
  () => useProjectStore.getState().setLightParam,
);

/** Edits of the hub & joint parameters. */
export const hubEdits = editSession<HubJointKey, HubJointParams[HubJointKey]>(
  () => useProjectStore.getState().setHubParam as Setter<HubJointKey, HubJointParams[HubJointKey]>,
);

/** An intermediate value of a continuous classic-shade edit (slider drag). */
export const editTransient = classic.transient;
/** A final classic-shade value: one undo step (a drag in progress ends with it). */
export const commitEdit = classic.commit;
/** A continuous edit ended without a final value (released where it started). */
export const endEdit = classic.end;
