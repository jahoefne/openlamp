/**
 * Exports: assemble the project at its export quality, have the worker write
 * the files (unchanged parts come from its cache) and download them. The ZIP
 * export also carries the print sheet, rendered here because the build stats
 * (grams, triangles) live on the main thread.
 */
import { assemble } from '@core/assembly/assemble.ts';
import { exportStem } from '@core/export/naming.ts';
import { PRINT_SHEET_FILE, renderPrintSheet, type SheetStats } from '@core/export/printSheet.ts';
import type { Quality } from '@core/geometry/quality.ts';
import type { Assembly } from '@core/model/assembly.ts';
import type { Project } from '@core/model/project.ts';
import type { ExportFormat, ExportMeta } from '../../worker/protocol.ts';
import { shareUrl } from '../persistence/urlState.ts';
import { useBuildStore, type PartBuild } from '../store/buildStore.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { previewQualityOf } from '../store/selectors.ts';
import { useUiStore } from '../store/uiStore.ts';
import { getWorkerClient } from '../worker/useBuildPipeline.ts';
import { downloadFile } from './download.ts';

/** Today in the local time zone, `YYYY-MM-DD`. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The print sheet of the project as it exports now: the export-quality
 * assembly, the grams and triangles of the parts on screen (built at the
 * preview quality, `previewOverride` included), today's date and a share link.
 */
export function printSheetMarkdown(
  project: Project,
  builds: Readonly<Record<string, PartBuild>>,
  previewOverride: Quality | null,
  assembly: Assembly = assemble(project, { quality: project.quality.export }),
): string {
  const stats: Record<string, SheetStats> = {};
  for (const part of assembly.parts) {
    const s = builds[part.id]?.stats;
    if (s) stats[part.id] = s;
  }
  return renderPrintSheet({
    project,
    assembly,
    printer: project.printer,
    stats,
    shareUrl: shareUrl(project),
    date: today(),
    statsQuality: previewQualityOf(project, previewOverride),
  });
}

/** Download the print sheet as `openlamp-<project>-print-sheet.md`. */
export function downloadPrintSheet(project: Pick<Project, 'name' | 'id'>, markdown: string): void {
  downloadFile({
    name: `${exportStem(project)}-print-sheet.md`,
    data: markdown,
    mime: 'text/markdown',
  });
}

/** Export the current project in `format` and download the result. Never throws. */
export async function exportProject(format: ExportFormat): Promise<void> {
  const build = useBuildStore.getState();
  if (build.exporting) return;
  build.exportStarted();
  try {
    const client = getWorkerClient();
    if (!client) throw new Error('The geometry engine is not running');
    const { project } = useProjectStore.getState();
    const assembly = assemble(project, { quality: project.quality.export });
    const meta: ExportMeta = { name: project.name, id: project.id };
    if (format === 'zip-stl') {
      const override = useUiStore.getState().previewQuality;
      const sheet = printSheetMarkdown(project, build.parts, override, assembly);
      meta.extraFiles = [{ name: PRINT_SHEET_FILE, text: sheet }];
    }
    const files = await client.export(
      {
        format,
        parts: assembly.parts,
        layout: assembly.layout,
        printer: project.printer,
        meta,
      },
      { onProgress: (progress) => useBuildStore.getState().setExportProgress(progress) },
    );
    for (const file of files) downloadFile(file);
    useBuildStore.getState().exportFinished(null);
    const zip = format === 'zip-stl' ? files[0] : undefined;
    if (zip) {
      const n = assembly.parts.length;
      useUiStore
        .getState()
        .notify(
          `Downloaded ${zip.name}: ${n} STL ${n === 1 ? 'file' : 'files'} and the print sheet`,
        );
    }
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : String(err);
    useBuildStore.getState().exportFinished(message);
  }
}
