/**
 * Which of the app's three layouts the window is in (the same breakpoints as
 * App.module.css):
 * - `wide` (≥ 1100 px): lamp tree | viewport | inspector;
 * - `medium` (760 … 1099 px): the tree is a rail of icons until expanded,
 *   the inspector a sheet over the viewport;
 * - `narrow` (< 760 px): everything stacks, the viewport at 50 vh.
 */
import { useSyncExternalStore } from 'react';

export type LayoutKind = 'wide' | 'medium' | 'narrow';

const MEDIUM = '(max-width: 1099.98px)';
const NARROW = '(max-width: 759.98px)';

function subscribe(onChange: () => void): () => void {
  const queries = [MEDIUM, NARROW].map((q) => window.matchMedia(q));
  for (const q of queries) q.addEventListener('change', onChange);
  return () => {
    for (const q of queries) q.removeEventListener('change', onChange);
  };
}

function snapshot(): LayoutKind {
  if (window.matchMedia(NARROW).matches) return 'narrow';
  return window.matchMedia(MEDIUM).matches ? 'medium' : 'wide';
}

export function useLayout(): LayoutKind {
  return useSyncExternalStore(subscribe, snapshot, () => 'wide');
}
