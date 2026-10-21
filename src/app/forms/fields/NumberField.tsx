/**
 * A numeric parameter: Radix slider plus a number input.
 *
 * Pointer drags are transient edits (draft builds, one undo step) committed
 * on release. Radix commits keyboard steps *before* it reports the change, so
 * without a pointer down every change is a commit and `onValueCommit` is
 * ignored. A drag released where it started gets no commit from Radix and is
 * ended on pointer-up instead.
 *
 * The number input commits values inside [min, max] as you type and any
 * number on blur / Enter (out-of-range values are clamped by the core, whose
 * warning then shows under the field).
 */
import { Slider } from 'radix-ui';
import { useRef, useState } from 'react';
import type { Warning } from '@core/model/assembly.ts';
import type { NumberParamDef } from '@core/schema/defs.ts';
import { FieldNotes } from './FieldNotes.tsx';
import styles from './fields.module.css';

export interface NumberFieldProps {
  def: NumberParamDef;
  /** Prefix of the input's element id (default `p-`). */
  idPrefix?: string | undefined;
  value: number;
  warnings?: readonly Warning[] | undefined;
  onTransient(value: number): void;
  onCommit(value: number): void;
  /** A transient edit ended without a final value. */
  onEnd(): void;
}

export function NumberField({
  def,
  idPrefix = 'p-',
  value,
  warnings,
  onTransient,
  onCommit,
  onEnd,
}: NumberFieldProps) {
  const id = `${idPrefix}${def.key}`;
  const [draft, setDraft] = useState<string | null>(null);
  const pointerDown = useRef(false);
  const dragging = useRef(false);
  const inRange = (n: number) => n >= def.min && n <= def.max;

  const releasePointer = () => {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    // Radix commits (or not) synchronously after this handler; end the drag
    // ourselves only if it did not.
    queueMicrotask(() => {
      if (!dragging.current) return;
      dragging.current = false;
      onEnd();
    });
  };

  return (
    <div className={styles.param}>
      <label className={styles.label} htmlFor={id}>
        {def.label}
        {def.unit ? <span className={styles.unit}>{def.unit}</span> : null}
      </label>
      <Slider.Root
        className={styles.slider}
        min={def.min}
        max={def.max}
        step={def.step}
        value={[Math.min(def.max, Math.max(def.min, value))]}
        onPointerDown={() => {
          pointerDown.current = true;
        }}
        onPointerUp={releasePointer}
        onLostPointerCapture={releasePointer}
        onValueChange={([v]) => {
          if (v === undefined) return;
          setDraft(null);
          if (pointerDown.current) {
            dragging.current = true;
            onTransient(v);
          } else {
            onCommit(v);
          }
        }}
        onValueCommit={([v]) => {
          if (v === undefined || !dragging.current) return;
          dragging.current = false;
          onCommit(v);
        }}
      >
        <Slider.Track className={styles.track}>
          <Slider.Range className={styles.range} />
        </Slider.Track>
        <Slider.Thumb className={styles.thumb} aria-label={def.label} />
      </Slider.Root>
      <input
        id={id}
        className={styles.number}
        type="number"
        min={def.min}
        max={def.max}
        step={def.step}
        value={draft ?? String(value)}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const n = parseFloat(text);
          if (Number.isFinite(n) && inRange(n) && n !== value) onCommit(n);
        }}
        onBlur={() => {
          if (draft === null) return;
          const n = parseFloat(draft);
          if (Number.isFinite(n) && n !== value) onCommit(n);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <FieldNotes help={def.help} warnings={warnings} />
    </div>
  );
}
