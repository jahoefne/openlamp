/**
 * Project files (`<name>.lamp.json`): save with the File System Access API
 * where the browser has it (Chromium), else as a download; open from the
 * hidden file input or by dropping a file anywhere on the app.
 */
import { useEffect, useState } from 'react';
import { slugify } from '@core/export/naming.ts';
import { parseProject, serializeProject, type Project } from '@core/model/project.ts';
import { downloadFile } from '../export/download.ts';

export const PROJECT_FILE_SUFFIX = '.lamp.json';
/** What the file input accepts. */
export const PROJECT_FILE_ACCEPT = '.json,.lamp.json';

// The File System Access API is not in TypeScript's DOM library yet.
interface WritableFileStream {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface SaveFileHandle {
  readonly name: string;
  createWritable(): Promise<WritableFileStream>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

type ShowSaveFilePicker = (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;

function savePicker(): ShowSaveFilePicker | null {
  const picker = (window as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  return typeof picker === 'function' ? picker.bind(window) : null;
}

/** `<project-slug>.lamp.json` (the id when the name has no letters or digits). */
export function projectFileName(project: Pick<Project, 'name' | 'id'>): string {
  const slug = slugify(project.name) || slugify(project.id) || 'lamp';
  return slug + PROJECT_FILE_SUFFIX;
}

/** The file the last picker save wrote, for the project it wrote. */
let lastHandle: { projectId: string; handle: SaveFileHandle } | null = null;

/** Forget the remembered file (another project was opened). */
export function forgetSaveHandle(): void {
  lastHandle = null;
}

export interface SaveOptions {
  /** Always ask where to save, even if this project was saved to a file before. */
  as?: boolean;
}

export interface SaveResult {
  /** The file name written (or offered as a download). */
  fileName: string;
  method: 'picker' | 'download';
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/**
 * Save the project. With the File System Access API: a plain save writes to
 * the file this project was last saved to, "save as" (or the first save) asks
 * with the save picker. Without it (or when the picker fails): a download.
 * Resolves to null when the user cancels the picker.
 */
export async function saveProject(
  project: Project,
  { as = false }: SaveOptions = {},
): Promise<SaveResult | null> {
  const text = serializeProject(project);
  const fileName = projectFileName(project);
  const picker = savePicker();
  if (picker) {
    try {
      const known = !as && lastHandle?.projectId === project.id ? lastHandle.handle : null;
      const handle =
        known ??
        (await picker({
          suggestedName: fileName,
          types: [{ description: 'openlamp project', accept: { 'application/json': ['.json'] } }],
        }));
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      lastHandle = { projectId: project.id, handle };
      return { fileName: handle.name, method: 'picker' };
    } catch (e) {
      if (isAbort(e)) return null;
      // Not allowed here (e.g. an embedded frame) or the write failed: download instead.
      console.warn('openlamp: save picker failed, downloading instead', e);
    }
  }
  downloadFile({ name: fileName, data: text, mime: 'application/json' });
  return { fileName, method: 'download' };
}

/** Read and validate a project file. Rejects with a readable message. */
export async function openProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  try {
    return parseProject(text);
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`${file.name} is not a JSON file`, { cause: e });
    throw new Error(`${file.name} is not an openlamp project`, { cause: e });
  }
}

/** The first file that looks like a project file (`*.json`). */
export function pickProjectFile(files: Iterable<File>): File | null {
  for (const f of files) if (f.name.toLowerCase().endsWith('.json')) return f;
  return null;
}

function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes('Files');
}

/**
 * Make the whole window a drop zone for project files: the first `.json`
 * file dropped goes to `onFile`, anything else to `onReject`. Returns whether
 * files are being dragged over the window (for an overlay).
 */
export function useProjectDropZone(
  onFile: (file: File) => void,
  onReject: (message: string) => void,
): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth += 1;
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault(); // allow the drop (and stop the browser opening the file)
      e.dataTransfer!.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      const file = pickProjectFile(files);
      if (file) onFile(file);
      else onReject('Drop a .lamp.json project file to open it');
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [onFile, onReject]);
  return dragging;
}
