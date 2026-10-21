/**
 * The build pipeline: project → assembly → worker → meshes.
 *
 * Watches the project and the preview quality (draft while a slider is being
 * dragged, the project's preview quality otherwise: a two-stage build),
 * debounces 120 ms, assembles, and sends only the parts whose displayed
 * geometry has another hash to the worker. Every run is a new build
 * generation, even an empty one, so results of older generations are dropped
 * and `doneGeneration` tells the camera rig when the scene has settled.
 */
import { useEffect } from 'react';
import * as THREE from 'three';
import { useBuildStore } from '../store/buildStore.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { getAssembly, previewQualityOf } from '../store/selectors.ts';
import { useUiStore } from '../store/uiStore.ts';
import type { PartSpec } from '@core/model/assembly.ts';
import { geometryRegistry } from './geometryRegistry.ts';
import { diffParts } from './pipelineDiff.ts';
import { createWorkerClient, type PartMessage, type WorkerClient } from './workerClient.ts';

export const BUILD_DEBOUNCE_MS = 120;

/** Build generations of the store, monotonic across pipeline restarts (StrictMode, HMR). */
let runCounter = 0;
let activeClient: WorkerClient | null = null;

/** The running pipeline's worker client (for exports), or null before it starts. */
export function getWorkerClient(): WorkerClient | null {
  return activeClient;
}

function currentAssembly() {
  const { project } = useProjectStore.getState();
  return getAssembly(project, previewQualityOf(project, useUiStore.getState().previewQuality));
}

function toGeometry(msg: PartMessage): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(msg.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(msg.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(msg.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/** Start the pipeline; returns the function that stops it and terminates the worker. */
export function startBuildPipeline(): () => void {
  const client = createWorkerClient();
  activeClient = client;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The specs of the latest generation by part id. */
  let inFlight = new Map<string, PartSpec>();
  let run = 0;
  const store = useBuildStore.getState;
  useBuildStore.setState({ kernelReady: false, fatalError: null }); // a new worker, a new kernel

  client.ready.then(
    () => {
      if (!stopped) store().setKernelReady();
    },
    (err: unknown) => {
      if (!stopped) store().setFatalError(errorMessage(err));
    },
  );

  const offs = [
    client.onPart((msg) => {
      const spec = inFlight.get(msg.partId);
      if (stopped || !spec || spec.hash !== msg.hash) return;
      geometryRegistry.set(msg.partId, toGeometry(msg));
      store().partReady(msg, spec);
      // A newer edit is waiting for the debounce: this part is already stale again.
      if (timer !== undefined) store().markStale(currentAssembly().parts);
    }),
    client.onPartError((msg) => {
      if (!stopped) store().partError(msg.partId, msg.message);
    }),
    client.onBuildDone((msg) => {
      if (!stopped) store().buildDone(run, msg.totalMs);
    }),
    client.onError((err) => {
      if (!stopped) store().setFatalError(err.message);
    }),
  ];

  const dispatch = (): void => {
    timer = undefined;
    const assembly = currentAssembly();
    const diff = diffParts(assembly.parts, store().parts);
    for (const id of diff.removed) geometryRegistry.dispose(id);
    inFlight = new Map(diff.build.map((p) => [p.id, p]));
    run = ++runCounter;
    store().dispatch(run, assembly, diff);
    client.build(diff.build);
  };

  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(dispatch, BUILD_DEBOUNCE_MS);
    store().markStale(currentAssembly().parts);
  };

  const unsubscribe = [
    useProjectStore.subscribe((s, prev) => {
      if (s.project !== prev.project) schedule();
    }),
    useUiStore.subscribe((s, prev) => {
      if (s.previewQuality !== prev.previewQuality) schedule();
    }),
  ];

  dispatch(); // the first build starts right away (it waits for the kernel in the worker)

  return () => {
    stopped = true;
    clearTimeout(timer);
    for (const off of [...unsubscribe, ...offs]) off();
    client.dispose();
    if (activeClient === client) activeClient = null;
  };
}

/** Run the build pipeline while the calling component is mounted. */
export function useBuildPipeline(): void {
  useEffect(() => startBuildPipeline(), []);
}
