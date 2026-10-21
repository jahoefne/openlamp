/**
 * The example gallery. Picking one replaces the project (undoable) and frames
 * the camera on it once it is built. The copy is a new project (fresh id, the
 * example's name), so autosave never writes over the example.
 */
import { Dialog } from 'radix-ui';
import { useMemo } from 'react';
import { canonicalJson } from '@core/hash.ts';
import type { Project } from '@core/model/project.ts';
import { MOUNT_LABELS } from '@core/schema/defs.ts';
import { asNewProject } from '../persistence/identity.ts';
import { useProjectStore } from '../store/projectStore.ts';
import styles from './dialog.module.css';
import { EXAMPLES } from './examples.ts';

/** The lamp itself, without identity and bookkeeping: "is this still that example?". */
function designKey(p: Project): string {
  return canonicalJson({ ...p, id: '', name: '', revision: 0, updatedAt: '' });
}

const EXAMPLE_KEYS: ReadonlyMap<string, string> = new Map(
  EXAMPLES.map((e) => [e.id, designKey(e)]),
);

function describe(p: Project): { dims: string; style: string } {
  const shade = p.shades[0];
  const s = shade.style;
  const surface = s.surface;
  const pattern =
    surface.style === 'smooth'
      ? 'smooth'
      : `${surface.style} · ${surface.patternCount} ${surface.style === 'ribbed' ? 'ribs' : 'facets'}` +
        (surface.twist ? ` · ${surface.twist}° twist` : '');
  const curve = s.curve > 0 ? 'bell' : s.curve < 0 ? 'trumpet' : 'straight';
  const mount =
    p.mount.kind === 'ceilingStrap' ? '' : ` · ${MOUNT_LABELS[p.mount.kind].toLowerCase()}`;
  const inner = p.shades[1] ? ' · inner shade' : '';
  return {
    dims: `Ø${s.bottomDiameter} → Ø${s.topDiameter} mm · ${s.height} mm wall`,
    style: `${curve} profile · ${pattern}${inner}${mount}`,
  };
}

export function ExamplesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const current = useProjectStore((s) => s.project);
  const currentKey = useMemo(() => (open ? designKey(current) : ''), [open, current]);
  const pick = (example: Project) => {
    // The camera rig frames it once built.
    useProjectStore.getState().replaceProject(asNewProject(example));
    onOpenChange(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <div>
              <Dialog.Title className={styles.title}>Examples</Dialog.Title>
              <Dialog.Description className={styles.description}>
                Start from one of these lamps. Your current lamp stays one undo away.
              </Dialog.Description>
            </div>
            <Dialog.Close className={styles.close} aria-label="Close">
              ✕
            </Dialog.Close>
          </div>
          <div className={styles.body}>
            <div className={styles.exampleGrid}>
              {EXAMPLES.map((example) => {
                const { dims, style } = describe(example);
                return (
                  <button
                    key={example.id}
                    type="button"
                    className={styles.example}
                    aria-current={EXAMPLE_KEYS.get(example.id) === currentKey}
                    onClick={() => pick(example)}
                  >
                    <span className={styles.exampleName}>
                      <span
                        className={styles.exampleSwatch}
                        style={{ background: example.shades[0].colour }}
                      />
                      {example.name}
                    </span>
                    <span className={styles.exampleDims}>{dims}</span>
                    <span className={styles.exampleStyle}>{style}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
