/**
 * The project bar's file actions (open, save, save as, share, recent
 * projects), wired to the stores. Results and failures show as notices in the
 * status line.
 */
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type RefObject } from 'react';
import { useProjectStore } from '../store/projectStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { RECENTS_KEY, getAutosave, type RecentProject } from './autosave.ts';
import { forgetSaveHandle, openProjectFile, saveProject } from './fileIO.ts';
import { isUrlTooLong, shareUrl, writeHash } from './urlState.ts';

const notify = (text: string, tone?: 'info' | 'error') => useUiStore.getState().notify(text, tone);

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The recent projects, kept current (this tab's autosaves and other tabs' via `storage`). */
export function useRecents(): readonly RecentProject[] {
  const autosave = getAutosave();
  const [recents, setRecents] = useState(() => autosave.listRecents());
  useEffect(() => {
    const refresh = () => setRecents(autosave.listRecents());
    const unsubscribe = autosave.subscribe(refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === RECENTS_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, [autosave]);
  return recents;
}

export interface ProjectFiles {
  /** The hidden `<input type="file">`'s change handler. */
  onFileInputChange(e: ChangeEvent<HTMLInputElement>): void;
  /** Ask for a file to open (clicks the hidden input). */
  open(): void;
  /** Open a project file (file input, drop zone). */
  openFile(file: File): void;
  save(): void;
  saveAs(): void;
  share(): void;
  recents: readonly RecentProject[];
  openRecent(id: string): void;
  clearRecents(): void;
}

/** `fileInput` is the hidden `<input type="file">` that `open()` clicks. */
export function useProjectFiles(fileInput: RefObject<HTMLInputElement | null>): ProjectFiles {
  const recents = useRecents();

  const openFile = useCallback((file: File) => {
    openProjectFile(file).then(
      (project) => {
        forgetSaveHandle();
        useProjectStore.getState().replaceProject(project); // keeps the file's id
        notify(`Opened ${project.name || file.name}`);
      },
      (e: unknown) => notify(`Could not open the file: ${message(e)}`, 'error'),
    );
  }, []);

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const file = input.files?.[0];
      input.value = ''; // choosing the same file again fires `change` again
      if (file) openFile(file);
    },
    [openFile],
  );

  const open = useCallback(() => fileInput.current?.click(), [fileInput]);

  const saveWith = useCallback((as: boolean) => {
    const { project, markSaved } = useProjectStore.getState();
    saveProject(project, { as }).then(
      (result) => {
        if (!result) return; // picker cancelled
        markSaved(project.revision);
        notify(`Saved ${result.fileName}`);
      },
      (e: unknown) => notify(`Could not save: ${message(e)}`, 'error'),
    );
  }, []);
  const save = useCallback(() => saveWith(false), [saveWith]);
  const saveAs = useCallback(() => saveWith(true), [saveWith]);

  const share = useCallback(() => {
    const { project } = useProjectStore.getState();
    const url = shareUrl(project);
    writeHash(project);
    const long = isUrlTooLong(url) ? ` (long link: ${url.length} characters)` : '';
    const fallback = () => {
      window.prompt('Copy this link to share the lamp:', url);
    };
    if (!navigator.clipboard?.writeText) {
      fallback();
      return;
    }
    navigator.clipboard.writeText(url).then(() => notify(`Link copied${long}`), fallback);
  }, []);

  const openRecent = useCallback((id: string) => {
    const autosave = getAutosave();
    if (useProjectStore.getState().project.id === id) return; // already open
    autosave.flush(); // the current project's last edits
    const project = autosave.readAutosave(id);
    if (!project) {
      autosave.removeRecent(id);
      notify('That recent project could not be read and was removed', 'error');
      return;
    }
    forgetSaveHandle();
    useProjectStore.getState().replaceProject(project);
  }, []);

  const clearRecents = useCallback(() => {
    // The open project keeps its autosave: it is still being worked on.
    getAutosave().clearRecents(useProjectStore.getState().project.id);
  }, []);

  return useMemo(
    () => ({
      onFileInputChange,
      open,
      openFile,
      save,
      saveAs,
      share,
      recents,
      openRecent,
      clearRecents,
    }),
    [onFileInputChange, open, openFile, save, saveAs, share, recents, openRecent, clearRecents],
  );
}
