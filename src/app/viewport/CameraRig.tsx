/**
 * Orbit controls plus drei <Bounds> around the parts. The camera is refitted
 * only on request, never on a parameter edit:
 * - when a whole project is loaded (`projectStore.loads`: example, reset,
 *   file open and share links), once the build that follows has finished, so
 *   it frames the new geometry, from the room side of what the lamp is
 *   mounted on (`CONTEXT_VIEWS`);
 * - once the build after `uiStore.requestFit(true)` (mount switch, fused
 *   toggle) has finished: from the room side if the mount context changed
 *   (ceiling, wall, floor), along the current view direction otherwise;
 * - when the context of the lamp on screen changes without a request (undo
 *   or redo of a mount switch): from the room side;
 * - right away on `uiStore.requestFit(false)` (the "F" key), along the
 *   current view direction.
 */
import { Bounds, OrbitControls, useBounds } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Vector3 } from 'three';
import type { MountContext } from '@core/model/assembly.ts';
import { useBuildStore } from '../store/buildStore.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { useUiStore } from '../store/uiStore.ts';

const TARGET: [number, number, number] = [0, 0, 80];
const UP: [number, number, number] = [0, 0, 1];

type ContextKind = MountContext['kind'];

interface ContextView {
  /** From the lamp's centre toward the camera (any length). */
  direction: [x: number, y: number, z: number];
  /** Times the distance at which <Bounds> fits the lamp. */
  distance: number;
}

/**
 * Where the camera looks from, by what the lamp is mounted on:
 * - ceiling: the initial view (from the front right, a little above);
 * - wall: the lamp stands out from the wall toward +y (`wallY` < 0), so from
 *   the room in front of it, looking toward −y;
 * - floor: lower and farther, the whole lamp from the base to the shade.
 */
const CONTEXT_VIEWS: Readonly<Record<ContextKind, ContextView>> = {
  ceiling: { direction: [260, -300, 140], distance: 1 },
  wall: { direction: [260, 300, 140], distance: 1 },
  floor: { direction: [300, -340, 90], distance: 1.15 },
};

interface PendingFit {
  /** Fit once a build newer than this generation is done. */
  after: number;
  /** Take the context's view even if the context did not change (a loaded project). */
  view: boolean;
}

function FitOnRequest() {
  const bounds = useBounds();
  const invalidate = useThree((s) => s.invalidate);
  const request = useUiStore((s) => s.fitRequest);
  const loads = useProjectStore((s) => s.loads);
  const generation = useBuildStore((s) => s.generation);
  const doneGeneration = useBuildStore((s) => s.doneGeneration);
  const contextKind = useBuildStore((s) => s.shownContext?.kind ?? null);
  const pending = useRef<PendingFit | null>(null);
  /** The request last handled (an effect may re-run for the same one). */
  const handled = useRef(0);
  /** The context the camera's view was last chosen for. */
  const viewFor = useRef<ContextKind | null>(null);

  /** Frame the lamp from the room side of `kind`, or along the current view direction. */
  const fit = useCallback(
    (kind: ContextKind | null) => {
      bounds.refresh();
      if (kind) {
        const { center, distance } = bounds.getSize();
        const view = CONTEXT_VIEWS[kind];
        const direction = new Vector3(...view.direction).normalize();
        bounds
          .moveTo(center.clone().addScaledVector(direction, distance * view.distance))
          .lookAt({ target: center, up: UP });
        viewFor.current = kind;
      } else {
        bounds.fit();
      }
      invalidate();
    },
    [bounds, invalidate],
  );

  useEffect(() => {
    if (request.id === 0 || request.id === handled.current) return;
    handled.current = request.id;
    if (request.afterBuild) {
      pending.current = {
        after: useBuildStore.getState().generation,
        view: pending.current?.view ?? false,
      };
    } else {
      pending.current = null;
      fit(null);
    }
  }, [request, fit]);

  useEffect(() => {
    if (loads > 0) pending.current = { after: useBuildStore.getState().generation, view: true };
  }, [loads]);

  useEffect(() => {
    if (doneGeneration !== generation) return; // a newer build is on its way
    const p = pending.current;
    if (p) {
      if (doneGeneration <= p.after) return;
      pending.current = null;
      fit(p.view || contextKind !== viewFor.current ? contextKind : null);
    } else if (contextKind !== null && contextKind !== viewFor.current) {
      fit(contextKind);
    }
  }, [generation, doneGeneration, contextKind, fit]);

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
