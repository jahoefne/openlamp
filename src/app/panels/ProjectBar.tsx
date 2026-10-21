/**
 * The top bar: app name, project name, printer, undo / redo, project file
 * actions, examples and export.
 */
import { DropdownMenu, Tooltip } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { exportProject } from '../export/exportPipeline.ts';
import { useBuildStore } from '../store/buildStore.ts';
import { redo, undo, useProjectStore, useTemporal } from '../store/projectStore.ts';
import { ExamplesDialog } from './ExamplesDialog.tsx';
import { PrinterDialog } from './PrinterDialog.tsx';
import styles from './ProjectBar.module.css';

/**
 * Project file actions. M1.5 (persistence) passes the handlers; a button
 * without one is shown disabled.
 */
export interface ProjectBarActions {
  /** Open a .lamp.json file. */
  onOpen?: (() => void) | undefined;
  /** Save the project to a .lamp.json file. */
  onSave?: (() => void) | undefined;
  /** Copy a link that reopens this project. */
  onShare?: (() => void) | undefined;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={styles.tooltip} sideOffset={6}>
          {label}
          <Tooltip.Arrow className={styles.tooltipArrow} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** A file action button; disabled with a "next step" tooltip until it has a handler. */
function FileAction({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick?: (() => void) | undefined;
}) {
  if (onClick) {
    return (
      <Tip label={title}>
        <button type="button" onClick={onClick}>
          {label}
        </button>
      </Tip>
    );
  }
  return (
    <Tip label="Coming in the next step">
      {/* Disabled buttons get no pointer events; the span carries the tooltip. */}
      <span className={styles.disabledWrap} tabIndex={0}>
        <button type="button" disabled>
          {label}
        </button>
      </span>
    </Tip>
  );
}

function ExportMenu() {
  const exporting = useBuildStore((s) => s.exporting);
  const progress = useBuildStore((s) => s.exportProgress);
  const ready = useBuildStore((s) => s.kernelReady);
  const label = exporting
    ? `Exporting…${progress ? ` ${progress.done}/${progress.total}` : ''}`
    : 'Export';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" data-variant="primary" disabled={exporting || !ready}>
          {label} ▾
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
          <DropdownMenu.Item className={styles.menuItem} onSelect={() => void exportProject('stl')}>
            Download STL
            <span className={styles.menuHint}>one file per part</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.menuItem} disabled>
            ZIP of STLs
            <span className={styles.menuHint}>later</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.menuItem} disabled>
            3MF
            <span className={styles.menuHint}>later</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ProjectBar({ onOpen, onSave, onShare }: ProjectBarActions) {
  const name = useProjectStore((s) => s.project.name);
  const printer = useProjectStore((s) => s.project.printer);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const canUndo = useTemporal((s) => s.pastStates.length > 0);
  const canRedo = useTemporal((s) => s.futureStates.length > 0);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true" />
        openlamp
      </div>
      <input
        className={styles.name}
        type="text"
        value={name}
        aria-label="Project name"
        placeholder="Untitled lamp"
        spellCheck={false}
        onChange={(e) => setProjectName(e.target.value)}
      />
      <Tip label="Choose the printer">
        <button type="button" className={styles.chip} onClick={() => setPrinterOpen(true)}>
          <span className={styles.chipName}>{printer.name}</span>
          <span className={styles.chipMeta}>{printer.bed.join('×')}</span>
        </button>
      </Tip>

      <div className={styles.spacer} />

      <div className={styles.group} role="group" aria-label="History">
        <Tip label={`Undo (${MOD}Z)`}>
          <button type="button" aria-label="Undo" disabled={!canUndo} onClick={undo}>
            ↶
          </button>
        </Tip>
        <Tip label={`Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Y'})`}>
          <button type="button" aria-label="Redo" disabled={!canRedo} onClick={redo}>
            ↷
          </button>
        </Tip>
      </div>

      <div className={styles.group} role="group" aria-label="Project file">
        <FileAction label="Open" title="Open a .lamp.json file" onClick={onOpen} />
        <FileAction label="Save" title="Save as a .lamp.json file" onClick={onSave} />
        <FileAction label="Share" title="Copy a link to this lamp" onClick={onShare} />
      </div>

      <button type="button" onClick={() => setExamplesOpen(true)}>
        Examples
      </button>
      <ExportMenu />

      <PrinterDialog open={printerOpen} onOpenChange={setPrinterOpen} />
      <ExamplesDialog open={examplesOpen} onOpenChange={setExamplesOpen} />
    </header>
  );
}
