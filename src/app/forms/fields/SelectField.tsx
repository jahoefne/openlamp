/**
 * A parameter with a fixed set of options: Radix select.
 */
import { Select } from 'radix-ui';
import type { Warning } from '@core/model/assembly.ts';
import { FieldNotes } from './FieldNotes.tsx';
import styles from './fields.module.css';

export interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  /** Display text of an option; capitalised option by default. */
  optionLabel?: ((option: string) => string) | undefined;
  help?: string | undefined;
  warnings?: readonly Warning[] | undefined;
  onChange(value: string): void;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function SelectField({
  id,
  label,
  value,
  options,
  optionLabel = capitalise,
  help,
  warnings,
  onChange,
}: SelectFieldProps) {
  return (
    <div className={styles.param}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger id={id} className={styles.selectTrigger} aria-label={label}>
          <Select.Value />
          <Select.Icon className={styles.selectIcon}>▾</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className={styles.selectContent} position="popper" sideOffset={4}>
            <Select.Viewport>
              {options.map((o) => (
                <Select.Item key={o} value={o} className={styles.selectItem}>
                  <Select.ItemText>{optionLabel(o)}</Select.ItemText>
                  <Select.ItemIndicator className={styles.selectCheck}>✓</Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <FieldNotes help={help} warnings={warnings} />
    </div>
  );
}
