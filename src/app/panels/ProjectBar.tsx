/**
 * The top bar: app name, project name (with an unsaved-changes dot), printer,
 * undo / redo, project file actions (Open ▾ with the recent projects, Save,
 * Share), examples and export (STL files, a ZIP of them with the print sheet,
 * the print-sheet dialog).
 */
import { DropdownMenu, Tooltip } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { exportProject } from '../export/exportPipeline.ts';
import type { RecentProject } from '../persistence/autosave.ts';
import { useBuildStore } from '../store/buildStore.ts';
import { redo, undo, useProjectStore, useTemporal } from '../store/projectStore.ts';
import { ExamplesDialog } from './ExamplesDialog.tsx';
import { PrinterDialog } from './PrinterDialog.tsx';
import { PrintSheetDialog } from './PrintSheetDialog.tsx';
import styles from './ProjectBar.module.css';

/** Project file actions; App passes the persistence handlers. */
export interface ProjectBarActions {
  /** Choose a .lamp.json file to open. */
  onOpen?: (() => void) | undefined;
  /** Save the project to its .lamp.json file (asks where the first time). */
  onSave?: (() => void) | undefined;
  /** Save the project to a new .lamp.json file. */
  onSaveAs?: (() => void) | undefined;
  /** Copy a link that reopens this project. */
  onShare?: (() => void) | undefined;
  /** Recently autosaved projects, most recent first. */
  recents?: readonly RecentProject[] | undefined;
  onOpenRecent?: ((id: string) => void) | undefined;
  onClearRecents?: (() => void) | undefined;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';
const SHIFT_MOD = isMac ? '⇧⌘' : 'Ctrl+Shift+';

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

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** "just now", "5 minutes ago", "yesterday", "2 weeks ago", then the date. */
function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const seconds = (then - now) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < HOUR) return RELATIVE.format(Math.round(seconds / MINUTE), 'minute');
  if (abs < DAY) return RELATIVE.format(Math.round(seconds / HOUR), 'hour');
  if (abs < WEEK) return RELATIVE.format(Math.round(seconds / DAY), 'day');
  if (abs < 5 * WEEK) return RELATIVE.format(Math.round(seconds / WEEK), 'week');
  return new Date(then).toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function OpenMenu({
  onOpen,
  recents = [],
  onOpenRecent,
  onClearRecents,
}: Pick<ProjectBarActions, 'onOpen' | 'recents' | 'onOpenRecent' | 'onClearRecents'>) {
  const currentId = useProjectStore((s) => s.project.id);
  // Re-render the relative times whenever the menu opens.
  const [now, setNow] = useState(() => Date.now());
  return (
    <DropdownMenu.Root onOpenChange={(open) => open && setNow(Date.now())}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles.menuButton} disabled={!onOpen && !onOpenRecent}>
          Open
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
          <DropdownMenu.Item
            className={styles.menuItem}
            disabled={!onOpen}
            onSelect={() => onOpen?.()}
          >
            Open file…
            <span className={styles.menuHint} aria-hidden="true">
              {MOD}O · or drop a file
            </span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={styles.menuSeparator} />
          <DropdownMenu.Label className={styles.menuLabel}>Recent projects</DropdownMenu.Label>
          <DropdownMenu.Group data-testid="recents">
            {recents.length === 0 ? (
              <div className={styles.menuEmpty}>Projects you edit are kept here.</div>
            ) : (
              recents.map((r) => (
                <DropdownMenu.Item
                  key={r.id}
                  className={styles.menuItem}
                  data-current={r.id === currentId || undefined}
                  disabled={!onOpenRecent}
                  onSelect={() => onOpenRecent?.(r.id)}
                >
                  <span className={styles.recentName}>{r.name || 'Untitled lamp'}</span>{' '}
                  {/* The space keeps the name and the time apart in the accessible name. */}
                  <span className={styles.menuHint}>
                    {r.id === currentId ? 'open · ' : ''}
                    {relativeTime(r.updatedAt, now)}
                  </span>
                </DropdownMenu.Item>
              ))
            )}
          </DropdownMenu.Group>
          <DropdownMenu.Separator className={styles.menuSeparator} />
          <DropdownMenu.Item
            className={styles.menuItem}
            disabled={!onClearRecents || recents.length === 0}
            onSelect={() => onClearRecents?.()}
          >
            Clear recents
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ExportMenu({ onPrintSheet }: { onPrintSheet: () => void }) {
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
          <DropdownMenu.Item
            className={styles.menuItem}
            onSelect={() => void exportProject('zip-stl')}
          >
            ZIP of all parts (STL + print sheet)
            <span className={styles.menuHint}>one .zip</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.menuItem} disabled>
            3MF
            <span className={styles.menuHint}>later</span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={styles.menuSeparator} />
          <DropdownMenu.Item className={styles.menuItem} onSelect={onPrintSheet}>
            Print sheet…
            <span className={styles.menuHint}>parts, assembly, printing</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ProjectBar({
  onOpen,
  onSave,
  onSaveAs,
  onShare,
  recents,
  onOpenRecent,
  onClearRecents,
}: ProjectBarActions) {
  const name = useProjectStore((s) => s.project.name);
  const dirty = useProjectStore((s) => s.dirty);
  const printer = useProjectStore((s) => s.project.printer);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const canUndo = useTemporal((s) => s.pastStates.length > 0);
  const canRedo = useTemporal((s) => s.futureStates.length > 0);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

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
      {dirty ? (
        <span
          className={styles.dirty}
          role="img"
          aria-label="Unsaved changes"
          title="Changed since it was last saved to a file (autosaved in this browser)"
          data-testid="dirty"
        />
      ) : null}
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
        <OpenMenu
          onOpen={onOpen}
          recents={recents}
          onOpenRecent={onOpenRecent}
          onClearRecents={onClearRecents}
        />
        <Tip label={`Save as a .lamp.json file (${MOD}S · ⇧-click or ${SHIFT_MOD}S: save as)`}>
          <button
            type="button"
            disabled={!onSave}
            onClick={(e) => (e.shiftKey && onSaveAs ? onSaveAs() : onSave?.())}
          >
            Save
          </button>
        </Tip>
        <Tip label="Copy a link that reopens this lamp">
          <button type="button" disabled={!onShare} onClick={onShare}>
            Share
          </button>
        </Tip>
      </div>

      <button type="button" onClick={() => setExamplesOpen(true)}>
        Examples
      </button>
      <ExportMenu onPrintSheet={() => setSheetOpen(true)} />

      <PrinterDialog open={printerOpen} onOpenChange={setPrinterOpen} />
      <ExamplesDialog open={examplesOpen} onOpenChange={setExamplesOpen} />
      <PrintSheetDialog open={sheetOpen} onOpenChange={setSheetOpen} />
    </header>
  );
}
