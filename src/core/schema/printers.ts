/**
 * Curated printer profiles for the bed-fit check and the plate layout. A custom
 * profile (id `custom`) is stored inline in the project.
 */

export interface PrinterSpec {
  id: string;
  vendor: string;
  name: string;
  /** Build volume X × Y × Z in mm. */
  bed: [x: number, y: number, z: number];
  /** Nozzle diameter in mm. */
  nozzle: number;
  /** Prints several colours in one job (AMS, MMU, tool changer, …). */
  multiColour: boolean;
  notes?: string | undefined;
}

export const CUSTOM_PRINTER_ID = 'custom';

const NOZZLE = 0.4;

function printer(
  id: string,
  vendor: string,
  name: string,
  bed: [number, number, number],
  multiColour: boolean,
  notes?: string,
): PrinterSpec {
  return notes === undefined
    ? { id, vendor, name, bed, nozzle: NOZZLE, multiColour }
    : { id, vendor, name, bed, nozzle: NOZZLE, multiColour, notes };
}

const cube = (n: number): [number, number, number] => [n, n, n];

export const PRINTERS: readonly PrinterSpec[] = Object.freeze([
  printer('bambu-a1-mini', 'Bambu Lab', 'A1 mini', cube(180), true, 'AMS lite'),
  printer('bambu-a1', 'Bambu Lab', 'A1', cube(256), true, 'AMS lite'),
  printer('bambu-p1p', 'Bambu Lab', 'P1P', cube(256), true, 'AMS'),
  printer('bambu-p1s', 'Bambu Lab', 'P1S', cube(256), true, 'AMS'),
  printer('bambu-x1c', 'Bambu Lab', 'X1 Carbon', cube(256), true, 'AMS'),
  printer('bambu-h2d', 'Bambu Lab', 'H2D (single nozzle)', [325, 320, 325], true, 'AMS'),
  printer('bambu-h2d-dual', 'Bambu Lab', 'H2D (both nozzles)', [300, 320, 325], true, 'AMS'),
  printer('prusa-mini', 'Prusa Research', 'MINI+', cube(180), false),
  printer('prusa-mk3s', 'Prusa Research', 'i3 MK3S+', [250, 210, 210], false, 'MMU optional'),
  printer('prusa-mk4', 'Prusa Research', 'MK4 / MK4S', [250, 210, 220], false, 'MMU3 optional'),
  printer('prusa-core-one', 'Prusa Research', 'CORE One', [250, 220, 270], false, 'MMU3 optional'),
  printer('prusa-xl', 'Prusa Research', 'XL', cube(360), true, 'Tool changer'),
  printer('creality-ender3-v3-se', 'Creality', 'Ender-3 V3 SE', [220, 220, 250], false),
  printer('creality-ender3-v3-ke', 'Creality', 'Ender-3 V3 KE', [220, 220, 240], false),
  printer('creality-k1', 'Creality', 'K1', cube(220), false),
  printer('creality-k1-max', 'Creality', 'K1 Max', cube(300), false),
  printer('creality-k2-plus', 'Creality', 'K2 Plus', cube(350), true, 'CFS'),
  printer('elegoo-neptune4', 'Elegoo', 'Neptune 4 / 4 Pro', [225, 225, 265], false),
  printer('elegoo-neptune4-plus', 'Elegoo', 'Neptune 4 Plus', [320, 320, 385], false),
  printer('elegoo-neptune4-max', 'Elegoo', 'Neptune 4 Max', [420, 420, 480], false),
  printer('elegoo-centauri-carbon', 'Elegoo', 'Centauri Carbon', cube(256), false),
  printer('voron-0.2', 'Voron', 'Voron 0.2', cube(120), false),
  printer('voron-2.4-250', 'Voron', 'Voron 2.4 (250)', cube(250), false),
  printer('voron-2.4-300', 'Voron', 'Voron 2.4 (300)', cube(300), false),
  printer('voron-2.4-350', 'Voron', 'Voron 2.4 (350)', cube(350), false),
  printer('anycubic-kobra2', 'Anycubic', 'Kobra 2', [220, 220, 250], false),
  printer('anycubic-kobra3', 'Anycubic', 'Kobra 3', [250, 250, 260], true, 'ACE'),
  printer('anycubic-kobra-s1', 'Anycubic', 'Kobra S1', cube(250), true, 'ACE Pro'),
]);

export const DEFAULT_PRINTER_ID = 'bambu-a1';

/** A copy of the curated profile with this id, or undefined. */
export function findPrinter(id: string): PrinterSpec | undefined {
  const p = PRINTERS.find((x) => x.id === id);
  return p && { ...p, bed: [p.bed[0], p.bed[1], p.bed[2]] };
}

/** "Bambu Lab A1 mini" */
export function printerLabel(p: Pick<PrinterSpec, 'vendor' | 'name'>): string {
  return p.name.startsWith(p.vendor) ? p.name : `${p.vendor} ${p.name}`;
}
