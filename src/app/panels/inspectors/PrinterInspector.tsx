/**
 * The printer node: the build volume the parts must fit, how they lie on the
 * plate (the export's layout), and the printer list.
 */
import { useState } from 'react';
import { printerLabel } from '@core/schema/printers.ts';
import { ToggleField } from '../../forms/fields/ToggleField.tsx';
import { useProjectStore } from '../../store/projectStore.ts';
import { useAssembly, useBedFit } from '../../store/selectors.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { PrinterDialog } from '../PrinterDialog.tsx';
import styles from '../Inspector.module.css';

export function PrinterInspector() {
  const printer = useProjectStore((s) => s.project.printer);
  const { parts, layout } = useAssembly();
  const fit = useBedFit();
  const bedView = useUiStore((s) => s.viewMode === 'bed');
  const [open, setOpen] = useState(false);
  const copies = parts.reduce((n, p) => n + p.instances, 0);
  const names = new Map(parts.map((p) => [p.id, p.displayName]));
  const [x, y, z] = printer.bed;
  return (
    <>
      <fieldset>
        <legend>Printer</legend>
        <dl className={styles.facts}>
          <dt>Printer</dt>
          <dd>{printerLabel(printer)}</dd>
          <dt>Build volume</dt>
          <dd>
            {x} × {y} × {z} mm
          </dd>
          <dt>Nozzle</dt>
          <dd>{printer.nozzle} mm</dd>
          <dt>Colours</dt>
          <dd>{printer.multiColour ? 'multi-colour' : 'one at a time'}</dd>
        </dl>
        <button type="button" className={styles.wide} onClick={() => setOpen(true)}>
          Choose printer…
        </button>
      </fieldset>
      <fieldset>
        <legend>Plate</legend>
        <p className={styles.note}>
          {copies === 1 ? '1 part' : `${copies} parts`}
          {layout.overflow.length === 0
            ? ' fit on one plate.'
            : `; print separately: ${layout.overflow.map((id) => names.get(id) ?? id).join(', ')}.`}{' '}
          {fit.fits
            ? 'Every part fits the build volume.'
            : `The largest part exceeds the build volume by ${Math.round(fit.overshoot)} mm.`}
        </p>
        <ToggleField
          id="v-bed-printer"
          label="Show the parts on the bed · B"
          checked={bedView}
          onChange={(on) => useUiStore.getState().setViewMode(on ? 'bed' : 'assembled')}
        />
      </fieldset>
      <PrinterDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
