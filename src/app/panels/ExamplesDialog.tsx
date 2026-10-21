/**
 * The example gallery. Picking one replaces the project (undoable) and frames
 * the camera on it once it is built.
 */
import { Dialog } from 'radix-ui';
import type { Project } from '@core/model/project.ts';
import { useProjectStore } from '../store/projectStore.ts';
import styles from './dialog.module.css';
import { EXAMPLES } from './examples.ts';

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
  return {
    dims: `Ø${s.bottomDiameter} → Ø${s.topDiameter} mm · ${s.height} mm wall`,
    style: `${curve} profile · ${pattern}`,
  };
}

export function ExamplesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const currentId = useProjectStore((s) => s.project.id);
  const pick = (example: Project) => {
    useProjectStore.getState().replaceProject(example); // the camera rig frames it once built
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
                Start from one of these shades. Your current lamp stays one undo away.
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
                    aria-current={example.id === currentId}
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
