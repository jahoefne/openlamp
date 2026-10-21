/**
 * Pick the printer: the curated list grouped by vendor, or a custom build
 * volume. The printer drives the bed-fit check and the plate layout.
 */
import { Dialog } from 'radix-ui';
import { useState, type FormEvent } from 'react';
import { CUSTOM_PRINTER_ID, PRINTERS, type PrinterSpec } from '@core/schema/printers.ts';
import { useProjectStore } from '../store/projectStore.ts';
import styles from './dialog.module.css';

const VENDORS = [...new Set(PRINTERS.map((p) => p.vendor))];

const bedText = (p: PrinterSpec) => p.bed.join(' × ') + ' mm';

interface CustomDraft {
  name: string;
  x: string;
  y: string;
  z: string;
  nozzle: string;
  multiColour: boolean;
}

function draftOf(p: PrinterSpec): CustomDraft {
  return {
    name: p.id === CUSTOM_PRINTER_ID ? p.name : 'Custom printer',
    x: String(p.bed[0]),
    y: String(p.bed[1]),
    z: String(p.bed[2]),
    nozzle: String(p.nozzle),
    multiColour: p.multiColour,
  };
}

const positive = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function CustomPrinterForm({ onDone }: { onDone(): void }) {
  const current = useProjectStore((s) => s.project.printer);
  const setPrinter = useProjectStore((s) => s.setPrinter);
  const [draft, setDraft] = useState(() => draftOf(current));
  const x = positive(draft.x);
  const y = positive(draft.y);
  const z = positive(draft.z);
  const nozzle = positive(draft.nozzle);
  const valid = x !== null && y !== null && z !== null && nozzle !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setPrinter({
      id: CUSTOM_PRINTER_ID,
      vendor: 'Custom',
      name: draft.name.trim() || 'Custom printer',
      bed: [x, y, z],
      nozzle,
      multiColour: draft.multiColour,
    });
    onDone();
  };

  const field = (key: 'x' | 'y' | 'z' | 'nozzle', label: string, step: number) => (
    <label>
      {label}
      <input
        type="number"
        min={step}
        step={step}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <form className={styles.customForm} onSubmit={submit}>
      <label className={styles.customName}>
        Name
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      {field('x', 'Bed X (mm)', 1)}
      {field('y', 'Bed Y (mm)', 1)}
      {field('z', 'Height Z (mm)', 1)}
      {field('nozzle', 'Nozzle (mm)', 0.05)}
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={draft.multiColour}
          onChange={(e) => setDraft({ ...draft, multiColour: e.target.checked })}
        />
        Multi-colour
      </label>
      <button type="submit" data-variant="primary" disabled={!valid}>
        Use custom printer
      </button>
    </form>
  );
}

export function PrinterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const current = useProjectStore((s) => s.project.printer);
  const setPrinter = useProjectStore((s) => s.setPrinter);
  const close = () => onOpenChange(false);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <div>
              <Dialog.Title className={styles.title}>Printer</Dialog.Title>
              <Dialog.Description className={styles.description}>
                The build volume decides whether every part fits the bed.
              </Dialog.Description>
            </div>
            <Dialog.Close className={styles.close} aria-label="Close">
              ✕
            </Dialog.Close>
          </div>
          <div className={styles.body}>
            {VENDORS.map((vendor) => (
              <section key={vendor}>
                <h3 className={styles.sectionTitle}>{vendor}</h3>
                <div className={styles.printerGrid}>
                  {PRINTERS.filter((p) => p.vendor === vendor).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={styles.printer}
                      aria-pressed={current.id === p.id}
                      onClick={() => {
                        setPrinter(p);
                        close();
                      }}
                    >
                      <span className={styles.printerName}>{p.name}</span>
                      <span className={styles.printerMeta}>
                        {bedText(p)}
                        {p.notes ? ` · ${p.notes}` : p.multiColour ? ' · multi-colour' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <section>
              <h3 className={styles.sectionTitle}>Custom</h3>
              {/* Keyed so it starts from the current printer each time the dialog opens. */}
              {open && <CustomPrinterForm key={current.id} onDone={close} />}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
