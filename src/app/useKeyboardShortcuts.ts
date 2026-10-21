/**
 * App-wide keys: ⌘/Ctrl+Z undo, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redo, F frames
 * the lamp, X toggles the section view, B the bed view, ⌘/Ctrl+O open, ⌘/Ctrl+S save,
 * ⇧⌘S / Ctrl+Shift+S save as. Text fields keep their own undo and typing,
 * open menus and select lists their typeahead; the file keys work everywhere
 * (they would otherwise open or save the web page).
 */
import { useEffect, useRef } from 'react';
import { redo, undo } from './store/projectStore.ts';
import { useUiStore } from './store/uiStore.ts';

const TEXT_INPUTS = new Set(['text', 'number', 'search', 'email', 'url', 'tel', 'password']);

/** Text fields keep their own keys, open menus and lists their typeahead. */
function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target.closest('[role="listbox"], [role="menu"]')) return true;
  return target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type);
}

export interface FileShortcuts {
  onOpen?: (() => void) | undefined;
  onSave?: (() => void) | undefined;
  onSaveAs?: (() => void) | undefined;
}

export function useKeyboardShortcuts(files: FileShortcuts = {}): void {
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey) return;
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      const { onOpen, onSave, onSaveAs } = filesRef.current;
      if (mod && key === 's' && (e.shiftKey ? onSaveAs : onSave)) {
        e.preventDefault();
        if (e.shiftKey) onSaveAs?.();
        else onSave?.();
        return;
      }
      if (mod && !e.shiftKey && key === 'o' && onOpen) {
        e.preventDefault();
        onOpen();
        return;
      }
      if (ownsKeys(e.target)) return;
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.ctrlKey && !e.metaKey && key === 'y') {
        e.preventDefault();
        redo();
      } else if (!mod && !e.shiftKey && key === 'f') {
        useUiStore.getState().requestFit(false);
      } else if (!mod && !e.shiftKey && key === 'x') {
        useUiStore.getState().toggleSection();
      } else if (!mod && !e.shiftKey && key === 'b') {
        useUiStore.getState().toggleViewMode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
