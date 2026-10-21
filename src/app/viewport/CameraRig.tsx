/**
 * Orbit controls plus drei <Bounds> around the parts. The camera is refitted
 * only on request, never on a parameter edit:
 * - when a whole project is loaded (`projectStore.loads`: example, reset, and
 *   from M1.5 on file open and share links), once the build that follows has
 *   finished, so it frames the new geometry;
 * - right away on `uiStore.requestFit(false)` (the "F" key).
 */
import { Bounds, OrbitControls, useBounds } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import { useBuildStore } from '../store/buildStore.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { useUiStore } from '../store/uiStore.ts';

const TARGET: [number, number, number] = [0, 0, 80];

function FitOnRequest() {
  const bounds = useBounds();
  const invalidate = useThree((s) => s.invalidate);
  const request = useUiStore((s) => s.fitRequest);
  const loads = useProjectStore((s) => s.loads);
  const generation = useBuildStore((s) => s.generation);
  const doneGeneration = useBuildStore((s) => s.doneGeneration);
  /** Fit once a build newer than this generation is done, or null. */
  const pendingAfter = useRef<number | null>(null);

  useEffect(() => {
    if (request.id === 0) return;
    if (request.afterBuild) {
      pendingAfter.current = useBuildStore.getState().generation;
    } else {
      pendingAfter.current = null;
      bounds.refresh().fit();
      invalidate();
    }
  }, [request, bounds, invalidate]);

  useEffect(() => {
    if (loads > 0) pendingAfter.current = useBuildStore.getState().generation;
  }, [loads]);

  useEffect(() => {
    const after = pendingAfter.current;
    if (after === null || doneGeneration <= after || doneGeneration !== generation) return;
    pendingAfter.current = null;
    bounds.refresh().fit();
    invalidate();
  }, [generation, doneGeneration, bounds, invalidate]);

  return null;
}

export function CameraRig({ children }: { children: ReactNode }) {
  return (
    <>
      <OrbitControls makeDefault target={TARGET} enableDamping />
      <Bounds margin={1.2}>
        {children}
        <FitOnRequest />
      </Bounds>
    </>
  );
}
