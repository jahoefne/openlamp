/**
 * Overlays on the viewport: the status line (top left: build status, plus a
 * short-lived notice such as "Link copied") and the stats of the selected
 * (else first) part, the bed-fit badge and every warning (bottom left).
 */
import type { PartStats, Warning } from '@core/model/assembly.ts';
import { printerLabel } from '@core/schema/printers.ts';
import { useBuildStore, type PartBuild } from '../store/buildStore.ts';
import { useAssembly, useBedFit, useSelectedPart, useTotals } from '../store/selectors.ts';
import { useUiStore } from '../store/uiStore.ts';
import styles from './StatusPanel.module.css';

/** Overhangs steeper than this (degrees from vertical) may need support. */
const OVERHANG_LIMIT = 55;

const fmt = (n: number, digits = 1) => Number(n).toFixed(digits);

type Status = { text: string; tone: 'busy' | 'error' | 'idle' };

function useStatus(): Status {
  const { parts } = useAssembly();
  const builds = useBuildStore((s) => s.parts);
  const kernelReady = useBuildStore((s) => s.kernelReady);
  const fatalError = useBuildStore((s) => s.fatalError);
  const exportError = useBuildStore((s) => s.exportError);
  const lastBuild = useBuildStore((s) => s.lastBuild);
  if (fatalError) return { text: `Error: ${fatalError}`, tone: 'error' };
  if (!kernelReady) return { text: 'Loading kernel…', tone: 'busy' };
  const current = parts.map((p) => builds[p.id]).filter((b): b is PartBuild => !!b);
  const failed = current.find((b) => b.status === 'error');
  if (failed) return { text: `Error: ${failed.error ?? 'build failed'}`, tone: 'error' };
  const busy = current.length < parts.length || current.some((b) => b.status !== 'ready');
  if (busy) return { text: 'Building…', tone: 'busy' };
  if (exportError) return { text: `Error: ${exportError}`, tone: 'error' };
  if (!lastBuild) return { text: 'Ready', tone: 'idle' };
  return {
    text: lastBuild.cached ? 'Ready · from cache' : `Ready · built in ${lastBuild.ms} ms`,
    tone: 'idle',
  };
}

function StatsRows({ stats }: { stats: PartStats }) {
  const { min, max } = stats.bbox;
  const d = stats.derived;
  const over = stats.maxOverhangDeg;
  const steep = over > OVERHANG_LIMIT;
  return (
    <dl className={styles.rows}>
      <dt>Footprint</dt>
      <dd>
        {fmt(max[0] - min[0])} × {fmt(max[1] - min[1])} mm, {fmt(max[2] - min[2])} mm tall
      </dd>
      {d?.rBoss !== undefined && d.rPocket !== undefined && d.pocketDepth !== undefined ? (
        <>
          <dt>Housing</dt>
          <dd>
            Ø{fmt(2 * d.rBoss)} mm · pocket Ø{fmt(2 * d.rPocket, 2)} × {fmt(d.pocketDepth)} mm
          </dd>
        </>
      ) : null}
      <dt>Material</dt>
      <dd>
        {fmt(stats.volumeMm3 / 1000)} cm³ ≈ {fmt(stats.estGramsPla, 0)} g PLA
      </dd>
      <dt>Max overhang</dt>
      <dd className={steep ? styles.warn : styles.ok}>
        {fmt(over, 0)}° from vertical{steep ? ' – may need support' : ''}
      </dd>
      <dt>Mesh</dt>
      <dd>{stats.triangles.toLocaleString('en-US')} triangles</dd>
    </dl>
  );
}

function BedFitBadge() {
  const fit = useBedFit();
  const name = printerLabel(fit.printer);
  return fit.fits ? (
    <div className={`${styles.badge} ${styles.badgeOk}`} data-testid="bed-fit">
      ✓ Fits {name}
    </div>
  ) : (
    <div className={`${styles.badge} ${styles.badgeWarn}`} data-testid="bed-fit">
      ⚠ Exceeds the {name} bed by {fmt(fit.overshoot, 0)} mm
    </div>
  );
}

function Warnings({ warnings }: { warnings: readonly Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className={styles.warnings}>
      {warnings.map((w, i) => (
        <li key={i} className={w.severity === 'info' ? styles.info : styles.warn}>
          {w.severity === 'info' ? 'ℹ' : '⚠'} {w.message}
        </li>
      ))}
    </ul>
  );
}

export function StatusPanel() {
  const status = useStatus();
  const assembly = useAssembly();
  const selected = useSelectedPart();
  const builds = useBuildStore((s) => s.parts);
  const totals = useTotals();
  const part = selected ?? assembly.parts[0];
  const stats = part ? builds[part.id]?.stats : undefined;
  const partWarnings = assembly.parts.flatMap((p) => builds[p.id]?.warnings ?? []);
  const warnings = [...assembly.warnings, ...partWarnings];
  const several = assembly.parts.length > 1;
  const notice = useUiStore((s) => s.notice);

  return (
    <>
      <div className={styles.statusLine}>
        <div
          id="status"
          className={`${styles.status} ${styles[status.tone]}`}
          role="status"
          aria-live="polite"
        >
          {status.text}
        </div>
        {notice ? (
          <div
            key={notice.id}
            className={`${styles.notice} ${notice.tone === 'error' ? styles.noticeError : ''}`}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            data-testid="notice"
          >
            {notice.text}
          </div>
        ) : null}
      </div>
      <div id="stats" className={styles.stats}>
        {several && part ? <div className={styles.partName}>{part.displayName}</div> : null}
        {stats ? <StatsRows stats={stats} /> : null}
        {several ? (
          <div className={styles.totals}>
            All parts: {totals.triangles.toLocaleString('en-US')} triangles · {fmt(totals.grams, 0)}{' '}
            g PLA
          </div>
        ) : null}
        <BedFitBadge />
        <Warnings warnings={warnings} />
      </div>
    </>
  );
}
