/**
 * The lamp tree (left column): the project, the printer, the mount (its
 * kind), the light (its kind), the outer shade and the inner shade (their
 * style families; a shade of several parts lists them under it), or a row
 * that adds the inner shade, the hub & joints, and one row per further part of the
 * current assembly (canopy, cord grip, stem segments, base, lid, wall plate,
 * wall arm; the fit-test pieces), each part with its colour and whether it
 * fits the bed.
 *
 * Picking a node shows its inspector; picking a part row selects the node
 * the part belongs to (its mount, or Hub & joints for the test pieces) and
 * outlines the part. The selected node is `aria-current`; so is the picked
 * part's row. Collapsed (a rail of icons below 1100 px) the rows keep their
 * names for screen readers and as tooltips.
 */
import type { ReactNode } from 'react';
import { INNER_SHADE_ID } from '@core/assembly/assemble.ts';
import type { PartSpec } from '@core/model/assembly.ts';
import { lightChoiceOf } from '@core/model/project.ts';
import { LIGHT_CHOICE_LABELS, MOUNT_LABELS, SHADE_FAMILY_LABELS } from '@core/schema/defs.ts';
import { printerLabel } from '@core/schema/printers.ts';
import {
  NODE_LABELS,
  extraShadeParts,
  mainPartOf,
  nodeOfPart,
  structuralParts,
  type NodeId,
} from '../store/nodes.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { useAssembly } from '../store/selectors.ts';
import { useUiStore } from '../store/uiStore.ts';
import styles from './LampTree.module.css';
import { nordicLettering } from '../brand/lettering.ts';

const JOINT_LABELS: Readonly<Record<string, string>> = {
  bayonet: 'bayonet',
  snap: 'press fit',
  thread: 'thread',
};

/** 16 × 16 line icons, one per node. */
const ICONS: Readonly<Record<NodeId | 'add', ReactNode>> = {
  project: <path d="M5.5 2.5h5l3 8h-11zM8 10.5v3M5.5 13.5h5" />,
  printer: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M4 10.5h8M6 7.5h4" />
    </>
  ),
  mount: (
    <>
      <path d="M2.5 2.5h11M8 2.5v6" />
      <circle cx="8" cy="11" r="2.5" />
    </>
  ),
  light: (
    <>
      <circle cx="8" cy="6.5" r="4" />
      <path d="M6 12h4M6.5 14h3" />
    </>
  ),
  outerShade: <path d="M5.5 3h5l3.5 9.5h-12z" />,
  innerShade: (
    <>
      <path d="M5.5 3h5l3.5 9.5h-12z" />
      <path d="M6.8 6.5h2.4l1.6 6h-5.6z" />
    </>
  ),
  hub: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.5" />
    </>
  ),
  add: <path d="M8 3.5v9M3.5 8h9" />,
};

function Icon({ name }: { name: NodeId | 'add' }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

/** A part's colour and whether it fits the bed. */
function PartBadges({ part, fits }: { part: PartSpec; fits: boolean }) {
  return (
    <span className={styles.badges}>
      <span className={styles.swatch} style={{ background: part.colour }} aria-hidden="true" />
      <span
        className={`${styles.fit} ${fits ? styles.fitOk : styles.fitWarn}`}
        data-testid={`tree-fit-${part.id}`}
        title={fits ? 'Fits the bed' : 'Too big for the bed'}
      >
        {fits ? '✓' : '⚠'}
        <span className={styles.hidden}>{fits ? ' fits the bed' : ' too big for the bed'}</span>
      </span>
    </span>
  );
}

interface RowProps {
  testId: string;
  icon: ReactNode;
  label: string;
  detail?: string | undefined;
  current: boolean;
  child?: boolean;
  badges?: ReactNode;
  expanded: boolean;
  onClick(): void;
}

function Row({ testId, icon, label, detail, current, child, badges, expanded, onClick }: RowProps) {
  return (
    <li>
      <button
        type="button"
        className={`${styles.row} ${child ? styles.child : ''}`}
        data-testid={testId}
        aria-current={current ? 'true' : undefined}
        title={expanded ? undefined : detail ? `${label} · ${detail}` : label}
        onClick={onClick}
      >
        {icon}
        <span className={styles.text}>
          <span className={styles.label}>{label}</span>
          {detail ? (
            <span className={expanded ? styles.detail : styles.hidden}>{detail}</span>
          ) : null}
        </span>
        {badges}
      </button>
    </li>
  );
}

export interface LampTreeProps {
  /** Rows with their names and badges; a rail of icons otherwise. */
  expanded: boolean;
  /** Show the collapse / expand toggle. */
  collapsible: boolean;
  onToggle(): void;
  /** After a node or part was picked (opens the inspector sheet on medium screens). */
  onPick?: (() => void) | undefined;
}

export function LampTree({ expanded, collapsible, onToggle, onPick }: LampTreeProps) {
  const project = useProjectStore((s) => s.project);
  const { parts, warnings } = useAssembly();
  const selection = useUiStore((s) => s.selection);
  const selectedPart = useUiStore((s) => s.selectedPart);
  const tooBig = new Set(warnings.filter((w) => w.code === 'bed-fit').map((w) => w.partId));
  const inner = project.shades[1];
  const fused = parts.some((p) => p.kind === 'shade' && p.params.variant === 'fused');
  const fitPieces = parts.some((p) => p.kind === 'fitMale' || p.kind === 'fitFemale');

  const pickNode = (node: NodeId) => {
    useUiStore.getState().select(node, mainPartOf(node, parts)?.id ?? null);
    onPick?.();
  };
  const pickPart = (part: PartSpec) => {
    useUiStore.getState().selectPart(part);
    onPick?.();
  };
  const addInner = () => {
    useProjectStore.getState().addInnerShade();
    useUiStore.getState().select('innerShade', INNER_SHADE_ID);
    useUiStore.getState().requestFit(true); // the lamp changes shape: frame it once built
    onPick?.();
  };

  const nodeRow = (node: NodeId, detail?: string) => {
    const part = mainPartOf(node, parts);
    return (
      <Row
        key={node}
        testId={`tree-${node}`}
        icon={<Icon name={node} />}
        label={NODE_LABELS[node]}
        detail={detail}
        current={selection === node}
        expanded={expanded}
        badges={part ? <PartBadges part={part} fits={!tooBig.has(part.id)} /> : undefined}
        onClick={() => pickNode(node)}
      />
    );
  };

  /** A part's own row (a mount part, a test piece, a shade's further part). */
  const partRow = (part: PartSpec) => (
    <Row
      key={part.id}
      testId={`tree-part-${part.id}`}
      icon={
        <span className={styles.partDot} style={{ background: part.colour }} aria-hidden="true" />
      }
      label={part.displayName}
      detail={expanded ? undefined : NODE_LABELS[nodeOfPart(part)]}
      current={selectedPart === part.id}
      child
      expanded={expanded}
      badges={<PartBadges part={part} fits={!tooBig.has(part.id)} />}
      onClick={() => pickPart(part)}
    />
  );
  /** A shade's node with its style family, and the rows of its further parts. */
  const shadeRows = (node: 'outerShade' | 'innerShade', family: string, note?: string) => [
    nodeRow(node, note ? `${family} · ${note}` : family),
    ...extraShadeParts(node, parts).map(partRow),
  ];

  const others = structuralParts(parts);
  const joint = JOINT_LABELS[project.joints.shadeToHub] ?? project.joints.shadeToHub;

  return (
    <nav className={styles.tree} aria-label="Lamp tree" data-expanded={expanded}>
      <div className={styles.head}>
        {expanded ? (
          <h2 className={styles.title} aria-label="Lamp">
            {nordicLettering('Lamp')}
          </h2>
        ) : null}
        {collapsible ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse the lamp tree' : 'Expand the lamp tree'}
            title={expanded ? 'Collapse' : 'Expand'}
            onClick={onToggle}
          >
            {expanded ? '«' : '»'}
          </button>
        ) : null}
      </div>
      <ul className={styles.rows}>
        {nodeRow('project', project.name || 'Untitled lamp')}
        {nodeRow('printer', `${printerLabel(project.printer)} · ${project.printer.bed.join('×')}`)}
        {nodeRow('mount', MOUNT_LABELS[project.mount.kind])}
        {nodeRow('light', LIGHT_CHOICE_LABELS[lightChoiceOf(project.light)])}
        {shadeRows(
          'outerShade',
          SHADE_FAMILY_LABELS[project.shades[0].style.family],
          fused ? 'one print with the hub' : undefined,
        )}
        {inner ? (
          shadeRows('innerShade', SHADE_FAMILY_LABELS[inner.style.family])
        ) : (
          <Row
            key="add-inner"
            testId="tree-add-inner"
            icon={<Icon name="add" />}
            label="Add inner shade"
            current={false}
            expanded={expanded}
            onClick={addInner}
          />
        )}
        {nodeRow('hub', fused ? 'fused into the shade' : joint)}
      </ul>
      {others.length > 0 ? (
        <>
          {expanded ? (
            <h3 className={styles.group} aria-label={fitPieces ? 'Fit-test pieces' : 'Mount parts'}>
              {nordicLettering(fitPieces ? 'Fit-test pieces' : 'Mount parts')}
            </h3>
          ) : (
            <hr className={styles.divider} />
          )}
          <ul className={styles.rows}>{others.map(partRow)}</ul>
        </>
      ) : null}
    </nav>
  );
}
