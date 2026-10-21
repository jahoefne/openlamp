/**
 * The app shell: project bar on top, inspector on the left, viewport with its
 * status overlay on the right. (M2 adds the LampTree column.) The whole window
 * is a drop zone for project files.
 */
import { Tooltip } from 'radix-ui';
import { useCallback, useRef } from 'react';
import styles from './App.module.css';
import { Inspector } from './panels/Inspector.tsx';
import { ProjectBar } from './panels/ProjectBar.tsx';
import { StatusPanel } from './panels/StatusPanel.tsx';
import { PROJECT_FILE_ACCEPT, useProjectDropZone } from './persistence/fileIO.ts';
import { useProjectFiles } from './persistence/useProjectFiles.ts';
import { useUiStore } from './store/uiStore.ts';
import { useKeyboardShortcuts } from './useKeyboardShortcuts.ts';
import { Viewport } from './viewport/Viewport.tsx';
import { useBuildPipeline } from './worker/useBuildPipeline.ts';

export function App() {
  useBuildPipeline();
  const fileInput = useRef<HTMLInputElement>(null);
  const files = useProjectFiles(fileInput);
  useKeyboardShortcuts({ onOpen: files.open, onSave: files.save, onSaveAs: files.saveAs });
  const reject = useCallback((text: string) => useUiStore.getState().notify(text, 'error'), []);
  const dragging = useProjectDropZone(files.openFile, reject);
  return (
    <Tooltip.Provider delayDuration={400}>
      <div className={styles.app}>
        <div className={styles.bar}>
          <ProjectBar
            onOpen={files.open}
            onSave={files.save}
            onSaveAs={files.saveAs}
            onShare={files.share}
            recents={files.recents}
            onOpenRecent={files.openRecent}
            onClearRecents={files.clearRecents}
          />
          <input
            ref={fileInput}
            type="file"
            accept={PROJECT_FILE_ACCEPT}
            data-testid="open-file"
            hidden
            tabIndex={-1}
            onChange={files.onFileInputChange}
          />
        </div>
        <aside className={styles.sidebar} aria-label="Lamp parameters">
          <Inspector />
        </aside>
        <main className={styles.viewport}>
          <Viewport />
          <StatusPanel />
        </main>
        {dragging ? (
          <div className={styles.dropOverlay} aria-hidden="true">
            <div className={styles.dropMessage}>Drop a .lamp.json file to open it</div>
          </div>
        ) : null}
      </div>
    </Tooltip.Provider>
  );
}
