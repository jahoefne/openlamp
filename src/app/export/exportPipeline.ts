/**
 * Exports: assemble the project at its export quality, have the worker write
 * the files (unchanged parts come from its cache) and download them.
 */
import { assemble } from '@core/assembly/assemble.ts';
import type { ExportFormat } from '../../worker/protocol.ts';
import { useBuildStore } from '../store/buildStore.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { getWorkerClient } from '../worker/useBuildPipeline.ts';
import { downloadFile } from './download.ts';

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
    const files = await client.export(
      {
        format,
        parts: assembly.parts,
        layout: assembly.layout,
        printer: project.printer,
        meta: { name: project.name, id: project.id },
      },
      { onProgress: (progress) => useBuildStore.getState().setExportProgress(progress) },
    );
    for (const file of files) downloadFile(file);
    useBuildStore.getState().exportFinished(null);
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : String(err);
    useBuildStore.getState().exportFinished(message);
  }
}
