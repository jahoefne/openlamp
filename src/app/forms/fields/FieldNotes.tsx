import type { Warning } from '@core/model/assembly.ts';
import styles from './fields.module.css';

/** Help text and the core's warnings for one field (clamped, adjusted). */
export function FieldNotes({
  help,
  warnings,
}: {
  help?: string | undefined;
  warnings?: readonly Warning[] | undefined;
}) {
  return (
    <>
      {help ? <div className={styles.help}>{help}</div> : null}
      {warnings?.map((w, i) => (
        <div key={i} className={styles.warning} role="status">
          ⚠ {w.message}
        </div>
      ))}
    </>
  );
}
