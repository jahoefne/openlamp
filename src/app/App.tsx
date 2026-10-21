/**
 * The app shell, a CSS grid `bar / tree | viewport | inspector / status`:
 * the project bar on top; the lamp tree on the left, the viewport in the
 * middle with the status strip under it, the inspector of the selected node
 * on the right. Below 1100 px the tree is a rail of icons (expandable) and
 * the inspector a sheet over the viewport; below 760 px everything stacks,
 * the viewport at 50 vh. The whole window is a drop zone for project files.
 */
import { Tooltip } from 'radix-ui';
import { useCallback, useRef } from 'react';
import styles from './App.module.css';
import { Inspector } from './panels/Inspector.tsx';
import { InspectorSheet } from './panels/InspectorSheet.tsx';
import { LampTree } from './panels/LampTree.tsx';
import { ProjectBar } from './panels/ProjectBar.tsx';
import { StatusPanel } from './panels/StatusPanel.tsx';
import { PROJECT_FILE_ACCEPT, useProjectDropZone } from './persistence/fileIO.ts';
import { useProjectFiles } from './persistence/useProjectFiles.ts';
import { NODE_LABELS } from './store/nodes.ts';
import { useShownNode } from './store/selectors.ts';
import { useUiStore } from './store/uiStore.ts';
import { useKeyboardShortcuts } from './useKeyboardShortcuts.ts';
import { useLayout, type LayoutKind } from './useLayout.ts';
import { Viewport } from './viewport/Viewport.tsx';
import { useBuildPipeline } from './worker/useBuildPipeline.ts';

/** The tree is expanded by default on wide screens only. */
const TREE_EXPANDED_BY_DEFAULT: Readonly<Record<LayoutKind, boolean>> = {
  wide: true,
  medium: false,
  narrow: false,
};

/** Medium screens: opens the inspector sheet (its ✕ closes it). */
function SheetToggle() {
  const node = useShownNode();
  return (
    <button
      type="button"
      className={styles.sheetToggle}
      onClick={() => useUiStore.getState().setPanel('inspector', true)}
    >
      Edit {NODE_LABELS[node]}
    </button>
  );
}

export function App() {
  useBuildPipeline();
  const fileInput = useRef<HTMLInputElement>(null);
  const files = useProjectFiles(fileInput);
  useKeyboardShortcuts({ onOpen: files.open, onSave: files.save, onSaveAs: files.saveAs });
  const reject = useCallback((text: string) => useUiStore.getState().notify(text, 'error'), []);
  const dragging = useProjectDropZone(files.openFile, reject);
  const layout = useLayout();
  const treeChoice = useUiStore((s) => s.panels.tree);
  const sheetOpen = useUiStore((s) => s.panels.inspector === true);
  const treeExpanded = treeChoice ?? TREE_EXPANDED_BY_DEFAULT[layout];
  const { setPanel } = useUiStore.getState();

  const onPick = () => {
    if (layout === 'medium') setPanel('inspector', true);
    if (layout === 'narrow') {
      document.getElementById('inspector')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className={styles.app} data-layout={layout} data-tree={treeExpanded ? 'open' : 'rail'}>
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
        <aside className={styles.tree}>
          <LampTree
            expanded={treeExpanded}
            collapsible={layout !== 'wide'}
            onToggle={() => setPanel('tree', !treeExpanded)}
            onPick={onPick}
          />
        </aside>
        <main className={styles.viewport}>
          <Viewport />
          {layout === 'medium' ? (
            <>
              {sheetOpen ? null : <SheetToggle />}
              <InspectorSheet
                open={sheetOpen}
                onOpenChange={(open) => setPanel('inspector', open)}
              />
            </>
          ) : null}
        </main>
        <div className={styles.status}>
          <StatusPanel />
        </div>
        {layout === 'medium' ? null : (
          <aside id="inspector" className={styles.inspector} aria-label="Inspector">
            <Inspector />
          </aside>
        )}
        {dragging ? (
          <div className={styles.dropOverlay} aria-hidden="true">
            <div className={styles.dropMessage}>Drop a .lamp.json file to open it</div>
          </div>
        ) : null}
      </div>
    </Tooltip.Provider>
  );
}
