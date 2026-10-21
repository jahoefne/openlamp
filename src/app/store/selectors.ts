/**
 * Derived state shared by the panels, the viewport, the build pipeline and the
 * export: one memoised assembly, so they all see the same `PartSpec[]`.
 */
import { useMemo } from 'react';
import { assemble } from '@core/assembly/assemble.ts';
import type { Quality } from '@core/geometry/quality.ts';
import type { Assembly, PartSpec, Warning } from '@core/model/assembly.ts';
import type { Project } from '@core/model/project.ts';
import type { PrinterSpec } from '@core/schema/printers.ts';
import { useBuildStore } from './buildStore.ts';
import { shownNode, type NodeId } from './nodes.ts';
import { useProjectStore } from './projectStore.ts';
import { useUiStore } from './uiStore.ts';

/** The quality the viewport builds at: the drag override, else the project's preview quality. */
export function previewQualityOf(project: Project, override: Quality | null): Quality {
  return override ?? project.quality.preview;
}

let memo: { project: Project; revision: number; quality: Quality; assembly: Assembly } | null =
  null;

/**
 * `assemble(project, { quality })`, memoised on the project (every edit makes a
 * new project object with a new revision) and the quality. Pure; safe to call
 * from render.
 */
export function getAssembly(project: Project, quality: Quality): Assembly {
  if (
    memo &&
    memo.project === project &&
    memo.revision === project.revision &&
    memo.quality === quality
  ) {
    return memo.assembly;
  }
  const assembly = assemble(project, { quality });
  memo = { project, revision: project.revision, quality, assembly };
  return assembly;
}

/** The assembly at the current preview quality. */
export function useAssembly(): Assembly {
  const project = useProjectStore((s) => s.project);
  const override = useUiStore((s) => s.previewQuality);
  return getAssembly(project, previewQualityOf(project, override));
}

/** The picked part of the current assembly (`uiStore.selectedPart`), or null. */
export function useSelectedPart(): PartSpec | null {
  const { parts } = useAssembly();
  const selected = useUiStore((s) => s.selectedPart);
  return parts.find((p) => p.id === selected) ?? null;
}

/** The lamp-tree node the inspector shows (the inner shade's falls back to the outer one's). */
export function useShownNode(): NodeId {
  const selection = useUiStore((s) => s.selection);
  const inner = useProjectStore((s) => s.project.shades.length > 1);
  return shownNode(selection, inner);
}

export interface BedFit {
  fits: boolean;
  printer: PrinterSpec;
  /** The `bed-fit` warnings of the assembly. */
  warnings: Warning[];
  /** How far the worst part sticks out of the build volume, in mm (0 when everything fits). */
  overshoot: number;
}

/**
 * How far the worst part sticks out of the printer's build volume, in mm (0 if
 * every part fits). A part may be turned 90° about z to fit, as in `validateBedFit`.
 */
export function bedOvershoot(parts: readonly PartSpec[], printer: PrinterSpec): number {
  const [bx, by, bz] = printer.bed;
  let worst = 0;
  for (const part of parts) {
    const f = part.bedFootprint;
    if (!f) continue;
    const over = (x: number, y: number) => Math.max(x - bx, y - by, f.z - bz, 0);
    worst = Math.max(worst, Math.min(over(f.x, f.y), over(f.y, f.x)));
  }
  return worst;
}

/** Bed-fit summary of the current assembly for the status badge. */
export function useBedFit(): BedFit {
  const assembly = useAssembly();
  const printer = useProjectStore((s) => s.project.printer);
  return useMemo(() => {
    const warnings = assembly.warnings.filter((w) => w.code === 'bed-fit');
    return {
      fits: warnings.length === 0,
      printer,
      warnings,
      overshoot: bedOvershoot(assembly.parts, printer),
    };
  }, [assembly, printer]);
}

export interface Totals {
  /** Over every part instance with a displayed geometry. */
  triangles: number;
  grams: number;
  volumeMm3: number;
  /** Builder time of the displayed geometries (0 for cached ones). */
  buildMs: number;
}

export function useTotals(): Totals {
  const { parts } = useAssembly();
  const builds = useBuildStore((s) => s.parts);
  return useMemo(() => {
    const totals: Totals = { triangles: 0, grams: 0, volumeMm3: 0, buildMs: 0 };
    for (const part of parts) {
      const b = builds[part.id];
      if (!b?.stats) continue;
      totals.triangles += b.stats.triangles * part.instances;
      totals.grams += b.stats.estGramsPla * part.instances;
      totals.volumeMm3 += b.stats.volumeMm3 * part.instances;
      totals.buildMs += b.buildMs ?? 0;
    }
    return totals;
  }, [parts, builds]);
}
