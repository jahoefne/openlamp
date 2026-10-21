/**
 * Edits of the classic-shade parameters from the form, including the slider
 * drag lifecycle: the intermediate values of a drag are transient (one undo
 * step for the whole drag) and built at draft quality; the commit returns to
 * the project's preview quality, so the release triggers the full build.
 */
import type { ClassicShadeKey, ClassicShadeParams } from '@core/schema/defs.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { useUiStore } from '../store/uiStore.ts';

type Value = ClassicShadeParams[ClassicShadeKey];

/** An intermediate value of a continuous edit (slider drag). */
export function editTransient(key: ClassicShadeKey, value: Value): void {
  if (useUiStore.getState().previewQuality !== 'draft') {
    useUiStore.getState().setPreviewQuality('draft');
  }
  setParam(key, value, true);
}

/** A final value: one undo step (a drag in progress ends with it). */
export function commitEdit(key: ClassicShadeKey, value: Value): void {
  setParam(key, value, false);
  endDraft();
}

/** A continuous edit ended without a final value (released where it started). */
export function endEdit(): void {
  useProjectStore.getState().endTransient();
  endDraft();
}

function endDraft(): void {
  if (useUiStore.getState().previewQuality !== null) {
    useUiStore.getState().setPreviewQuality(null);
  }
}

function setParam(key: ClassicShadeKey, value: Value, transient: boolean): void {
  // The form only offers values of the key's own type (numbers for number
  // definitions, one of the options for selects).
  const set = useProjectStore.getState().setClassicParam as (
    key: ClassicShadeKey,
    value: Value,
    options: { transient: boolean },
  ) => void;
  set(key, value, { transient });
}
