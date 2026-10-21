/**
 * The assembly / print sheet: one Markdown document per lamp, shown in the
 * app's print-sheet dialog (rendered with `marked`, printable) and written
 * into the ZIP export as `print-sheet.md`.
 *
 * Sections: title, date and share link; the lamp and the printer; the parts
 * table (copies, colour, grams, triangles, print orientation, joints); what
 * else to buy (derived from the light, the mount and the screw joints); the
 * assembly steps of the mount; printing tips; each part's file and print
 * notes; the warnings.
 *
 * Pure and deterministic: the same input gives the same text (no clock, no
 * random ids, no locale). Text from the project (its name, a custom
 * printer's name) is escaped, so it cannot inject Markdown or HTML.
 */
import { SHADE_JOINT_ID } from '../assembly/interfaces.ts';
import { CANOPY_SCREW_SLOT } from '../assembly/mounts/ceilingCord.ts';
import { LID_TO_BASE_JOINT_ID, STEM_TO_BASE_JOINT_ID } from '../assembly/mounts/standing.ts';
import { ARM_TO_PLATE_JOINT_ID, KEYHOLE } from '../assembly/mounts/wallArm.ts';
import { deriveBase } from '../geometry/parts/base.ts';
import type { Quality } from '../geometry/quality.ts';
import type {
  Assembly,
  GeometryStats,
  JointInterface,
  PartSpec,
  Severity,
} from '../model/assembly.ts';
import type { LightInsert } from '../model/parts.ts';
import type { Project } from '../model/project.ts';
import { MOUNT_LABELS } from '../schema/defs.ts';
import { printerLabel, type PrinterSpec } from '../schema/printers.ts';
import { partFileName } from './naming.ts';

/** The print sheet's name inside the ZIP export. */
export const PRINT_SHEET_FILE = 'print-sheet.md';

/** What the sheet reads of a part's build stats. */
export type SheetStats = Pick<GeometryStats, 'estGramsPla' | 'triangles'>;

export interface PrintSheetInput {
  project: Project;
  /** The assembly to describe (the app passes the export-quality one). */
  assembly: Assembly;
  printer: PrinterSpec;
  /** Build stats by part id; parts without stats show "—". */
  stats?: Readonly<Record<string, SheetStats | undefined>> | undefined;
  /** A link that reopens the lamp. */
  shareUrl?: string | undefined;
  /** The sheet's date (ISO; only the day is shown). Default: when the project last changed. */
  date?: string | undefined;
  /** The quality `stats` were built at, when it may differ from the export quality. */
  statsQuality?: Quality | undefined;
}

type Part = PartSpec;
type HubPart = Extract<PartSpec, { kind: 'hub' }>;

/** Bulk density of steel shot and of dry sand, g/cm³. */
const STEEL_SHOT_DENSITY = 4.5;
const DRY_SAND_DENSITY = 1.6;
/** Screw lengths the mounts' print notes ask for, by joint id, mm. */
const SCREW_LENGTHS: Readonly<Record<string, number>> = {
  [STEM_TO_BASE_JOINT_ID]: 8,
  [ARM_TO_PLATE_JOINT_ID]: 10,
  [LID_TO_BASE_JOINT_ID]: 6,
};

// ---------------------------------------------------------------- formatting

/** A length, rounded to 0.1 mm: `68.2`, `40`. */
const mm = (n: number): string => String(Math.round(n * 10) / 10);

const ceilTo = (n: number, step: number): number => Math.ceil(n / step - 1e-9) * step;

/** An integer with thousands separators: `25,344`. */
export function grouped(n: number): string {
  const digits = String(Math.round(Math.abs(n)));
  return (n < 0 ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A mass: `450 g`, `1.2 kg`. */
function mass(grams: number): string {
  return grams < 1000 ? `${ceilTo(grams, 10)} g` : `${mm(grams / 1000)} kg`;
}

/**
 * Plain text as Markdown text: whitespace runs become one space and the
 * characters Markdown or HTML would read (`* _ [ ] < > | ~ & \` and the
 * backtick) are backslash-escaped.
 */
export function mdText(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[\\`*_[\]<>|~&]/g, '\\$&');
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/**
 * A rough name for a colour, so the plain-text sheet says what filament to
 * load: neutrals by lightness (`warm white`, `light grey`, `black`), else the
 * hue (`cream`, `brown`, `dark blue`, …).
 */
export function colourName(hex: string): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  if (!Number.isFinite(n)) return 'colour';
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 510;
  const chroma = (max - min) / 255;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const warm = h >= 15 && h < 75;
  if (chroma < 0.1) {
    const base =
      l > 0.9
        ? 'white'
        : l > 0.7
          ? 'light grey'
          : l > 0.4
            ? 'grey'
            : l > 0.15
              ? 'dark grey'
              : 'black';
    return chroma >= 0.03 && warm && l > 0.15 ? `warm ${base}` : base;
  }
  if (warm && l > 0.75 && chroma < 0.35) return 'cream';
  if (h >= 15 && h < 50 && l < 0.45) return 'brown';
  const hue =
    h < 15 || h >= 345
      ? 'red'
      : h < 45
        ? 'orange'
        : h < 70
          ? 'yellow'
          : h < 165
            ? 'green'
            : h < 195
              ? 'teal'
              : h < 255
                ? 'blue'
                : h < 290
                  ? 'purple'
                  : 'pink';
  return l > 0.75 ? `light ${hue}` : l < 0.3 ? `dark ${hue}` : hue;
}

/** A link destination without the characters that would end it. */
const linkUrl = (url: string): string => url.replace(/[\s()<>]/g, (c) => encodeURIComponent(c));

// ---------------------------------------------------------------- the lamp

/** The hub part of a split lamp. */
function hubOf(assembly: Assembly): HubPart | undefined {
  return assembly.parts.find((p): p is HubPart => p.kind === 'hub');
}

function partOf<K extends Part['kind']>(
  assembly: Assembly,
  kind: K,
): Extract<Part, { kind: K }> | undefined {
  return assembly.parts.find((p): p is Extract<Part, { kind: K }> => p.kind === kind);
}

/** The hub and shade printed as one piece (the classic shade). */
function isFused(assembly: Assembly): boolean {
  return assembly.parts.some((p) => p.kind === 'shade' && p.params.variant === 'fused');
}

/** The light as the hub was built for it (normalised); undefined for the fused shade. */
function lightInsertOf(assembly: Assembly): LightInsert | undefined {
  return hubOf(assembly)?.params.insert;
}

/** The light in a few words. */
function lightSummary(project: Project, assembly: Assembly): string {
  const light = project.light;
  const insert = lightInsertOf(assembly);
  switch (light.kind) {
    case 'puck': {
      const d = insert?.kind === 'puck' ? insert.diameter : light.diameter;
      const h = insert?.kind === 'puck' ? insert.height : light.height;
      return light.preset === 'bambu-kit-001'
        ? `USB LED puck (Bambu Lab LED Lamp Kit-001, Ø${mm(d)} × ${mm(h)} mm)`
        : `USB LED puck Ø${mm(d)} × ${mm(h)} mm`;
    }
    case 'bulb':
      return `${light.size} LED bulb in a lampholder (${light.fitting === 'shadeRing' ? 'shade ring' : 'M10 nipple'})`;
    case 'strip': {
      const ring = insert?.kind === 'strip' ? insert.ringDiameter : light.ringDiameter;
      const w = insert?.kind === 'strip' ? insert.stripWidth : light.stripWidth;
      return `${mm(w)} mm LED strip in a Ø${mm(ring)} mm ring`;
    }
  }
}

/** The mount in a few words. */
function mountSummary(project: Project, assembly: Assembly): string {
  const m = project.mount;
  switch (m.kind) {
    case 'ceilingStrap':
      return 'Velcro strap on the ceiling';
    case 'ceilingCord':
      return `${MOUNT_LABELS.ceilingCord} (${mm(m.dropLength)} mm drop, ${m.grip === 'knot' ? 'knotted in the canopy' : 'collet and cord grip'})`;
    case 'wallArm':
      return `${MOUNT_LABELS.wallArm} (${m.arm.shape}, ${mm(m.arm.length)} mm)`;
    case 'standing': {
      const segments = stemSegments(assembly);
      return `${m.variant === 'floor' ? 'Floor' : 'Table'} lamp (${mm(m.stem.totalHeight)} mm stem in ${segments} ${plural(segments, 'segment')})`;
    }
  }
}

/** Stem segments of a standing lamp (the foot included). */
function stemSegments(assembly: Assembly): number {
  return assembly.parts.filter((p) => p.kind === 'stem').reduce((n, p) => n + p.instances, 0);
}

/** The joint's kind and size in a few words. */
function jointLabel(j: JointInterface): string {
  switch (j.type) {
    case 'bayonet':
      return 'bayonet';
    case 'snap':
      return 'press fit';
    case 'thread':
      return `thread Ø${mm(j.nominalDiameter)} × ${mm(j.thread?.pitch ?? 0)}`;
    case 'screw':
      return `${j.screw?.count ?? 0} × M3`;
  }
}

function jointSummary(assembly: Assembly): string {
  if (isFused(assembly)) return 'hub and shade printed as one piece';
  const j = assembly.interfaces[SHADE_JOINT_ID];
  if (!j) return 'hub only';
  return `shade on a ${j.type === 'snap' ? 'press-fit' : jointLabel(j)} joint`;
}

/** A part's name inside a sentence ("the Stem segment", not "the Stem segment ×2"). */
const partName = (p: Pick<Part, 'displayName'>): string => p.displayName.replace(/\s×\d+$/, '');

/** The part's joints with the other exported parts. */
function jointsCell(part: Part, assembly: Assembly): string {
  const names = new Map(assembly.parts.map((p) => [p.id, partName(p)]));
  const out: string[] = [];
  for (const j of Object.values(assembly.interfaces)) {
    const male = j.male === part.id;
    const other = male ? j.female : j.female === part.id ? j.male : undefined;
    const otherName = other === undefined ? undefined : names.get(other);
    if (otherName === undefined) continue;
    const label = jointLabel(j);
    if (male) {
      out.push(`${label} into the ${otherName}`);
    } else {
      const fixing =
        j.type === 'screw' ? (j.screw?.insertPocket ? ' (heat-set inserts)' : ' (tapped)') : '';
      out.push(`${label}${fixing} for the ${otherName}`);
    }
  }
  return out.length > 0 ? out.join('; ') : '—';
}

/** "Print as exported: open end on the bed, collar up. …" → "Open end on the bed, collar up". */
function orientation(notes: readonly string[]): string {
  const first = notes.find((n) => n.startsWith('Print as exported'));
  if (!first) return 'As exported';
  const rest = first.replace(/^Print as exported:?\s*/, '');
  const end = rest.search(/\.(\s|$)/);
  const text = (end >= 0 ? rest.slice(0, end) : rest).trim();
  return text ? capitalise(text) : 'As exported';
}

// ---------------------------------------------------------------- what else to buy

/** Fill volume of the base's weight pocket above its lid, cm³. */
function weightVolume(assembly: Assembly): number | undefined {
  const base = partOf(assembly, 'base');
  if (!base) return undefined;
  const d = deriveBase(base.params);
  const spoke = base.params.cableGroove.spokeWidth;
  const area = Math.PI * (d.rOut ** 2 - d.rIn ** 2) - spoke * (d.rOut - d.rIn);
  const height = d.pocketDepth - d.lidThickness;
  return area > 0 && height > 0 ? (area * height) / 1000 : undefined;
}

/** The light's own parts to buy. */
function lightItems(project: Project, assembly: Assembly): string[] {
  const light = project.light;
  const insert = lightInsertOf(assembly);
  switch (light.kind) {
    case 'puck': {
      const d = insert?.kind === 'puck' ? insert.diameter : light.diameter;
      const h = insert?.kind === 'puck' ? insert.height : light.height;
      return [
        light.preset === 'bambu-kit-001'
          ? `1 × USB LED puck: Bambu Lab LED Lamp Kit-001 (Ø${mm(d)} × ${mm(h)} mm) or any puck of that size, with its USB cable`
          : `1 × USB LED puck Ø${mm(d)} × ${mm(h)} mm, with its USB cable`,
        '1 × USB power adapter (5 V)',
      ];
    }
    case 'bulb': {
      const b = insert?.kind === 'bulb' ? insert : undefined;
      const hole = b?.holeDiameter ?? light.holeDiameter;
      const holder =
        light.fitting === 'shadeRing'
          ? `1 × ${light.size} lampholder with a threaded sleeve for the Ø${mm(hole)} mm hole and its shade ring`
          : `1 × ${light.size} lampholder with an M10 × 1 threaded nipple, and 1 × M10 nut (16 mm across flats)`;
      return [
        holder,
        `1 × ${light.size} LED bulb, at most Ø${mm(b?.bulbDiameter ?? light.bulbDiameter)} × ${mm(b?.height ?? light.bulbLength)} mm (LED only: no incandescent or halogen bulbs)`,
      ];
    }
    case 'strip': {
      const s = insert?.kind === 'strip' ? insert : undefined;
      const ring = s?.ringDiameter ?? light.ringDiameter;
      const width = s?.stripWidth ?? light.stripWidth;
      return [
        `1 × LED strip ${mm(width)} mm wide, about ${ceilTo(Math.PI * (ring + width), 10)} mm long (a bendable S-type strip lies flat in the ring)`,
        '1 × power supply matching the strip (5 V or 12 V)',
      ];
    }
  }
}

/** What carries the power from the outlet to the light (the cord or cable of a mount). */
function cableKind(project: Project): string {
  switch (project.light.kind) {
    case 'puck':
      return "the puck's USB cable or a USB extension";
    case 'bulb':
      return 'a 2-core mains cord set with a plug and a switch (or wired to the outlet by a qualified person)';
    case 'strip':
      return "the strip's power cable or an extension";
  }
}

/** The mount's hardware to buy, and the cable through it. */
function mountItems(project: Project, assembly: Assembly): string[] {
  const m = project.mount;
  const cable = cableKind(project);
  switch (m.kind) {
    case 'ceilingStrap': {
      const rBoss = assembly.derived.rBoss ?? 32.6;
      const patch = Math.ceil(2 * rBoss);
      const length = ceilTo(2 * rBoss + 2 * m.loopLength + 40, 10);
      return [
        `1 × self-adhesive velcro (hook-and-loop) strip for the ceiling, at least ${mm(m.strapWidth)} × ${patch} mm`,
        `1 × strip of the mating velcro, ${mm(m.strapWidth)} mm wide and about ${length} mm long (trim the tails)`,
      ];
    }
    case 'ceilingCord': {
      const canopy = partOf(assembly, 'canopy');
      const spacing = canopy?.params.screwSpacing ?? m.canopy.screwSpacing;
      const slot = CANOPY_SCREW_SLOT;
      return [
        `Cord Ø${mm(m.cordDiameter)} mm, at least ${ceilTo(m.dropLength + 200, 50)} mm (the ${mm(m.dropLength)} mm drop and the knots) plus the run from the canopy to the power: ${cable}`,
        `2 × ceiling screws up to Ø${mm(slot.width - 0.5)} mm with heads up to Ø${mm(slot.headDiameter)} mm, and wall plugs, for the canopy's slots (${mm(spacing)} mm apart)`,
      ];
    }
    case 'wallArm': {
      const plate = partOf(assembly, 'wallPlate');
      const spacing = plate?.params.keyholes.spacing ?? m.plate.keyholeSpacing;
      return [
        `2 × wall screws up to Ø${mm(KEYHOLE.slotWidth - 0.5)} mm with heads up to Ø${mm(KEYHOLE.headDiameter - 0.5)} mm, and wall anchors, ${mm(spacing)} mm apart on a vertical line`,
        `Cable Ø${mm(m.arm.cableDiameter)} mm, at least ${ceilTo(m.arm.length + m.plate.height / 2 + 200, 50)} mm through the arm plus the run to the power: ${cable}`,
      ];
    }
    case 'standing': {
      const items: string[] = [];
      const volume = weightVolume(assembly);
      if (volume !== undefined) {
        items.push(
          `Weight for the base: about ${mass(volume * STEEL_SHOT_DENSITY)} of steel shot (or ${mass(volume * DRY_SAND_DENSITY)} of dry sand, or washers) to fill the pocket`,
        );
      }
      const base = partOf(assembly, 'base');
      const height = m.stem.totalHeight + (base?.params.height ?? m.base.height);
      const radius = (base?.params.diameter ?? m.base.diameter) / 2;
      items.push(
        `Cable Ø${mm(m.stem.cableDiameter)} mm, at least ${ceilTo(height + radius + 200, 50)} mm through the stem and out of the base plus the run to the power: ${cable}`,
      );
      return items;
    }
  }
}

/** Screws and heat-set inserts of the screw joints between exported parts. */
function screwItems(assembly: Assembly): string[] {
  const ids = new Set(assembly.parts.map((p) => p.id));
  const names = new Map(assembly.parts.map((p) => [p.id, partName(p)]));
  const items: string[] = [];
  let inserts = 0;
  for (const j of Object.values(assembly.interfaces)) {
    if (j.type !== 'screw' || !j.screw || !ids.has(j.male) || !ids.has(j.female)) continue;
    const length = SCREW_LENGTHS[j.id];
    items.push(
      `${j.screw.count} × M3${length ? ` × ${length}` : ''} screws (${names.get(j.male)} to ${names.get(j.female)})`,
    );
    if (j.screw.insertPocket) inserts += j.screw.count;
  }
  if (inserts > 0)
    items.push(`${inserts} × M3 heat-set inserts (and a soldering iron to set them)`);
  return items;
}

/**
 * Everything the lamp needs that is not printed: the light and its power,
 * the mount's hardware (velcro, cord and canopy screws, wall screws and
 * anchors, weights, cables) and the screws and inserts of its screw joints.
 */
export function nonPrintedItems(input: Pick<PrintSheetInput, 'project' | 'assembly'>): string[] {
  const { project, assembly } = input;
  return [
    ...lightItems(project, assembly),
    ...mountItems(project, assembly),
    ...screwItems(assembly),
  ];
}

// ---------------------------------------------------------------- assembly steps

const QUALIFIED = 'mains wiring: have it done by a qualified person';

/** Fitting the light into the hub, for the hub's mount face. */
function lightSteps(project: Project, assembly: Assembly): string[] {
  const light = project.light;
  const hub = hubOf(assembly);
  const face = hub?.params.mountFace.kind ?? 'strap';
  const insert = hub?.params.insert;
  const threaded = face === 'threadMale' || face === 'threadFemale';
  switch (light.kind) {
    case 'puck':
      if (face === 'strap') {
        return [
          'Drop the LED puck into the pocket from the top, diffuser facing down into the shade, and lay its cable out through the slot in the housing wall.',
        ];
      }
      if (face === 'cordBoss') {
        return [
          "Feed the cord down through the hub's cord boss, pull it out through the light opening, tie a knot and pull it back up into the knot cavity.",
          'Press the LED puck into the hub from the light face until it stops; the crush ribs hold it.',
        ];
      }
      return [
        "Press the LED puck into the hub from the light face until it stops (the crush ribs hold it); its cable runs through the bore in the hub's mount face.",
      ];
    case 'bulb': {
      const hole = mm(insert?.kind === 'bulb' ? insert.holeDiameter : light.holeDiameter);
      const holder = `the ${light.size} lampholder`;
      if (light.fitting === 'm10Nipple') {
        const nipple = `Screw ${holder}'s M10 × 1 nipple up through the Ø${hole} mm hole into the M10 nut in the hub's plate.`;
        return face === 'cordBoss'
          ? [
              nipple,
              `Feed the cord down through the hub's cord boss and the nipple into the lampholder, fix it in the lampholder's cord grip and wire it (${QUALIFIED}).`,
            ]
          : [
              nipple,
              `Pass the cable through the bore in the hub's mount face and the nipple, and wire the lampholder (${QUALIFIED}).`,
            ];
      }
      const sleeve = `pass its threaded sleeve through the Ø${hole} mm hole in the hub's plate and screw its shade ring on from the light face, so the plate is clamped`;
      if (face === 'cordBoss') {
        return [
          "Feed the cord down through the hub's cord boss and tie a knot that sits in the knot cavity (reach in through the hole in the hub's plate).",
          `Wire ${holder} to the cord (${QUALIFIED}), then ${sleeve}.`,
        ];
      }
      return [
        `Pass the cable through the bore in the hub's mount face and wire ${holder} (${QUALIFIED}), then ${sleeve}.`,
      ];
    }
    case 'strip': {
      const stick =
        "Stick the LED strip into the ring channel on the hub's light face, adhesive side on the channel's ceiling, and feed its cable up through the slot in the channel.";
      if (face === 'cordBoss') {
        return [
          stick,
          "The cord is the strip's power cable: feed it down through the hub's cord boss, tie a knot that sits in the knot cavity (reach in through the opening in the middle of the light face) and lead it out through the side opening of the boss over the disc to the strip.",
        ];
      }
      if (threaded) {
        return [
          stick,
          "Lead the cable over the disc into the boss through its side opening and through the bore in the hub's mount face.",
        ];
      }
      return [stick, 'Run the cable over the disc and out over the rim, under the strap.'];
    }
  }
}

/** Hanging the shade on the hub, by joint type (none when fused or without a shade). */
function shadeStep(assembly: Assembly): string[] {
  const j = assembly.interfaces[SHADE_JOINT_ID];
  if (isFused(assembly) || !j || !assembly.parts.some((p) => p.id === j.male)) return [];
  switch (j.type) {
    case 'bayonet':
      return [
        "Fit the shade to the hub: push its lugs into the slots of the hub's ring and turn it clockwise (seen from the shade's open end) until it stops.",
      ];
    case 'snap':
      return ["Press the shade's collar all the way into the hub's ring; the crush ribs hold it."];
    case 'thread':
      return ["Screw the shade into the hub's ring, clockwise seen from the shade's open end."];
    case 'screw':
      return [];
  }
}

/** The bulb goes in last. */
function bulbStep(project: Project): string[] {
  const light = project.light;
  if (light.kind !== 'bulb') return [];
  return [
    `Screw in an ${light.size} LED bulb, at most Ø${mm(light.bulbDiameter)} × ${mm(light.bulbLength)} mm (LED bulbs only).`,
  ];
}

/** The steps from the parts to the mounted lamp, per mount. */
export function assemblySteps(input: Pick<PrintSheetInput, 'project' | 'assembly'>): string[] {
  const { project, assembly } = input;
  if (project.fitTest) {
    return [
      isFused(assembly)
        ? 'This is a fit-test export: print the pieces, try the light and the mount as their notes describe, and adjust the clearances before printing the whole lamp.'
        : 'This is a fit-test export: print the collar and the ring test piece, join them as their notes describe, and adjust the joint clearance before printing the whole lamp.',
    ];
  }
  const heatSet = project.joints.heatSet;
  const light = lightSteps(project, assembly);
  const shade = shadeStep(assembly);
  const bulb = bulbStep(project);
  const m = project.mount;
  switch (m.kind) {
    case 'ceilingStrap':
      return [
        'Stick the self-adhesive hook strip (or the loop strip, either way round) to the ceiling.',
        ...light,
        'Thread a strip of the mating velcro down through one side tunnel, across the top of the housing (over the back of the puck) and down through the other tunnel. The strap keeps the puck in; trim the tails.',
        ...shade,
        'Press the lamp against the ceiling strip. To take it down, peel it off.',
      ];
    case 'ceilingCord': {
      const spacing = partOf(assembly, 'canopy')?.params.screwSpacing ?? m.canopy.screwSpacing;
      const power =
        project.light.kind === 'bulb'
          ? `connect the cable at the ceiling outlet (${QUALIFIED})`
          : 'run the cable on to the power supply';
      return [
        ...light,
        m.grip === 'knot'
          ? `Feed the other end of the cord up through the canopy's cord hole and tie a knot ${mm(m.dropLength)} mm above the hub, so it sits in the canopy's recess.`
          : `Feed the other end of the cord up through the canopy's collet neck, screw the cord grip on loosely, set the drop to ${mm(m.dropLength)} mm and tighten the grip.`,
        `Screw the canopy to the ceiling through its two slots (${mm(spacing)} mm apart) with the screws and wall plugs; ${power}.`,
        ...shade,
        ...bulb,
      ];
    }
    case 'wallArm': {
      const spacing =
        partOf(assembly, 'wallPlate')?.params.keyholes.spacing ?? m.plate.keyholeSpacing;
      return [
        `Mark two holes ${mm(spacing)} mm apart on a vertical line, drill them and set the wall anchors; drive the screws in, leaving their heads about 3 mm proud.`,
        heatSet
          ? "Press four M3 heat-set inserts into the pockets on the wall plate's front face, flush."
          : "Tap the four holes on the wall plate's front face for M3 screws.",
        "Feed the cable in through the arm's flange and out of the threaded bore at its end.",
        ...light,
        'Screw the hub onto the arm, clockwise seen from below.',
        "Screw the arm's flange to the plate with four M3 × 10 screws, the cable lying in the plate's slot.",
        'Hang the plate on the two screws (heads through the keyholes, then slide it down); the cable leaves through the slot at its bottom edge.',
        ...shade,
        ...bulb,
      ];
    }
    case 'standing': {
      const segments = stemSegments(assembly);
      const volume = weightVolume(assembly);
      const weight =
        volume === undefined
          ? ' with steel shot, dry sand or washers'
          : ` with about ${mass(volume * STEEL_SHOT_DENSITY)} of steel shot (or ${mass(volume * DRY_SAND_DENSITY)} of dry sand)`;
      const lid =
        m.base.lid === 'screws'
          ? 'fix it with three M3 × 6 screws into the bosses'
          : 'press it in, notch over the spoke; the crush ribs hold it';
      return [
        heatSet
          ? "Press four M3 heat-set inserts into the pockets in the base's top face."
          : "The stem's screws tap into the four holes in the base's top face.",
        `Turn the base over, fill the weight pocket${weight} and close it with the lid: ${lid}.`,
        "Screw the stem foot's flange onto the base with four M3 × 8 screws.",
        segments > 1
          ? 'Feed the cable up through the base and the stem foot, then through each stem segment, screwing each onto the one below (clockwise seen from above) until the shoulders meet.'
          : 'Feed the cable up through the base and the stem.',
        ...light,
        'Screw the hub onto the top of the stem, clockwise seen from above.',
        ...shade,
        'Lay the cable in the groove under the base and out through the notch in its rim.',
        ...bulb,
      ];
    }
  }
}

// ---------------------------------------------------------------- printing

/** General printing tips for this lamp. */
export function printingNotes(
  input: Pick<PrintSheetInput, 'project' | 'assembly' | 'printer'>,
): string[] {
  const { project, assembly, printer } = input;
  const nozzle = printer.nozzle;
  const notes = [
    `${mm(nozzle)} mm nozzle, 0.2 mm layers (0.12 mm for finer ribs). Every part prints as exported, without supports.`,
  ];
  const walls = [
    ...new Set(assembly.parts.flatMap((p) => (p.kind === 'shade' ? [p.params.wallThickness] : []))),
  ];
  if (walls.length > 0) {
    const perimeters = (w: number) => Math.max(1, Math.round(w / nozzle));
    const which = walls
      .map((w) => `${mm(w)} mm wall (${perimeters(w)} ${plural(perimeters(w), 'perimeter')})`)
      .join(', ');
    const best = walls.every((w) => Math.abs(w - 0.8) < 1e-9)
      ? ', which diffuses the light best, and no infill'
      : ' and no infill; a 0.8 mm wall (two 0.4 mm perimeters) diffuses the light best';
    notes.push(
      `Shades: a ${which}${best}. White or "Jade White" PLA spreads the light most evenly.`,
    );
  }
  if (project.light.kind === 'bulb' && hubOf(assembly)) {
    notes.push(
      'Print the hub in PETG: PLA softens near 60 °C, and even an LED bulb warms the hub.',
    );
  }
  if (assembly.parts.some((p) => p.kind === 'cordGrip')) {
    notes.push(
      'Print the cord grip in PETG: it is tightened onto the collet and stays under load.',
    );
  }
  notes.push(
    assembly.parts.some((p) => p.kind === 'wallArm')
      ? 'No brim on the shades (brim marks show under light): a smooth PEI plate and a slow first layer hold the thin wall. The wall arm is the exception: give the tall part a brim.'
      : 'No brim (brim marks show under light): a smooth PEI plate and a slow first layer hold the thin wall.',
  );
  notes.push(
    `Exported at ${project.quality.export} quality: draft is for quick test prints, normal is plenty for printing, fine gives smoother ribs and much larger files.`,
  );
  return notes;
}

// ---------------------------------------------------------------- the sheet

const SEVERITY_MARK: Readonly<Record<Severity, string>> = {
  error: '✖ Error:',
  warning: '⚠',
  info: 'ℹ',
};

function partsTable(input: PrintSheetInput): string[] {
  const { assembly, stats = {} } = input;
  const rows = [
    '| Part | Qty | Colour | PLA | Triangles | Print orientation | Joints |',
    '| :-- | --: | :-- | --: | --: | :-- | :-- |',
  ];
  let copies = 0;
  let grams = 0;
  let allStats = assembly.parts.length > 0;
  for (const part of assembly.parts) {
    const s = stats[part.id];
    copies += part.instances;
    if (s) grams += s.estGramsPla * part.instances;
    else allStats = false;
    const cells = [
      mdText(part.displayName),
      String(part.instances),
      `${colourName(part.colour)} \`${part.colour}\``,
      s ? `${grouped(s.estGramsPla * part.instances)} g` : '—',
      s ? grouped(s.triangles) : '—',
      mdText(orientation(part.printNotes)),
      mdText(jointsCell(part, assembly)),
    ];
    rows.push(`| ${cells.join(' | ')} |`);
  }
  rows.push(
    `| **Total** | **${copies}** |  | ${allStats ? `**${grouped(grams)} g**` : '—'} |  |  |  |`,
  );
  return rows;
}

function statsNote(input: PrintSheetInput): string {
  const { project, assembly, stats = {} } = input;
  const any = assembly.parts.some((p) => stats[p.id]);
  if (!any) {
    return 'PLA: estimated weight of all copies; "—" until the part is built in openlamp. Triangles: of one STL.';
  }
  const q = input.statsQuality;
  const from =
    q && q !== project.quality.export
      ? ` Weights and triangles are of the ${q} preview build; the STL files are exported at ${project.quality.export} quality.`
      : '';
  return `PLA: estimated weight of all copies (PLA density; PETG is about 3 % heavier). Triangles: of one STL.${from}`;
}

/** The whole print sheet as Markdown (see the module comment). Pure and deterministic. */
export function renderPrintSheet(input: PrintSheetInput): string {
  const { project, assembly, printer } = input;
  const meta = { name: project.name, id: project.id };
  const day = (input.date ?? project.updatedAt).slice(0, 10);
  const parts = assembly.parts;
  const out: string[] = [];
  const line = (s = '') => out.push(s);
  const list = (items: readonly string[], ordered = false) => {
    items.forEach((item, i) => line(`${ordered ? `${i + 1}.` : '-'} ${item}`));
    line();
  };

  line(`# ${mdText(project.name.trim() || 'Untitled lamp')}`);
  line();
  line(
    `Print sheet · ${mdText(day)}${input.shareUrl ? ` · [Open this lamp in openlamp](${linkUrl(input.shareUrl)})` : ''}`,
  );
  line();
  const multi = printer.multiColour
    ? `, multi-colour${printer.notes ? ` (${mdText(printer.notes)})` : ''}`
    : '';
  const files = parts.length === 1 ? '1 STL file' : `${parts.length} STL files, one per part`;
  list([
    `**Lamp:** ${mdText(mountSummary(project, assembly))}; ${mdText(lightSummary(project, assembly))}; ${jointSummary(assembly)}`,
    `**Printer:** ${mdText(printerLabel(printer))}, bed ${printer.bed.map(mm).join(' × ')} mm, ${mm(printer.nozzle)} mm nozzle${multi}`,
    `**Export:** ${files}, at ${project.quality.export} quality${project.fitTest ? ' (fit-test pieces only)' : ''}`,
  ]);

  line('## Parts');
  line();
  for (const row of partsTable(input)) line(row);
  line();
  line(statsNote(input));
  line();

  line('## Also needed');
  line();
  list(nonPrintedItems(input).map(mdText));

  line('## Assembly');
  line();
  list(assemblySteps(input).map(mdText), true);

  line('## Printing');
  line();
  list(printingNotes(input).map(mdText));

  for (const part of parts) {
    line(`### ${mdText(part.displayName)}`);
    line();
    const copies = part.instances > 1 ? ` · print ${part.instances} copies` : '';
    line(`File: \`${partFileName(meta, part, 'stl')}\`${copies}`);
    line();
    if (part.printNotes.length > 0) list(part.printNotes.map(mdText));
  }

  line('## Warnings');
  line();
  const seen = new Set<string>();
  const warnings = assembly.warnings.filter((w) => !seen.has(w.message) && seen.add(w.message));
  if (warnings.length === 0) {
    line('None.');
    line();
  } else {
    list(warnings.map((w) => `${SEVERITY_MARK[w.severity]} ${mdText(w.message)}`));
  }
  line('---');
  line();
  line('Made with openlamp, https://jahoefne.github.io/openlamp/');
  return `${out.join('\n')}\n`;
}
