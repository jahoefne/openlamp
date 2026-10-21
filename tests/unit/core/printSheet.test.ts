/**
 * The print sheet: a snapshot per example (no stats, a fixed share link), the
 * parts table with and without stats, the non-printed items each light and
 * mount implies, the assembly steps per mount, the printing notes, escaping
 * of project text and the colour names.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { standingDefaults } from '@core/assembly/mounts/standing.ts';
import { partFileName } from '@core/export/naming.ts';
import {
  PRINT_SHEET_FILE,
  assemblySteps,
  colourName,
  grouped,
  mdText,
  nonPrintedItems,
  printingNotes,
  renderPrintSheet,
  type PrintSheetInput,
} from '@core/export/printSheet.ts';
import type { Assembly } from '@core/model/assembly.ts';
import {
  createDefaultProject,
  defaultMount,
  lightDefaults,
  parseProject,
  type Mount,
  type Project,
} from '@core/model/project.ts';

const dir = new URL('../../../src/examples/', import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.lamp.json'))
  .sort();

const SHARE = 'https://jahoefne.github.io/openlamp/#p=TEST';

const read = (file: string) => parseProject(readFileSync(new URL(file, dir), 'utf8'));

function input(project: Project, extra: Partial<PrintSheetInput> = {}): PrintSheetInput {
  const assembly = assemble(project, { quality: project.quality.export });
  return { project, assembly, printer: project.printer, shareUrl: SHARE, ...extra };
}

const sheet = (project: Project, extra: Partial<PrintSheetInput> = {}) =>
  renderPrintSheet(input(project, extra));

/** A split lamp (hub + shade) with this mount and light. */
function lamp(mount: Mount, light: Project['light'] = lightDefaults('puck')): Project {
  const p = createDefaultProject({
    id: 'test',
    name: 'Test lamp',
    updatedAt: '2026-10-21T00:00:00.000Z',
  });
  p.hub.fused = false;
  p.mount = mount;
  p.light = light;
  if (light.kind === 'bulb') p.hub.ventCount = 8;
  return p;
}

const items = (p: Project) => nonPrintedItems(input(p));
const steps = (p: Project) => assemblySteps(input(p));

it('is written into the ZIP as print-sheet.md', () => {
  expect(PRINT_SHEET_FILE).toBe('print-sheet.md');
});

describe.each(files)('the print sheet of %s', (file) => {
  const project = read(file);

  it('matches its snapshot', () => {
    expect(sheet(project)).toMatchSnapshot();
  });

  it('is deterministic and names every part, its copies and its STL file', () => {
    const md = sheet(project);
    expect(sheet(project)).toBe(md);
    const { parts } = assemble(project, { quality: project.quality.export });
    expect(md.startsWith(`# ${mdText(project.name)}\n`)).toBe(true);
    for (const part of parts) {
      expect(md).toContain(`| ${part.displayName} | ${part.instances} |`);
      expect(md).toContain(`File: \`${partFileName(project, part, 'stl')}\``);
    }
    expect(md).toContain(`[Open this lamp in openlamp](${SHARE})`);
    expect(md).toContain('## Also needed');
    expect(md).toContain('## Assembly');
  });
});

describe('the parts table', () => {
  const project = read('pendant-cord.lamp.json');
  const { assembly } = input(project);

  it('shows grams of all copies and triangles from the stats, with the total', () => {
    const stats = {
      hub: { estGramsPla: 31.4, triangles: 25344 },
      shade: { estGramsPla: 52.2, triangles: 123456 },
      canopy: { estGramsPla: 18.6, triangles: 4096 },
    };
    const md = sheet(project, { stats });
    expect(md).toContain(
      '| Hub | 1 | warm light grey `#d9d4cb` | 31 g | 25,344 | Collar ring on the bed, mount face up | bayonet for the Shade |',
    );
    expect(md).toContain(
      '| Shade | 1 | cream `#efe3cf` | 52 g | 123,456 | Open end on the bed, collar up | bayonet into the Hub |',
    );
    expect(md).toContain('| **Total** | **3** |  | **102 g** |');
    expect(md).not.toContain('preview build');
  });

  it('shows "—" without stats and says where partial stats come from', () => {
    expect(sheet(project)).toContain('| Canopy | 1 | warm light grey `#d9d4cb` | — | — |');
    const md = sheet(project, {
      stats: { hub: { estGramsPla: 30, triangles: 100 } },
      statsQuality: 'draft',
    });
    expect(md).toContain('| **Total** | **3** |  | — |');
    expect(md).toContain(
      'of the draft preview build; the STL files are exported at normal quality',
    );
    expect(
      sheet(project, {
        stats: { hub: { estGramsPla: 30, triangles: 100 } },
        statsQuality: 'normal',
      }),
    ).not.toContain('preview build');
  });

  it('counts the copies of an instanced part (the stem segments)', () => {
    const floor = lamp(standingDefaults('floor'));
    const md = sheet(floor);
    const { parts } = input(floor).assembly;
    const segment = parts.find((p) => p.id === 'stem')!;
    expect(segment.instances).toBeGreaterThan(1);
    expect(md).toContain(`| ${segment.displayName} | ${segment.instances} |`);
    expect(md).toContain(`· print ${segment.instances} copies`);
    const total = parts.reduce((n, p) => n + p.instances, 0);
    expect(md).toContain(`| **Total** | **${total}** |`);
  });

  it('lists the joints with the other parts', () => {
    const md = sheet(lamp(defaultMount('wallArm')));
    expect(md).toMatch(/\| Hub \|.*bayonet for the Shade; thread Ø16 × 2\.5 into the Wall arm \|/);
    expect(md).toMatch(/\| Wall plate \|.*4 × M3 \(heat-set inserts\) for the Wall arm \|/);
    expect(assembly.interfaces.shadeToHub?.type).toBe('bayonet');
  });
});

describe('the non-printed items', () => {
  it('velcro strap: the puck, its power and the velcro', () => {
    const list = items(createDefaultProject({ name: 'Classic' }));
    expect(list).toEqual([
      expect.stringContaining('Bambu Lab LED Lamp Kit-001'),
      '1 × USB power adapter (5 V)',
      expect.stringMatching(/self-adhesive velcro .* for the ceiling, at least 25 × 66 mm/),
      expect.stringMatching(/mating velcro, 25 mm wide and about \d+ mm long/),
    ]);
  });

  it('pendant: the cord and the canopy screws; no screws for joints, no inserts', () => {
    const list = items(lamp(defaultMount('ceilingCord'))).join('\n');
    expect(list).toMatch(/Cord Ø4 mm, at least 800 mm .*: the puck's USB cable/);
    expect(list).toContain('2 × ceiling screws up to Ø4 mm with heads up to Ø9 mm, and wall plugs');
    expect(list).not.toContain('M3');
  });

  it('E27 bulb: the lampholder with its shade ring, an LED bulb, a mains cord set', () => {
    const list = items(lamp(defaultMount('ceilingCord'), lightDefaults('bulb', 'E27'))).join('\n');
    expect(list).toContain(
      '1 × E27 lampholder with a threaded sleeve for the Ø40.5 mm hole and its shade ring',
    );
    expect(list).toContain('1 × E27 LED bulb, at most Ø60 × 110 mm (LED only');
    expect(list).toContain('2-core mains cord set');
    expect(list).not.toContain('USB');
  });

  it('E14 bulb on an M10 nipple: the nipple and its nut', () => {
    const list = items(
      lamp(defaultMount('wallArm'), lightDefaults('bulb', 'E14', 'm10Nipple')),
    ).join('\n');
    expect(list).toContain('1 × E14 lampholder with an M10 × 1 threaded nipple, and 1 × M10 nut');
    expect(list).toContain('1 × E14 LED bulb');
  });

  it('LED strip: the strip (its length from the ring) and a 5 / 12 V supply', () => {
    const list = items(lamp(defaultMount('ceilingCord'), lightDefaults('strip'))).join('\n');
    // π × (120 + 10) ≈ 408 → about 410 mm.
    expect(list).toContain('1 × LED strip 10 mm wide, about 410 mm long');
    expect(list).toContain('1 × power supply matching the strip (5 V or 12 V)');
    expect(list).toContain("the strip's power cable");
  });

  it('wall arm: wall anchors, the arm screws and their heat-set inserts', () => {
    const list = items(lamp(defaultMount('wallArm')));
    expect(list.join('\n')).toMatch(
      /2 × wall screws .* and wall anchors, 60 mm apart on a vertical line/,
    );
    expect(list).toContain('4 × M3 × 10 screws (Wall arm to Wall plate)');
    expect(list).toContain('4 × M3 heat-set inserts (and a soldering iron to set them)');
  });

  it('without heat-set inserts the screws tap into plain holes', () => {
    const p = lamp(defaultMount('wallArm'));
    p.joints.heatSet = false;
    const list = items(p);
    expect(list).toContain('4 × M3 × 10 screws (Wall arm to Wall plate)');
    expect(list.join('\n')).not.toContain('inserts');
    expect(steps(p).join('\n')).toContain('Tap the four holes');
  });

  it('standing lamp: the weight for the base, the flange screws and inserts; lid screws when screwed', () => {
    const p = lamp(defaultMount('standing'));
    const list = items(p);
    expect(list.join('\n')).toMatch(
      /Weight for the base: about [\d.]+ k?g of steel shot \(or [\d.]+ k?g of dry sand/,
    );
    expect(list).toContain('4 × M3 × 8 screws (Stem foot to Base)');
    expect(list).toContain('4 × M3 heat-set inserts (and a soldering iron to set them)');
    expect(list.join('\n')).not.toContain('Base lid to Base');

    p.mount = {
      ...defaultMount('standing'),
      base: { ...defaultMount('standing').base, lid: 'screws' },
    };
    const screwed = items(p);
    expect(screwed).toContain('3 × M3 × 6 screws (Base lid to Base)');
    // The lid's screws tap into bosses: still only the flange's four inserts.
    expect(screwed).toContain('4 × M3 heat-set inserts (and a soldering iron to set them)');
  });

  it('a floor lamp needs more weight than a table lamp', () => {
    const weight = (p: Project) => {
      const line = items(p).find((s) => s.startsWith('Weight'))!;
      const [, value, unit] = /about ([\d.]+) (k?g) of steel/.exec(line)!;
      return Number(value) * (unit === 'kg' ? 1000 : 1);
    };
    expect(weight(lamp(standingDefaults('floor')))).toBeGreaterThan(
      weight(lamp(standingDefaults('table'))),
    );
  });
});

describe('the assembly steps', () => {
  it('velcro strap: the README steps, with the shade joint only when split', () => {
    const fused = createDefaultProject({ name: 'Classic' });
    const s = steps(fused);
    expect(s).toHaveLength(4);
    expect(s[0]).toMatch(/^Stick the self-adhesive hook strip/);
    expect(s[1]).toMatch(/^Drop the LED puck into the pocket from the top/);
    expect(s[2]).toMatch(/^Thread a strip of the mating velcro/);
    expect(s[3]).toMatch(/^Press the lamp against the ceiling strip/);
    const split = steps(lamp(defaultMount('ceilingStrap')));
    expect(split).toHaveLength(5);
    expect(split[3]).toMatch(/^Fit the shade to the hub: push its lugs/);
  });

  it('pendant: the cord knotted in the hub, the puck, the canopy knot and screws, the shade', () => {
    const s = steps(lamp(defaultMount('ceilingCord'))).join('\n');
    expect(s).toMatch(/cord boss.*knot cavity/);
    expect(s).toContain('Press the LED puck into the hub');
    expect(s).toContain("tie a knot 600 mm above the hub, so it sits in the canopy's recess");
    expect(s).toContain('Screw the canopy to the ceiling through its two slots (60 mm apart)');
    expect(s).toMatch(/Fit the shade to the hub/);
  });

  it('pendant with a collet: the grip sets the drop', () => {
    const mount = { ...defaultMount('ceilingCord'), grip: 'collet' as const };
    const p = lamp(mount);
    expect(steps(p).join('\n')).toContain('screw the cord grip on loosely, set the drop to 600 mm');
    expect(printingNotes(input(p))).toContain(
      'Print the cord grip in PETG: it is tightened onto the collet and stays under load.',
    );
  });

  it('wall arm: anchors, inserts, cable through the arm, hub screwed in, arm screwed to the plate, plate hung', () => {
    const s = steps(lamp(defaultMount('wallArm')));
    const at = (re: RegExp) => s.findIndex((x) => re.test(x));
    const order = [
      /wall anchors/,
      /heat-set inserts/,
      /through the arm's flange/,
      /Screw the hub onto the arm/,
      /arm's flange to the plate/,
      /Hang the plate/,
      /Fit the shade/,
    ].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('standing lamp: weights and lid, stem segments screwed together, hub, cable through the base', () => {
    const s = steps(lamp(defaultMount('standing')));
    const at = (re: RegExp) => s.findIndex((x) => re.test(x));
    const order = [
      /heat-set inserts/,
      /fill the weight pocket/,
      /stem foot's flange/,
      /through each stem segment/,
      /Screw the hub onto the top of the stem/,
      /Fit the shade/,
      /groove under the base/,
    ].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('a bulb: mains wiring by a qualified person, the LED bulb last', () => {
    const s = steps(lamp(defaultMount('ceilingCord'), lightDefaults('bulb', 'E27')));
    expect(s.join('\n')).toContain('have it done by a qualified person');
    expect(s.at(-1)).toBe('Screw in an E27 LED bulb, at most Ø60 × 110 mm (LED bulbs only).');
  });

  it('fit test: one step pointing at the pieces', () => {
    const p = lamp(defaultMount('ceilingCord'));
    p.fitTest = true;
    expect(steps(p)).toEqual([expect.stringMatching(/^This is a fit-test export/)]);
    expect(sheet(p)).toContain('(fit-test pieces only)');
  });
});

describe('the printing notes', () => {
  it('0.8 mm walls, white PLA, no brim, the quality', () => {
    const notes = printingNotes(input(read('bell-default.lamp.json'))).join('\n');
    expect(notes).toContain(
      'a 0.8 mm wall (2 perimeters), which diffuses the light best, and no infill.',
    );
    expect(notes).toContain('"Jade White" PLA');
    expect(notes).toContain('No brim');
    expect(notes).toContain('Exported at normal quality: draft');
  });

  it('PETG for a bulb hub', () => {
    const notes = printingNotes(input(lamp(defaultMount('ceilingCord'), lightDefaults('bulb'))));
    expect(notes.join('\n')).toContain('Print the hub in PETG');
  });

  it('a brim for the wall arm only', () => {
    expect(printingNotes(input(lamp(defaultMount('wallArm')))).join('\n')).toContain(
      'give the tall part a brim',
    );
    expect(printingNotes(input(lamp(defaultMount('ceilingCord')))).join('\n')).not.toContain(
      'give the tall part a brim',
    );
  });
});

describe('warnings', () => {
  it('lists the assembly warnings once each, or "None."', () => {
    expect(sheet(read('bell-default.lamp.json'))).toContain('## Warnings\n\nNone.\n');
    const p = lamp(defaultMount('ceilingStrap'), lightDefaults('bulb'));
    const md = sheet(p);
    expect(md).toContain('✖ Error: The velcro strap holds LED pucks only');
    const assembly: Assembly = input(p).assembly;
    for (const w of assembly.warnings) {
      expect(md.split(mdText(w.message)).length - 1).toBe(1);
    }
  });
});

describe('escaping', () => {
  it('shows a hostile project name as text, not as HTML or a link', () => {
    const p = createDefaultProject({
      name: '<img src=x onerror=alert(1)> [x](javascript:alert(1)) | *b*',
    });
    const md = sheet(p);
    const title = md.split('\n')[0]!;
    expect(title).toBe(
      '# \\<img src=x onerror=alert(1)\\> \\[x\\](javascript:alert(1)) \\| \\*b\\*',
    );
    expect(md).not.toMatch(/(^|[^\\])<img/);
    expect(md).not.toMatch(/(^|[^\\])\[x\]/);
  });

  it('mdText collapses whitespace and escapes Markdown and HTML characters', () => {
    expect(mdText('a\n  b')).toBe('a b');
    expect(mdText('A & B_c`d~e')).toBe('A \\& B\\_c\\`d\\~e');
  });
});

describe('helpers', () => {
  it('colourName gives a rough filament colour', () => {
    expect(colourName('#ffffff')).toBe('white');
    expect(colourName('#f4efe6')).toBe('warm white');
    expect(colourName('#d9d4cb')).toBe('warm light grey');
    expect(colourName('#efe3cf')).toBe('cream');
    expect(colourName('#3a3835')).toBe('dark grey');
    expect(colourName('#000000')).toBe('black');
    expect(colourName('#c0392b')).toBe('red');
    expect(colourName('#1e5aa8')).toBe('blue');
    expect(colourName('#2e7d32')).toBe('green');
    expect(colourName('#6d4c41')).toBe('brown');
  });

  it('grouped writes thousands separators', () => {
    expect(grouped(0)).toBe('0');
    expect(grouped(999)).toBe('999');
    expect(grouped(25344)).toBe('25,344');
    expect(grouped(1234567.4)).toBe('1,234,567');
  });

  it('uses the date it is given, else the project change date', () => {
    const p = read('pendant-cord.lamp.json');
    expect(sheet(p)).toContain('Print sheet · 2026-10-21 ·');
    expect(sheet(p, { date: '2027-01-02' })).toContain('Print sheet · 2027-01-02 ·');
    expect(sheet(p, { shareUrl: undefined })).toContain('Print sheet · 2026-10-21\n');
  });
});
