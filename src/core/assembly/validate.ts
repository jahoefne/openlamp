/**
 * Project checks that warn without adjusting anything. Pure, no WASM.
 */
import type { Layout, PartSpec, Warning } from '../model/assembly.ts';
import { printerLabel, type PrinterSpec } from '../schema/printers.ts';

const mm = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * One `bed-fit` warning per part whose footprint exceeds the bed on some axis.
 * A part may be turned 90° about z to fit; the axes reported are those of the
 * better orientation.
 */
export function validateBedFit(parts: readonly PartSpec[], printer: PrinterSpec): Warning[] {
  const [bx, by, bz] = printer.bed;
  const warnings: Warning[] = [];
  for (const part of parts) {
    const f = part.bedFootprint;
    if (!f) continue;
    const turned = !(f.x <= bx && f.y <= by) && f.y <= bx && f.x <= by;
    const [x, y] = turned ? [f.y, f.x] : [f.x, f.y];
    const axes = [x > bx && 'X', y > by && 'Y', f.z > bz && 'Z'].filter(
      (a): a is string => typeof a === 'string',
    );
    if (axes.length === 0) continue;
    warnings.push({
      severity: 'warning',
      code: 'bed-fit',
      partId: part.id,
      message:
        `${part.displayName} (${mm(f.x)} × ${mm(f.y)} × ${mm(f.z)} mm) does not fit the ` +
        `${printerLabel(printer)} build volume (${bx} × ${by} × ${bz} mm): too large in ` +
        `${axes.join(' and ')}.`,
    });
  }
  return warnings;
}

/** An `info` for each part that fits the bed alone but not next to the others. */
export function validateLayout(layout: Layout, alreadyWarned: ReadonlySet<string>): Warning[] {
  return layout.overflow
    .filter((id) => !alreadyWarned.has(id))
    .map((id): Warning => ({
      severity: 'info',
      code: 'plate-overflow',
      partId: id,
      message: `${id} does not fit on the same plate as the other parts; print it separately.`,
    }));
}
