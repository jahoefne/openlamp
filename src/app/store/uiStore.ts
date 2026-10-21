/**
 * View state: what is selected, how the lamp is shown. Not undoable, not saved.
 */
import { create } from 'zustand';
import type { Quality } from '@core/geometry/quality.ts';

export type SectionAxis = 'x' | 'y';
export type ViewMode = 'assembled' | 'bed';
export type PanelId = 'inspector' | 'status';

export interface FitRequest {
  /** 0 = never requested. */
  id: number;
  /** Wait until the build that is about to start has finished (new project), or fit now ("F"). */
  afterBuild: boolean;
}

export interface UiState {
  /** Selected part id. */
  selection: string | null;
  /** Part id under the pointer (M2: LampTree hover highlight). */
  hover: string | null;
  /** Exploded view factor 0..1 (M2). */
  explode: number;
  /** Cut the model in half. */
  section: boolean;
  /** The section plane is normal to this axis. */
  sectionAxis: SectionAxis;
  /** Show the LED puck and strap as translucent ghosts. */
  ghosts: boolean;
  /** Show the lamp mounted on the ceiling instead of on the print bed. */
  mounted: boolean;
  /** Assembled lamp, or the parts laid out on the bed (M2). */
  viewMode: ViewMode;
  /** Overrides the project's preview quality while set (draft during a slider drag). */
  previewQuality: Quality | null;
  panels: Record<PanelId, boolean>;
  /** Ask the camera rig to frame the lamp. */
  fitRequest: FitRequest;

  select(id: string | null): void;
  setHover(id: string | null): void;
  setExplode(factor: number): void;
  setSection(on: boolean): void;
  toggleSection(): void;
  setSectionAxis(axis: SectionAxis): void;
  setGhosts(on: boolean): void;
  setMounted(on: boolean): void;
  setViewMode(mode: ViewMode): void;
  setPreviewQuality(quality: Quality | null): void;
  setPanel(panel: PanelId, open: boolean): void;
  requestFit(afterBuild: boolean): void;
}

export const useUiStore = create<UiState>()((set) => ({
  selection: null,
  hover: null,
  explode: 0,
  section: false,
  sectionAxis: 'y',
  ghosts: true,
  mounted: false,
  viewMode: 'assembled',
  previewQuality: null,
  panels: { inspector: true, status: true },
  fitRequest: { id: 0, afterBuild: false },

  select: (selection) => set({ selection }),
  setHover: (hover) => set({ hover }),
  setExplode: (explode) => set({ explode: Math.min(1, Math.max(0, explode)) }),
  setSection: (section) => set({ section }),
  toggleSection: () => set((s) => ({ section: !s.section })),
  setSectionAxis: (sectionAxis) => set({ sectionAxis }),
  setGhosts: (ghosts) => set({ ghosts }),
  setMounted: (mounted) => set({ mounted }),
  setViewMode: (viewMode) => set({ viewMode }),
  setPreviewQuality: (previewQuality) => set({ previewQuality }),
  setPanel: (panel, open) => set((s) => ({ panels: { ...s.panels, [panel]: open } })),
  requestFit: (afterBuild) => set((s) => ({ fitRequest: { id: s.fitRequest.id + 1, afterBuild } })),
}));
