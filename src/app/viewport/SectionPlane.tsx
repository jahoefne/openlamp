/**
 * Keeps the shared section plane (sectionPlane.ts) in step with the view
 * options and redraws when it moves.
 */
import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { useUiStore } from '../store/uiStore.ts';
import { applySection } from './sectionPlane.ts';

export function SectionPlane() {
  const on = useUiStore((s) => s.section);
  const axis = useUiStore((s) => s.sectionAxis);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    applySection(on, axis);
    invalidate();
  }, [on, axis, invalidate]);
  return null;
}
