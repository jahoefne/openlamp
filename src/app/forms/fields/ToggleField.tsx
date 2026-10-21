/**
 * An on/off option: Radix switch with its label.
 */
import { Switch } from 'radix-ui';
import { FieldNotes } from './FieldNotes.tsx';
import styles from './fields.module.css';

export interface ToggleFieldProps {
  id: string;
  label: string;
  checked: boolean;
  help?: string | undefined;
  onChange(checked: boolean): void;
}

export function ToggleField({ id, label, checked, help, onChange }: ToggleFieldProps) {
  return (
    <div className={styles.toggle}>
      <label className={styles.toggleLabel} htmlFor={id}>
        {label}
      </label>
      <Switch.Root id={id} className={styles.switch} checked={checked} onCheckedChange={onChange}>
        <Switch.Thumb className={styles.switchThumb} />
      </Switch.Root>
      <FieldNotes help={help} />
    </div>
  );
}
