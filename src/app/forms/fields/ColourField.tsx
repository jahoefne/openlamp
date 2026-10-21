/**
 * A colour: a few filament-like swatches plus the native colour picker.
 */
import type { Hex } from '@core/model/assembly.ts';
import styles from './fields.module.css';

const SWATCHES: readonly { hex: Hex; name: string }[] = [
  { hex: '#f4efe6', name: 'Warm white' },
  { hex: '#ffffff', name: 'White' },
  { hex: '#e8d9b5', name: 'Sand' },
  { hex: '#f2b544', name: 'Amber' },
  { hex: '#d9774a', name: 'Terracotta' },
  { hex: '#9cb59a', name: 'Sage' },
  { hex: '#7fa7c9', name: 'Sky' },
  { hex: '#3b3d42', name: 'Charcoal' },
];

export interface ColourFieldProps {
  id: string;
  label: string;
  value: Hex;
  onChange(value: Hex): void;
}

const isHex = (s: string): s is Hex => /^#[0-9a-fA-F]{6}$/.test(s);

export function ColourField({ id, label, value, onChange }: ColourFieldProps) {
  return (
    <div className={styles.colour}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.swatches} role="group" aria-label={`${label} presets`}>
        {SWATCHES.map((s) => (
          <button
            key={s.hex}
            type="button"
            className={styles.swatch}
            style={{ background: s.hex }}
            title={s.name}
            aria-label={s.name}
            aria-pressed={value.toLowerCase() === s.hex}
            onClick={() => onChange(s.hex)}
          />
        ))}
        <input
          id={id}
          className={styles.picker}
          type="color"
          value={value}
          title="Pick any colour"
          onChange={(e) => {
            if (isHex(e.target.value)) onChange(e.target.value);
          }}
        />
      </div>
    </div>
  );
}
