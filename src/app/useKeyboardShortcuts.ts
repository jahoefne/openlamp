/**
 * App-wide keys: ⌘/Ctrl+Z undo, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redo, F frames
 * the lamp, X toggles the section view. Text fields keep their own undo and
 * typing, open menus and select lists their typeahead.
 */
import { useEffect } from 'react';
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

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || ownsKeys(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
