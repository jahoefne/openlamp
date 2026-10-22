/**
 * The 3MF export: the package (three parts, content types, relationship),
 * the model (millimetres, one object per part, one base material per
 * distinct colour, pid/pindex, one build item per copy placed by the bed
 * layout, meshes as built) for real builds of the pendant and the table
 * lamp, overflowing parts beside the bed, and the writer's helpers on a
 * tetrahedron.
 */
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { layoutParts, packParts } from '@core/assembly/layout.ts';
import { archiveFileName } from '@core/export/naming.ts';
import {
  BESIDE_BED_GAP,
  OPENLAMP_3MF_NS,
  THREEMF_MIME,
  THREEMF_MODEL_CONTENT_TYPE,
  THREEMF_MODEL_PATH,
  copyName,
  displayColour,
  fmtCoord,
  lamp3mfModel,
  meshFor3mf,
  plateTransform,
  threeMfTransform,
  write3mf,
  writeLamp3mf,
  xmlEscape,
  type Built3mfPart,
  type ThreeMfModel,
} from '@core/export/threemf.ts';
import { buildPart } from '@core/geometry/build.ts';
import { dispose } from '@core/geometry/kernel.ts';
import type { Assembly, BBox, Mat4, PartStats } from '@core/model/assembly.ts';
import { parseProject, type Project } from '@core/model/project.ts';
import { getKernel } from '../../helpers/kernel.ts';

// ---------------------------------------------------------------- a small 3MF reader

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** The attributes of a start tag's attribute text, unescaped. */
function attrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]!] = unescapeXml(m[2]!);
  return out;
}

function metadataOf(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of xml.matchAll(/<metadata name="([^"]*)">([^<]*)<\/metadata>/g)) {
    out[unescapeXml(m[1]!)] = unescapeXml(m[2]!);
  }
  return out;
}

interface ParsedObject {
  attrs: Record<string, string>;
  metadata: Record<string, string>;
  vertices: number[][];
  triangles: number[][];
}

interface ParsedModel {
  model: Record<string, string>;
  metadata: Record<string, string>;
  materials: Record<string, string>;
  bases: Record<string, string>[];
  objects: ParsedObject[];
  items: Record<string, string>[];
}

/** Enough of a 3MF model reader for the tests (regular expressions over the writer's layout). */
function parseModel(xml: string): ParsedModel {
  const model = attrs(/<model ([^>]*)>/.exec(xml)?.[1] ?? '');
  const head = xml.slice(0, xml.indexOf('<resources>'));
  const materials = attrs(/<basematerials ([^>]*)>/.exec(xml)?.[1] ?? '');
  const bases = [...xml.matchAll(/<base ([^>]*)\/>/g)].map((m) => attrs(m[1]!));
  const objects = [...xml.matchAll(/<object ([^>]*)>([\s\S]*?)<\/object>/g)].map((m) => {
    const body = m[2]!;
    const group = /<metadatagroup>([\s\S]*?)<\/metadatagroup>/.exec(body)?.[1] ?? '';
    return {
      attrs: attrs(m[1]!),
      metadata: metadataOf(group),
      vertices: [...body.matchAll(/<vertex x="([^"]*)" y="([^"]*)" z="([^"]*)"\/>/g)].map((v) =>
        [v[1], v[2], v[3]].map(Number),
      ),
      triangles: [...body.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].map((t) =>
        [t[1], t[2], t[3]].map(Number),
      ),
    };
  });
  const build = xml.slice(xml.indexOf('<build>'));
  const items = [...build.matchAll(/<item ([^>]*)\/>/g)].map((m) => attrs(m[1]!));
  return { model, metadata: metadataOf(head), materials, bases, objects, items };
}

/** Unzip a 3MF: its file names in order and the model, parsed. */
function read3mf(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const xml = strFromU8(files[THREEMF_MODEL_PATH]!);
  return { files, names: Object.keys(files), xml, parsed: parseModel(xml) };
}

/** A 3MF `transform` attribute applied to a point (row vector times the 4×3 matrix). */
function applyTransform(transform: string, [x, y, z]: readonly number[]): number[] {
  const m = transform.split(' ').map(Number);
  expect(m).toHaveLength(12);
  return [0, 1, 2].map((j) => x! * m[j]! + y! * m[3 + j]! + z! * m[6 + j]! + m[9 + j]!);
}

const centre = (bb: BBox): number[] => [0, 1, 2].map((i) => (bb.min[i]! + bb.max[i]!) / 2);

/** Every directed edge exactly once and its reverse exactly once: a closed, consistently wound mesh. */
function expectClosed(triangles: readonly number[][], name: string): void {
  const edges = new Map<string, number>();
  for (const [a, b, c] of triangles) {
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = `${u}>${v}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of edges) {
    expect(n, `${name}: edge ${k}`).toBe(1);
    const [u, v] = k.split('>');
    expect(edges.get(`${v}>${u}`), `${name}: edge ${k} has no twin`).toBe(1);
  }
}

// ---------------------------------------------------------------- real lamps

const examples = new URL('../../../src/examples/', import.meta.url);
const example = (id: string): Project =>
  parseProject(readFileSync(new URL(`${id}.lamp.json`, examples), 'utf8'));

interface Lamp {
  project: Project;
  assembly: Assembly;
  built: (Built3mfPart & { stats: PartStats })[];
  bytes: Uint8Array;
}

/** Assemble and build at draft, as the worker's `3mf` export does. */
async function buildLamp(project: Project): Promise<Lamp> {
  const k = await getKernel();
  const assembly = assemble(project, { quality: 'draft' });
  const built = assembly.parts.map((part) => {
    const { manifold, stats } = buildPart(k, part, 'draft');
    try {
      expect(stats.status, part.id).toBe('NoError');
      return { part, mesh: meshFor3mf(manifold.getMesh()), bbox: stats.bbox, stats };
    } finally {
      dispose(manifold);
    }
  });
  const bytes = writeLamp3mf(built, assembly.layout, {
    title: project.name,
    printerName: 'Bambu Lab A1',
  });
  return { project, assembly, built, bytes };
}

describe('the pendant on a cord as a 3MF', () => {
  let lamp: Lamp;
  let pkg: ReturnType<typeof read3mf>;
  beforeAll(async () => {
    lamp = await buildLamp(example('pendant-cord'));
    pkg = read3mf(lamp.bytes);
  });

  it('is a ZIP of the content types, the relationships and the model', () => {
    expect([...lamp.bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(pkg.names).toEqual(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']);
    const types = strFromU8(pkg.files['[Content_Types].xml']!);
    expect(types).toContain(
      `<Default Extension="model" ContentType="${THREEMF_MODEL_CONTENT_TYPE}"/>`,
    );
    expect(types).toContain(
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    );
    const rels = strFromU8(pkg.files['_rels/.rels']!);
    expect(rels).toMatch(
      /<Relationship Target="\/3D\/3dmodel\.model" Id="rel0" Type="http:\/\/schemas\.microsoft\.com\/3dmanufacturing\/2013\/01\/3dmodel"\/>/,
    );
    // Deflated: much smaller than the model text.
    expect(lamp.bytes.length).toBeLessThan(pkg.xml.length / 2);
  });

  it('is in millimetres, core namespace, with title, application, printer and bed', () => {
    const { model, metadata } = pkg.parsed;
    expect(pkg.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<model ')).toBe(true);
    expect(model).toMatchObject({
      unit: 'millimeter',
      'xml:lang': 'en-US',
      xmlns: 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
      'xmlns:openlamp': OPENLAMP_3MF_NS,
    });
    expect(metadata).toEqual({
      Title: 'Pendant on a cord',
      Application: 'openlamp',
      'openlamp:bed': '256 256 256',
      'openlamp:printer': 'Bambu Lab A1',
    });
  });

  it('has one object per part, named and coloured like it', () => {
    const { objects, bases, materials } = pkg.parsed;
    const { parts } = lamp.assembly;
    expect(parts.map((p) => p.id)).toEqual(['hub', 'shade', 'canopy']);
    expect(objects.map((o) => o.attrs.name)).toEqual(parts.map((p) => p.displayName));
    expect(new Set(objects.map((o) => o.attrs.id)).size).toBe(objects.length);
    expect(objects.map((o) => o.attrs.type)).toEqual(['model', 'model', 'model']);
    // One base per distinct colour: the hub and the canopy share theirs.
    const colours = [...new Set(parts.map((p) => p.colour.toUpperCase() + 'FF'))];
    expect(bases.map((b) => b.displaycolor)).toEqual(colours);
    expect(bases).toHaveLength(2);
    expect(materials.id).toBe('1');
    for (const [i, o] of objects.entries()) {
      expect(o.attrs.id).not.toBe(materials.id);
      expect(o.attrs.pid).toBe(materials.id);
      const base = bases[Number(o.attrs.pindex)];
      expect(base?.displaycolor, o.attrs.name).toBe(`${parts[i]!.colour.toUpperCase()}FF`);
      expect(base?.name).toMatch(/^Colour \d \(#[0-9A-F]{6}\)$/);
    }
  });

  it('writes each mesh as built: counts, coordinates to 3 decimals, closed', () => {
    for (const [i, o] of pkg.parsed.objects.entries()) {
      const { mesh, stats, part } = lamp.built[i]!;
      expect(o.triangles.length, part.id).toBe(stats.triangles);
      expect(o.triangles.length, part.id).toBe(mesh.indices.length / 3);
      expect(o.vertices.length, part.id).toBe(mesh.positions.length / 3);
      expect(o.vertices.length, part.id).toBe(stats.vertices);
      for (const v of [0, 1, o.vertices.length >> 1, o.vertices.length - 1]) {
        for (const axis of [0, 1, 2]) {
          expect(Math.abs(o.vertices[v]![axis]! - mesh.positions[v * 3 + axis]!)).toBeLessThan(
            5.01e-4,
          );
        }
      }
      expect(o.triangles[0]).toEqual([...Array.from(mesh.indices).slice(0, 3)]);
      expectClosed(o.triangles, part.id);
    }
  });

  it('places one item per copy where the bed layout puts it, standing on the bed', () => {
    const { items, objects } = pkg.parsed;
    const { layout, parts } = lamp.assembly;
    expect(layout.overflow).toEqual([]);
    expect(items).toHaveLength(parts.reduce((n, p) => n + p.instances, 0));
    expect(items).toHaveLength(layout.placements.length);
    for (const [i, p] of layout.placements.entries()) {
      const item = items[i]!;
      const index = parts.findIndex((x) => x.id === p.id);
      expect(item.objectid).toBe(objects[index]!.attrs.id);
      expect(item.partnumber).toBe(parts[index]!.displayName);
      const { bbox } = lamp.built[index]!;
      // Not turned: the identity rotation, and the box's centre on the placement.
      expect(p.rotated).toBe(false);
      expect(item.transform!.split(' ').slice(0, 9).map(Number)).toEqual([
        1, 0, 0, 0, 1, 0, 0, 0, 1,
      ]);
      const [x, y] = applyTransform(item.transform!, centre(bbox));
      expect(x).toBeCloseTo(p.x, 5);
      expect(y).toBeCloseTo(p.y, 5);
      expect(applyTransform(item.transform!, bbox.min)[2]).toBeCloseTo(0, 6);
      // The translation is the placement minus the box's centre.
      const t = item.transform!.split(' ').slice(9).map(Number);
      expect(t[0]).toBeCloseTo(p.x - centre(bbox)[0]!, 5);
      expect(t[1]).toBeCloseTo(p.y - centre(bbox)[1]!, 5);
      // Every copy inside the bed.
      expect(x! - p.width / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(x! + p.width / 2).toBeLessThanOrEqual(layout.bed[0] + 1e-6);
      expect(y! - p.depth / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(y! + p.depth / 2).toBeLessThanOrEqual(layout.bed[1] + 1e-6);
    }
    // Nothing overflows: no object says so.
    for (const o of objects) expect(o.metadata).toEqual({});
  });

  it('is named openlamp-<project>.3mf, model/3mf', () => {
    expect(archiveFileName(lamp.project, '3mf')).toBe('openlamp-pendant-on-a-cord.3mf');
    expect(THREEMF_MIME).toBe('model/3mf');
  });
});

describe('the table lamp (100 mm stem segments) as a 3MF', () => {
  let lamp: Lamp;
  let pkg: ReturnType<typeof read3mf>;
  beforeAll(async () => {
    const project = example('table-lamp');
    if (project.mount.kind !== 'standing') throw new Error('the table lamp stands');
    project.mount.stem.segmentLength = 100;
    lamp = await buildLamp(project);
    pkg = read3mf(lamp.bytes);
  });

  it('writes the three identical stem segments as one object with three items', () => {
    const { parts } = lamp.assembly;
    const stem = parts.find((p) => p.id === 'stem');
    expect(stem?.instances).toBe(3);
    const { objects, items } = pkg.parsed;
    expect(objects).toHaveLength(parts.length);
    const object = objects[parts.indexOf(stem!)]!;
    expect(object.attrs.name).toBe('Stem segment ×3');
    const copies = items.filter((it) => it.objectid === object.attrs.id);
    expect(copies.map((it) => it.partnumber)).toEqual([
      'Stem segment',
      'Stem segment #2',
      'Stem segment #3',
    ]);
    expect(items).toHaveLength(parts.reduce((n, p) => n + p.instances, 0));
    // Three places: the copies do not share a translation.
    expect(new Set(copies.map((it) => it.transform)).size).toBe(3);
  });

  it('puts the parts that do not fit beside the bed and marks their objects', () => {
    const { layout, parts } = lamp.assembly;
    const [bedX] = layout.bed;
    expect(layout.overflow.length).toBeGreaterThan(0);
    const { unplaced } = packParts(
      parts.map((p) => ({
        id: p.id,
        x: p.bedFootprint!.x,
        y: p.bedFootprint!.y,
        instances: p.instances,
      })),
      layout.bed,
    );
    const outside = new Set([...unplaced].map((p) => `${p.id}#${p.instance}`));
    const { items, objects } = pkg.parsed;
    let sideY = 0;
    for (const [i, p] of layout.placements.entries()) {
      const index = parts.findIndex((x) => x.id === p.id);
      const [x, y] = applyTransform(items[i]!.transform!, centre(lamp.built[index]!.bbox));
      if (outside.has(`${p.id}#${p.instance}`)) {
        // A column at +x, front to back.
        expect(x).toBeCloseTo(bedX + BESIDE_BED_GAP + p.width / 2, 5);
        expect(y).toBeCloseTo(sideY + p.depth / 2, 5);
        sideY += p.depth + BESIDE_BED_GAP;
      } else {
        expect(x).toBeCloseTo(p.x, 5);
        expect(y).toBeCloseTo(p.y, 5);
      }
    }
    for (const [i, part] of parts.entries()) {
      const meta = objects[i]!.metadata;
      if (layout.overflow.includes(part.id)) {
        expect(meta['openlamp:overflow'], part.id).toMatch(/Does not fit the 256 × 256 mm bed/);
      } else {
        expect(meta, part.id).toEqual({});
      }
    }
  });

  it('has one base per distinct colour (hub, shade and the dark structure)', () => {
    const { bases, objects } = pkg.parsed;
    expect(bases.map((b) => b.displaycolor)).toEqual(['#D9D4CBFF', '#F1E6D2FF', '#3A3835FF']);
    const byName = Object.fromEntries(objects.map((o) => [o.attrs.name, o.attrs.pindex]));
    expect(byName).toMatchObject({ Hub: '0', Shade: '1', Base: '2', 'Base lid': '2' });
  });
});

// ---------------------------------------------------------------- the writer on a tetrahedron

const TETRA = {
  positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10],
  indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
};

function tetraModel(extra: Partial<ThreeMfModel> = {}): ThreeMfModel {
  return {
    objects: [{ name: 'Tetra', mesh: TETRA, material: 0 }],
    materials: [{ name: 'Red', colour: '#f00' }],
    items: [{ object: 0, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1] }],
    meta: { title: 'Tetra' },
    ...extra,
  };
}

describe('write3mf', () => {
  it('writes vertices, triangles, the colour and the item', () => {
    const { parsed } = read3mf(write3mf(tetraModel()));
    expect(parsed.bases).toEqual([{ name: 'Red', displaycolor: '#FF0000FF' }]);
    expect(parsed.objects).toHaveLength(1);
    const [o] = parsed.objects;
    expect(o!.attrs).toEqual({ id: '2', type: 'model', name: 'Tetra', pid: '1', pindex: '0' });
    expect(o!.vertices).toEqual([
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [0, 0, 10],
    ]);
    expect(o!.triangles).toEqual([
      [0, 2, 1],
      [0, 1, 3],
      [0, 3, 2],
      [1, 2, 3],
    ]);
    expectClosed(o!.triangles, 'tetra');
    expect(parsed.items).toEqual([{ objectid: '2', transform: '1 0 0 0 1 0 0 0 1 5 6 7' }]);
    expect(parsed.metadata).toEqual({ Title: 'Tetra', Application: 'openlamp' });
  });

  it('escapes names and drops characters XML cannot hold', () => {
    const { xml, parsed } = read3mf(
      write3mf(
        tetraModel({
          objects: [{ name: 'Shade <"A & B">', mesh: TETRA, material: 0 }],
          meta: { title: `Lamp${String.fromCharCode(1)} & co` },
        }),
      ),
    );
    expect(xml).toContain('name="Shade &lt;&quot;A &amp; B&quot;&gt;"');
    expect(parsed.objects[0]!.attrs.name).toBe('Shade <"A & B">');
    expect(parsed.metadata.Title).toBe('Lamp\uFFFD & co');
  });

  it('refuses malformed meshes and indices out of range', () => {
    const bad = (extra: Partial<ThreeMfModel>) => () => write3mf(tetraModel(extra));
    expect(
      bad({
        objects: [{ name: 'T', mesh: { positions: [0, 0], indices: [0, 0, 0] }, material: 0 }],
      }),
    ).toThrow(/3 per vertex/);
    expect(
      bad({
        objects: [
          { name: 'T', mesh: { positions: TETRA.positions, indices: [0, 1, 4] }, material: 0 },
        ],
      }),
    ).toThrow(/beyond 4/);
    expect(bad({ objects: [{ name: 'T', mesh: TETRA, material: 1 }] })).toThrow(/no material 1/);
    expect(bad({ items: [{ object: 1, transform: [...TRANSLATE] }] })).toThrow(/object 1 of 1/);
    expect(bad({ items: [] })).toThrow(/at least one build item/);
    expect(bad({ materials: [{ name: 'X', colour: 'red' }] })).toThrow(/Not a colour/);
  });
});

const TRANSLATE: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('3MF helpers', () => {
  it('formats coordinates to 3 decimals without trailing zeros', () => {
    expect(fmtCoord(1.23456)).toBe('1.235');
    expect(fmtCoord(12.5)).toBe('12.5');
    expect(fmtCoord(3)).toBe('3');
    expect(fmtCoord(-0.0001)).toBe('0');
    expect(fmtCoord(-7.25)).toBe('-7.25');
    expect(fmtCoord(Math.fround(0.1))).toBe('0.1');
  });

  it('normalises colours to #RRGGBBAA', () => {
    expect(displayColour('#abc')).toBe('#AABBCCFF');
    expect(displayColour('#efe3cf')).toBe('#EFE3CFFF');
    expect(displayColour('#11223344')).toBe('#11223344');
    expect(() => displayColour('#12345')).toThrow(/Not a colour/);
  });

  it('escapes XML text', () => {
    expect(xmlEscape(`a&b<c>"d"`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;');
    expect(xmlEscape('tab\tok')).toBe('tab\tok');
    expect(xmlEscape(`x${String.fromCharCode(0xd800)}y`)).toBe('x\uFFFDy');
    expect(xmlEscape('🙂')).toBe('🙂');
  });

  it('writes a column-major matrix as the 3MF row-vector transform', () => {
    // A quarter turn about z, then a move by (10, 20, 30).
    const m: Mat4 = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1];
    expect(threeMfTransform(m)).toBe('0 1 0 -1 0 0 0 0 1 10 20 30');
    // (1, 0, 0) → (10, 21, 30): x turns into +y.
    expect(applyTransform(threeMfTransform(m), [1, 0, 0])).toEqual([10, 21, 30]);
    expect(() => threeMfTransform([1, 0, 0])).toThrow(/16 numbers/);
  });

  it('centres a copy on its placement, turned and standing on the bed', () => {
    const bbox: BBox = { min: [2, -4, 1], max: [12, 16, 31] };
    for (const rotated of [false, true]) {
      const t = threeMfTransform(plateTransform(bbox, 100, 50, rotated));
      const [cx, cy] = applyTransform(t, centre(bbox));
      expect(cx).toBeCloseTo(100, 9);
      expect(cy).toBeCloseTo(50, 9);
      expect(applyTransform(t, bbox.min)[2]).toBe(0);
      // The box's x extent (10) runs along y once turned.
      const [x0, y0] = applyTransform(t, [bbox.min[0], 0, 0]);
      const [x1, y1] = applyTransform(t, [bbox.max[0], 0, 0]);
      expect([Math.abs(x1! - x0!), Math.abs(y1! - y0!)]).toEqual(rotated ? [0, 10] : [10, 0]);
    }
  });

  it('names the copies of a part', () => {
    expect(copyName('Hub', 1, 0)).toBe('Hub');
    expect(copyName('Stem segment ×3', 3, 0)).toBe('Stem segment');
    expect(copyName('Stem segment ×3', 3, 2)).toBe('Stem segment #3');
    expect(copyName('Spacer', 4, 1)).toBe('Spacer #2');
  });

  it('merges the vertices manifold split for their properties', () => {
    // A tetrahedron whose vertex 0 is split in two (4 properties per vertex).
    const vertProperties = new Float32Array([
      0, 0, 0, 0.1, 10, 0, 0, 0.2, 0, 10, 0, 0.3, 0, 0, 10, 0.4, 0, 0, 0, 0.9,
    ]);
    const triVerts = new Uint32Array([0, 2, 1, 4, 1, 3, 4, 3, 2, 1, 2, 3]);
    const plain = meshFor3mf({ numProp: 4, vertProperties, triVerts });
    expect(plain.positions).toHaveLength(15);
    const merged = meshFor3mf({
      numProp: 4,
      vertProperties,
      triVerts,
      mergeFromVert: new Uint32Array([4]),
      mergeToVert: new Uint32Array([0]),
    });
    expect([...merged.positions]).toEqual(TETRA.positions);
    expect([...merged.indices]).toEqual(TETRA.indices);
    // Merging onto the later vertex keeps the earlier one all the same.
    const reversed = meshFor3mf({
      numProp: 4,
      vertProperties,
      triVerts,
      mergeFromVert: new Uint32Array([0]),
      mergeToVert: new Uint32Array([4]),
    });
    expect([...reversed.indices]).toEqual(TETRA.indices);
    expect(() =>
      meshFor3mf({ numProp: 4, vertProperties, triVerts: new Uint32Array([0, 1, 5]) }),
    ).toThrow(/beyond the vertices/);
  });

  it('puts a part larger than the bed beside it, and one that fits on the bed', () => {
    const tetra = (id: string, size: number): Built3mfPart => ({
      part: {
        id,
        displayName: id,
        colour: '#ffffff',
        instances: 1,
        bedFootprint: { x: size, y: size, z: 10 },
      },
      mesh: TETRA,
      bbox: { min: [0, 0, 0], max: [10, 10, 10] },
    });
    const parts = [tetra('big', 300), tetra('small', 10)];
    const layout = layoutParts(
      parts.map(({ part }) => ({ id: part.id, x: part.bedFootprint!.x, y: part.bedFootprint!.y })),
      [100, 100, 100],
    );
    expect(layout.overflow).toEqual(['big']);
    const model = lamp3mfModel(parts, layout, { title: 'x' });
    expect(model.objects[0]!.metadata).toEqual({
      'openlamp:overflow': 'Larger than the 100 × 100 mm bed: placed beside it',
    });
    expect(model.objects[1]!.metadata).toBeUndefined();
    const at = (i: number) =>
      applyTransform(threeMfTransform(model.items[i]!.transform), [5, 5, 0]);
    expect(at(0)).toEqual([100 + BESIDE_BED_GAP + 150, 150, 0]);
    expect(at(1)).toEqual([50, 50, 0]);
    expect(model.meta.metadata).toEqual({ 'openlamp:bed': '100 100 100' });
  });

  it('refuses a layout without a place for a part', () => {
    const part: Built3mfPart = {
      part: { id: 'a', displayName: 'A', colour: '#ffffff', instances: 1 },
      mesh: TETRA,
      bbox: { min: [0, 0, 0], max: [10, 10, 10] },
    };
    expect(() =>
      lamp3mfModel([part], { bed: [100, 100, 100], placements: [], overflow: [] }, { title: 'x' }),
    ).toThrow(/no place for a/);
  });
});
