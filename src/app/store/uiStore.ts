/**
 * View state: what is selected, how the lamp is shown. Starts on shade editing;
 * not undoable or saved.
 */
import { create } from 'zustand';
import type { Quality } from '@core/geometry/quality.ts';
import type { PartSpec } from '@core/model/assembly.ts';
import { ROOT_NODE, nodeOfPart, type NodeId } from './nodes.ts';

export type SectionAxis = 'x' | 'y';
export type ViewMode = 'assembled' | 'bed';
/**
 * `tree`: the lamp tree expanded (below 1100 px it is a rail of icons until
 * expanded); `inspector`: the inspector sheet open (below 1100 px).
 */
export type PanelId = 'tree' | 'inspector';

export interface FitRequest {
  /** 0 = never requested. */
  id: number;
  /** Wait until the build that is about to start has finished (new project), or fit now ("F"). */
  afterBuild: boolean;
}

/** A short message in the status line ("Link copied"), cleared after a few seconds. */
export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

/** How long a notice stays, by tone. */
export const NOTICE_MS: Readonly<Record<Notice['tone'], number>> = { info: 2000, error: 6000 };

/**
 * Whether the light-on view should start with the simple materials (opacity
 * and emissive instead of transmission, which renders the scene twice per
 * frame): on machines with 4 or fewer logical cores, as a proxy for a weak GPU.
 */
export function prefersSimpleLight(): boolean {
  const cores = typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;
  return typeof cores === 'number' && cores > 0 && cores <= 4;
}

export interface UiState {
  /** The lamp-tree node whose inspector is shown (`project` when nothing is picked). */
  selection: NodeId;
  /**
   * The part picked in the viewport, the tree or the status table (outlined,
   * its details in the status panel), or null; it belongs to `selection`.
   */
  selectedPart: string | null;
  /** Part id under the pointer. */
  hover: string | null;
  /** Exploded view factor 0..1: parts move apart along z by up to 60 mm per rank. */
  explode: number;
  /** Cut the model in half. */
  section: boolean;
  /** The section plane is normal to this axis. */
  sectionAxis: SectionAxis;
  /** Show the LED puck and strap as translucent ghosts. */
  ghosts: boolean;
  /**
   * Light-on view: the light source glows with a warm point light, the shades
   * let it through (the inner shade reflects it when light), the room is dim.
   */
  lightOn: boolean;
  /** Light-on with the cheap materials (opacity + emissive, no transmission); see `prefersSimpleLight`. */
  simpleLight: boolean;
  /** Show the lamp mounted on the ceiling instead of on the print bed. */
  mounted: boolean;
  /** Assembled lamp, or the parts laid out on the print bed as exported. */
  viewMode: ViewMode;
  /** Overrides the project's preview quality while set (draft during a slider drag). */
  previewQuality: Quality | null;
  /** Panel visibility; `null` = the layout's default (a compact component rail). */
  panels: Record<PanelId, boolean | null>;
  /** Ask the camera rig to frame the lamp. */
  fitRequest: FitRequest;
  notice: Notice | null;

  /**
   * Show a node's inspector; `part` is the part picked with it (the tree
   * passes a node's own part, e.g. the hub for Hub & joints), none if omitted.
   */
  select(node: NodeId, part?: string | null): void;
  /** Pick a part (viewport, status table): its node's inspector and its outline. */
  selectPart(part: Pick<PartSpec, 'id' | 'kind'>): void;
  /** Back to the project node, nothing picked (a click on empty space). */
  clearSelection(): void;
  setHover(id: string | null): void;
  setExplode(factor: number): void;
  setSection(on: boolean): void;
  toggleSection(): void;
  setSectionAxis(axis: SectionAxis): void;
  setGhosts(on: boolean): void;
  setLightOn(on: boolean): void;
  toggleLightOn(): void;
  setSimpleLight(on: boolean): void;
  setMounted(on: boolean): void;
  setViewMode(mode: ViewMode): void;
  toggleViewMode(): void;
  setPreviewQuality(quality: Quality | null): void;
  setPanel(panel: PanelId, open: boolean | null): void;
  requestFit(afterBuild: boolean): void;
  /** Show a notice in the status line for `NOTICE_MS[tone]`. */
  notify(text: string, tone?: Notice['tone']): void;
  dismissNotice(): void;
}

let noticeSeq = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  selection: 'outerShade',
  selectedPart: null,
  hover: null,
  explode: 0,
  section: false,
  sectionAxis: 'y',
  ghosts: true,
  lightOn: false,
  simpleLight: prefersSimpleLight(),
  mounted: false,
  viewMode: 'assembled',
  previewQuality: null,
  panels: { tree: null, inspector: false },
  fitRequest: { id: 0, afterBuild: false },
  notice: null,

  select: (selection, part) => set({ selection, selectedPart: part ?? null }),
  selectPart: (part) => set({ selection: nodeOfPart(part), selectedPart: part.id }),
  clearSelection: () => set({ selection: ROOT_NODE, selectedPart: null }),
  setHover: (hover) => set({ hover }),
  setExplode: (explode) => set({ explode: Math.min(1, Math.max(0, explode)) }),
  setSection: (section) => set({ section }),
  toggleSection: () => set((s) => ({ section: !s.section })),
  setSectionAxis: (sectionAxis) => set({ sectionAxis }),
  setGhosts: (ghosts) => set({ ghosts }),
  setLightOn: (lightOn) => set({ lightOn }),
  toggleLightOn: () => set((s) => ({ lightOn: !s.lightOn })),
  setSimpleLight: (simpleLight) => set({ simpleLight }),
  setMounted: (mounted) => set({ mounted }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === 'bed' ? 'assembled' : 'bed' })),
  setPreviewQuality: (previewQuality) => set({ previewQuality }),
  setPanel: (panel, open) => set((s) => ({ panels: { ...s.panels, [panel]: open } })),
  requestFit: (afterBuild) => set((s) => ({ fitRequest: { id: s.fitRequest.id + 1, afterBuild } })),
  notify: (text, tone = 'info') => {
    const id = ++noticeSeq;
    set({ notice: { id, text, tone } });
    setTimeout(() => {
      if (get().notice?.id === id) set({ notice: null });
    }, NOTICE_MS[tone]);
  },
  dismissNotice: () => set({ notice: null }),
}));
