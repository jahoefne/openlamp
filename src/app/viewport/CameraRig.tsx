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
 *   current view direction;
 * - right away when the view mode changes (assembled ↔ bed): the bed view
 *   from the front, above the bed; back to the assembled lamp from the room
 *   side. In the bed view every fit takes the bed's view.
 *
 * The camera glides to a new view over a second, or jumps there when the
 * system asks for reduced motion (`prefers-reduced-motion`; the e2e tests do,
 * which saves the software renderer a second of frames per fit).
 */
import { Bounds, OrbitControls, useBounds } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Vector3 } from 'three';
import type { MountContext } from '@core/model/assembly.ts';
import { useBuildStore } from '../store/buildStore.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { useUiStore } from '../store/uiStore.ts';

const TARGET: [number, number, number] = [0, 0, 80];
const UP: [number, number, number] = [0, 0, 1];

type ContextKind = MountContext['kind'];
/** The views the camera frames from: one per mount context, and the bed view's. */
type ViewKind = ContextKind | 'bed';

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
 * - floor: lower and farther, the whole lamp from the base to the shade;
 * - bed: the printer's bed from the front, well above it.
 */
const CONTEXT_VIEWS: Readonly<Record<ViewKind, ContextView>> = {
  ceiling: { direction: [260, -300, 140], distance: 1 },
  wall: { direction: [260, 300, 140], distance: 1 },
  floor: { direction: [300, -340, 90], distance: 1.15 },
  bed: { direction: [0, -190, 400], distance: 1.1 },
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
  const bedView = useUiStore((s) => s.viewMode === 'bed');
  const pending = useRef<PendingFit | null>(null);
  /** The request last handled (an effect may re-run for the same one). */
  const handled = useRef(0);
  /** The context the camera's view was last chosen for. */
  const viewFor = useRef<ContextKind | null>(null);
  /** The view mode the camera was last fitted for. */
  const modeFor = useRef(bedView);
  /** Projects loaded before the canvas mounted (the startup project). */
  const loadsAtMount = useRef(loads);

  /**
   * Frame the scene from the room side of `kind` (the bed's side in the bed
   * view), or along the current view direction.
   */
  const fit = useCallback(
    (kind: ContextKind | null) => {
      bounds.refresh();
      const viewKind: ViewKind | null = bedView ? 'bed' : kind;
      if (viewKind) {
        const { center, distance } = bounds.getSize();
        const view = CONTEXT_VIEWS[viewKind];
        const direction = new Vector3(...view.direction).normalize();
        bounds
          .moveTo(center.clone().addScaledVector(direction, distance * view.distance))
          .lookAt({ target: center, up: UP });
        if (kind) viewFor.current = kind;
      } else {
        bounds.fit();
      }
      invalidate();
    },
    [bounds, invalidate, bedView],
  );

  // Switching between the assembled lamp and the bed: frame the new scene now
  // (nothing is rebuilt; the meshes already moved in this commit).
  useEffect(() => {
    if (modeFor.current === bedView) return;
    modeFor.current = bedView;
    fit(contextKind ?? 'ceiling');
  }, [bedView, contextKind, fit]);

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
    if (loads === 0) return;
    const { generation: dispatched, doneGeneration: done } = useBuildStore.getState();
    if (loads === loadsAtMount.current) {
      // The startup project (share link, autosave): its first build may already
      // be on its way, or even done, by the time the canvas mounts.
      pending.current = { after: done === dispatched && done > 0 ? done - 1 : done, view: true };
    } else {
      // A project loaded later: fit after the build its change is about to start.
      pending.current = { after: dispatched, view: true };
    }
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

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** The system asks for less motion: the camera jumps to a new view instead of gliding there. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/** How long the camera glides to a new view, s (next to nothing with reduced motion). */
const GLIDE_S = 1;
const JUMP_S = 1e-6;

export function CameraRig({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <>
      <OrbitControls makeDefault target={TARGET} enableDamping={!reducedMotion} />
      <Bounds margin={1.45} maxDuration={reducedMotion ? JUMP_S : GLIDE_S}>
        {children}
        <FitOnRequest />
      </Bounds>
    </>
  );
}
