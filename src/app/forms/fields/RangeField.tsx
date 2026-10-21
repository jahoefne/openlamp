/**
 * A view setting on a 0 … 1 scale (the exploded view): a Radix slider and its
 * value in percent. Not a project parameter: no undo, no rebuild.
 */
import { Slider } from 'radix-ui';
import { FieldNotes } from './FieldNotes.tsx';
import styles from './fields.module.css';

export interface RangeFieldProps {
  id: string;
  label: string;
  /** 0 … 1. */
  value: number;
  help?: string | undefined;
  disabled?: boolean | undefined;
  onChange(value: number): void;
}

export function RangeField({ id, label, value, help, disabled, onChange }: RangeFieldProps) {
  return (
    <div className={styles.param}>
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      <Slider.Root
        id={id}
        className={styles.slider}
        min={0}
        max={1}
        step={0.01}
        value={[value]}
        disabled={disabled}
        onValueChange={([v]) => {
          if (v !== undefined) onChange(v);
        }}
      >
        <Slider.Track className={styles.track}>
          <Slider.Range className={styles.range} />
        </Slider.Track>
        <Slider.Thumb className={styles.thumb} aria-label={label} />
      </Slider.Root>
      <output className={styles.readout} aria-live="off">
        {Math.round(value * 100)} %
      </output>
      <FieldNotes help={help} />
    </div>
  );
}
