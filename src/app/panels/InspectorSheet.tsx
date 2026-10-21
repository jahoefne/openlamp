/**
 * The inspector as a sheet over the right edge of the viewport (medium
 * screens, 760 … 1099 px), rendered in place inside the viewport's area (no
 * portal). Not modal: the viewport and the lamp tree stay usable while it is
 * open, and the sheet follows the selection; Escape or ✕ closes it.
 */
import { Dialog } from 'radix-ui';
import { NODE_LABELS } from '../store/nodes.ts';
import { useShownNode } from '../store/selectors.ts';
import { Inspector } from './Inspector.tsx';
import styles from './InspectorSheet.module.css';

export function InspectorSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const node = useShownNode();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Content
        className={styles.sheet}
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className={styles.header}>
          <Dialog.Title className={styles.title}>{NODE_LABELS[node]}</Dialog.Title>
          <Dialog.Close className={styles.close} aria-label="Close the inspector">
            ✕
          </Dialog.Close>
        </div>
        <div className={styles.body}>
          <Inspector heading={false} />
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
