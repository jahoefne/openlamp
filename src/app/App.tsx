/**
 * The app shell: project bar on top, inspector on the left, viewport with its
 * status overlay on the right. (M2 adds the LampTree column.)
 */
import { Tooltip } from 'radix-ui';
import styles from './App.module.css';
import { Inspector } from './panels/Inspector.tsx';
import { ProjectBar } from './panels/ProjectBar.tsx';
import { StatusPanel } from './panels/StatusPanel.tsx';
import { useKeyboardShortcuts } from './useKeyboardShortcuts.ts';
import { Viewport } from './viewport/Viewport.tsx';
import { useBuildPipeline } from './worker/useBuildPipeline.ts';

export function App() {
  useBuildPipeline();
  useKeyboardShortcuts();
  return (
    <Tooltip.Provider delayDuration={400}>
      <div className={styles.app}>
        <div className={styles.bar}>
          {/* M1.5 passes onOpen / onSave / onShare (see ProjectBarActions). */}
          <ProjectBar />
        </div>
        <aside className={styles.sidebar} aria-label="Lamp parameters">
          <Inspector />
        </aside>
        <main className={styles.viewport}>
          <Viewport />
          <StatusPanel />
        </main>
      </div>
    </Tooltip.Provider>
  );
}
