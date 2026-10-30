import type { ReactNode } from 'react';
import type { Warning } from '@core/model/assembly.ts';
import { FieldNotes } from '../forms/fields/FieldNotes.tsx';
import styles from './Inspector.module.css';
import { nordicLettering } from '../brand/lettering.ts';

/** Native keyboard disclosure; notes stay visible even when its fields are collapsed. */
export function InspectorSection({
  title,
  description,
  warnings = [],
  children,
}: {
  title: string;
  description: string;
  warnings?: readonly Warning[];
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-label={`${title} settings`}>
      <details>
        <summary
          className={styles.sectionSummary}
          aria-label={`${title}: ${description}${warnings.length ? `. ${warnings.length} parameter ${warnings.length === 1 ? 'note' : 'notes'}` : ''}`}
        >
          <span>
            <span className={styles.sectionTitle}>{nordicLettering(title)}</span>
            <span className={styles.sectionHint}>{description}</span>
          </span>
          {warnings.length > 0 && (
            <span
              className={styles.noteCount}
              data-warning={warnings.some((w) => w.severity !== 'info')}
            >
              {warnings.length} {warnings.length === 1 ? 'note' : 'notes'}
            </span>
          )}
        </summary>
        <div className={styles.sectionBody}>{children}</div>
      </details>
      {warnings.length > 0 && (
        <div className={styles.sectionNotes}>
          <FieldNotes warnings={warnings} />
        </div>
      )}
    </section>
  );
}
