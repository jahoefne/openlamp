/**
 * 3MF export: a hand-rolled writer for the core specification (3MF Core 1.3,
 * namespace `core/2015/02`) and the lamp's plate on top of it.
 *
 * The package is an OPC ZIP (`zipFiles`, deflate level 6) of three parts:
 * `[Content_Types].xml`, `_rels/.rels` and `3D/3dmodel.model`. The model holds
 * one `<basematerials>` group with one `<base>` per distinct colour, one mesh
 * `<object>` per part (`pid`/`pindex` pick its colour) and one build `<item>`
 * per printed copy, whose transform puts the copy on the printer's bed.
 *
 * `write3mf` knows nothing of lamps; `lamp3mfModel` turns built parts and the
 * assembly's plate layout into its input: every copy in its print orientation
 * (the mesh exactly as the STL export writes it), turned 90° about z when the
 * layout turns it, centred on its placement by the mesh's bounding box and
 * standing on the bed (z = 0). Copies that do not fit the bed lie beside it
 * (+x, front to back), and their object says so in `openlamp:overflow`.
 *
 * Pure: no DOM and no TextEncoder (core runs on the plain ES library); text is
 * encoded as UTF-8 with fflate's `strToU8`.
 */
import { strToU8 } from 'fflate';
import { packParts } from '../assembly/layout.ts';
import type { BBox, Layout, Mat4, PartSpec } from '../model/assembly.ts';
import { zipFiles } from './zip.ts';

/** Which slicer the 3MF is tailored to; only `generic` (the core spec) is written so far. */
export type SlicerFlavour = 'generic' | 'bambu' | 'prusa';

export const SLICER_FLAVOURS: readonly SlicerFlavour[] = ['generic', 'bambu', 'prusa'];

/** The flavours `write3mf` can write. */
export const IMPLEMENTED_SLICER_FLAVOURS: readonly SlicerFlavour[] = ['generic'];

/** Media type of a .3mf file. */
export const THREEMF_MIME = 'model/3mf';

/** Content type of the 3D model part (`3D/3dmodel.model`). */
export const THREEMF_MODEL_CONTENT_TYPE = 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml';

/** Path of the model part inside the package. */
export const THREEMF_MODEL_PATH = '3D/3dmodel.model';

const CORE_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const MODEL_REL = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel';
/** Namespace of openlamp's own metadata names (`openlamp:bed`, `openlamp:overflow`, …). */
export const OPENLAMP_3MF_NS = 'https://jahoefne.github.io/openlamp/3mf/2026/10';

/** Gap between the bed and the copies beside it, and between those copies, mm (as the bed view). */
export const BESIDE_BED_GAP = 20;

/** The id of the one `<basematerials>` group; objects are numbered after it. */
const MATERIALS_ID = 1;

// ---------------------------------------------------------------- the writer's input

/** A triangle mesh: x, y, z per vertex and three vertex indices per triangle (CCW from outside). */
export interface ThreeMfMesh {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export interface ThreeMfMaterial {
  name: string;
  /** `#rgb`, `#rrggbb` or `#rrggbbaa`; written as `#RRGGBBAA` (alpha FF by default). */
  colour: string;
}

export interface ThreeMfObject {
  name: string;
  mesh: ThreeMfMesh;
  /** Index into `materials`. */
  material: number;
  /** Written into the object's `<metadatagroup>`; names other than the spec's well-known ones need the `openlamp:` prefix. */
  metadata?: Readonly<Record<string, string>> | undefined;
}

export interface ThreeMfItem {
  /** Index into `objects`. */
  object: number;
  /** Object frame → build platform (column-major 4×4; only affine transforms are valid). */
  transform: Mat4;
  /** Names this copy (`partnumber`). */
  partNumber?: string | undefined;
}

export interface ThreeMfMeta {
  /** The `Title` metadata (the project name). */
  title: string;
  /** The `Application` metadata (default `openlamp`). */
  application?: string | undefined;
  /** More model metadata, e.g. `{ 'openlamp:bed': '256 256 256' }`. */
  metadata?: Readonly<Record<string, string>> | undefined;
}

export interface ThreeMfModel {
  objects: readonly ThreeMfObject[];
  materials: readonly ThreeMfMaterial[];
  items: readonly ThreeMfItem[];
  meta: ThreeMfMeta;
}

// ---------------------------------------------------------------- XML helpers

/**
 * Characters XML 1.0 does not allow: C0 controls but tab, newline and return,
 * U+FFFE, U+FFFF and unpaired surrogates (with the `u` flag a surrogate pair
 * is one code point, so only lone halves match). They become U+FFFD.
 */
// eslint-disable-next-line no-control-regex -- matching the control characters is the point
const INVALID_XML = /[\0-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF\uD800-\uDFFF]/gu;

/** `s` as XML text or attribute value (quoted with `"`). */
export function xmlEscape(s: string): string {
  return s
    .replace(INVALID_XML, '\uFFFD')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A coordinate in mm rounded to 3 decimals, without trailing zeros (`12.5`, `0`, `-3.25`). */
export function fmtCoord(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/** A transform entry, rounded to 6 decimals. */
function fmtMatrix(v: number): string {
  return String(Math.round(v * 1e6) / 1e6);
}

/** `#rgb`, `#rrggbb` or `#rrggbbaa` → `#RRGGBBAA`; throws on anything else. */
export function displayColour(colour: string): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(colour.trim())?.[1];
  if (!hex) throw new Error(`Not a colour: "${colour}" (use #rrggbb)`);
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  return `#${full.toUpperCase()}${full.length === 6 ? 'FF' : ''}`;
}

/**
 * The 3MF `transform` attribute of a column-major 4×4 matrix: `m00 m01 m02 m10
 * m11 m12 m20 m21 m22 m30 m31 m32`, where row i of the 3MF matrix is the image
 * of basis vector i (3MF multiplies row vectors from the left), i.e. column i of
 * the column-major matrix; the last row is the translation.
 */
export function threeMfTransform(m: Mat4): string {
  if (m.length !== 16) throw new Error(`A transform needs 16 numbers, not ${m.length}`);
  const out: string[] = [];
  for (const col of [0, 1, 2, 3]) {
    for (const row of [0, 1, 2]) out.push(fmtMatrix(m[col * 4 + row]!));
  }
  return out.join(' ');
}

function metadataXml(name: string, value: string, indent: string): string {
  return `${indent}<metadata name="${xmlEscape(name)}">${xmlEscape(value)}</metadata>\n`;
}

/** The `<object>` element of one mesh, in chunks (vertices, then triangles). */
function objectXml(obj: ThreeMfObject, id: number, materials: number): string[] {
  const { positions, indices } = obj.mesh;
  if (positions.length % 3 !== 0) {
    throw new Error(`${obj.name}: ${positions.length} coordinates is not 3 per vertex`);
  }
  if (indices.length % 3 !== 0 || indices.length === 0) {
    throw new Error(`${obj.name}: ${indices.length} indices is not 3 per triangle`);
  }
  if (!Number.isInteger(obj.material) || obj.material < 0 || obj.material >= materials) {
    throw new Error(`${obj.name}: no material ${obj.material}`);
  }
  const numVert = positions.length / 3;
  const head = [
    `  <object id="${id}" type="model" name="${xmlEscape(obj.name)}" pid="${MATERIALS_ID}" pindex="${obj.material}">\n`,
  ];
  const meta = Object.entries(obj.metadata ?? {});
  if (meta.length > 0) {
    head.push('   <metadatagroup>\n');
    for (const [name, value] of meta) head.push(metadataXml(name, value, '    '));
    head.push('   </metadatagroup>\n');
  }
  head.push('   <mesh>\n    <vertices>\n');

  const vertices: string[] = new Array<string>(numVert);
  for (let v = 0, i = 0; v < numVert; v++, i += 3) {
    vertices[v] =
      `     <vertex x="${fmtCoord(positions[i]!)}" y="${fmtCoord(positions[i + 1]!)}" z="${fmtCoord(positions[i + 2]!)}"/>\n`;
  }
  const numTri = indices.length / 3;
  const triangles: string[] = new Array<string>(numTri);
  for (let t = 0, i = 0; t < numTri; t++, i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    if (a >= numVert || b >= numVert || c >= numVert) {
      throw new Error(`${obj.name}: triangle ${t} refers to a vertex beyond ${numVert}`);
    }
    triangles[t] = `     <triangle v1="${a}" v2="${b}" v3="${c}"/>\n`;
  }
  return [
    head.join(''),
    vertices.join(''),
    '    </vertices>\n    <triangles>\n',
    triangles.join(''),
    '    </triangles>\n   </mesh>\n  </object>\n',
  ];
}

/** The model part (`3D/3dmodel.model`) as UTF-8 chunks, one or more per object. */
function modelChunks(model: ThreeMfModel): Uint8Array[] {
  const { objects, materials, items, meta } = model;
  if (materials.length === 0) throw new Error('A 3MF needs at least one material');
  if (items.length === 0) throw new Error('A 3MF needs at least one build item');
  const head = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    `<model unit="millimeter" xml:lang="en-US" xmlns="${CORE_NS}" xmlns:openlamp="${OPENLAMP_3MF_NS}">\n`,
    metadataXml('Title', meta.title, ' '),
    metadataXml('Application', meta.application ?? 'openlamp', ' '),
  ];
  for (const [name, value] of Object.entries(meta.metadata ?? {})) {
    head.push(metadataXml(name, value, ' '));
  }
  head.push(' <resources>\n', `  <basematerials id="${MATERIALS_ID}">\n`);
  for (const m of materials) {
    head.push(`   <base name="${xmlEscape(m.name)}" displaycolor="${displayColour(m.colour)}"/>\n`);
  }
  head.push('  </basematerials>\n');

  const chunks = [strToU8(head.join(''))];
  const objectId = (i: number) => MATERIALS_ID + 1 + i;
  objects.forEach((obj, i) => {
    for (const part of objectXml(obj, objectId(i), materials.length)) chunks.push(strToU8(part));
  });

  const build = [' </resources>\n <build>\n'];
  for (const item of items) {
    if (!Number.isInteger(item.object) || item.object < 0 || item.object >= objects.length) {
      throw new Error(`A build item refers to object ${item.object} of ${objects.length}`);
    }
    const partNumber =
      item.partNumber === undefined ? '' : ` partnumber="${xmlEscape(item.partNumber)}"`;
    build.push(
      `  <item objectid="${objectId(item.object)}" transform="${threeMfTransform(item.transform)}"${partNumber}/>\n`,
    );
  }
  build.push(' </build>\n</model>\n');
  chunks.push(strToU8(build.join('')));
  return chunks;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const c of chunks) length += c.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="${THREEMF_MODEL_CONTENT_TYPE}"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/${THREEMF_MODEL_PATH}" Id="rel0" Type="${MODEL_REL}"/>
</Relationships>
`;

/**
 * A 3MF package (core spec): `[Content_Types].xml`, `_rels/.rels` and
 * `3D/3dmodel.model` in millimetres, deflated (level 6). Object ids start at 2
 * (1 is the material group), in the order of `objects`. Throws on a malformed
 * mesh, a bad colour or an index out of range.
 */
export function write3mf(model: ThreeMfModel): Uint8Array<ArrayBuffer> {
  const zip = zipFiles(
    [
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: '_rels/.rels', data: RELS },
      { name: THREEMF_MODEL_PATH, data: concat(modelChunks(model)) },
    ],
    6,
  );
  return new Uint8Array(zip);
}

// ---------------------------------------------------------------- meshes

/** What `meshFor3mf` reads of a manifold-3d `Mesh`. */
export interface ExportMeshLike {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  mergeFromVert?: Uint32Array | undefined;
  mergeToVert?: Uint32Array | undefined;
}

/**
 * A manifold-3d mesh as an indexed 3MF mesh: positions only, and the vertices
 * manifold split for differing properties (`mergeFromVert` → `mergeToVert`)
 * merged again, so the triangles share their edges and the mesh stays closed.
 * Merged-away vertices are dropped. The buffers are fresh copies.
 */
export function meshFor3mf(mesh: ExportMeshLike): ThreeMfMesh & {
  positions: Float32Array;
  indices: Uint32Array;
} {
  const { numProp, vertProperties, triVerts } = mesh;
  if (numProp < 3 || vertProperties.length % numProp !== 0) {
    throw new Error(`Malformed mesh: ${vertProperties.length} properties, ${numProp} per vertex`);
  }
  const numVert = vertProperties.length / numProp;
  const from = mesh.mergeFromVert ?? new Uint32Array(0);
  const to = mesh.mergeToVert ?? new Uint32Array(0);
  // Union-find over the merge pairs; each group keeps its smallest vertex index.
  const target = new Uint32Array(numVert);
  for (let v = 0; v < numVert; v++) target[v] = v;
  const root = (v: number): number => {
    let r = v;
    while (target[r] !== r) r = target[r]!;
    for (let x = v; target[x] !== r;) {
      const next = target[x]!;
      target[x] = r;
      x = next;
    }
    return r;
  };
  for (let i = 0; i < Math.min(from.length, to.length); i++) {
    const a = from[i]!;
    const b = to[i]!;
    if (a >= numVert || b >= numVert)
      throw new Error('Malformed mesh: a merge beyond the vertices');
    const ra = root(a);
    const rb = root(b);
    if (ra < rb) target[rb] = ra;
    else if (rb < ra) target[ra] = rb;
  }
  // The new index of every vertex that stays.
  const newIndex = new Int32Array(numVert).fill(-1);
  let kept = 0;
  for (let v = 0; v < numVert; v++) {
    target[v] = root(v);
    if (target[v] === v) newIndex[v] = kept++;
  }
  const positions = new Float32Array(kept * 3);
  for (let v = 0; v < numVert; v++) {
    const n = newIndex[v]!;
    if (n < 0) continue;
    positions[n * 3] = vertProperties[v * numProp]!;
    positions[n * 3 + 1] = vertProperties[v * numProp + 1]!;
    positions[n * 3 + 2] = vertProperties[v * numProp + 2]!;
  }
  const indices = new Uint32Array(triVerts.length);
  for (let i = 0; i < triVerts.length; i++) {
    const v = triVerts[i]!;
    if (v >= numVert) throw new Error(`Malformed mesh: triangle corner ${i} beyond the vertices`);
    indices[i] = newIndex[target[v]!]!;
  }
  return { positions, indices };
}

// ---------------------------------------------------------------- the lamp's plate

/** A built part for the 3MF: its spec, its mesh in the print frame and the mesh's bounding box. */
export interface Built3mfPart {
  part: Pick<PartSpec, 'id' | 'displayName' | 'colour' | 'instances' | 'bedFootprint'>;
  mesh: ThreeMfMesh;
  /** Bounding box of `mesh` (print frame). */
  bbox: BBox;
}

export interface Lamp3mfOptions {
  /** The project name (the model's `Title`). */
  title: string;
  /** The printer, written as `openlamp:printer`. */
  printerName?: string | undefined;
  /** A link that reopens the project, written as `openlamp:share`. */
  shareUrl?: string | undefined;
}

/** `Stem segment ×3` → `Stem segment`: the name of one copy of a part with `instances` copies. */
function copyBaseName(displayName: string, instances: number): string {
  const suffix = ` ×${instances}`;
  return instances > 1 && displayName.endsWith(suffix)
    ? displayName.slice(0, -suffix.length)
    : displayName;
}

/** The name of copy `instance` (0-based): the part's name, then `… #2`, `… #3`. */
export function copyName(displayName: string, instances: number, instance: number): string {
  const base = copyBaseName(displayName, instances);
  return instance === 0 ? base : `${base} #${instance + 1}`;
}

const key = (id: string, instance: number) => `${id}\u0000${instance}`;

/**
 * Print frame → bed of one copy: centre the mesh's bounding box on the origin
 * (x, y) with its bottom at z 0, turn it 90° about z if `rotated`, move it to
 * (x, y). Exact for the quarter turn (no cos 90° rounding noise).
 */
export function plateTransform(bbox: BBox, x: number, y: number, rotated: boolean): Mat4 {
  const cx = (bbox.min[0] + bbox.max[0]) / 2;
  const cy = (bbox.min[1] + bbox.max[1]) / 2;
  const [c, s] = rotated ? [0, 1] : [1, 0];
  // T(x, y, −zmin) · Rz · T(−cx, −cy, 0)
  const tx = x - (c * cx - s * cy);
  const ty = y - (s * cx + c * cy);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, tx, ty, -bbox.min[2], 1];
}

/**
 * The 3MF model of a lamp: one object per part (named by its `displayName`,
 * coloured by one base material per distinct colour, in the order the colours
 * first appear), one build item per copy placed by `layout.placements` (the
 * copies of a part named `Name`, `Name #2`, …). Copies the layout could not fit
 * (re-derived with `packParts` from the parts' bed footprints, as `assemble`
 * packed them) lie beside the bed in a column at +x, front to back, and their
 * object carries `openlamp:overflow`. The bed size goes into `openlamp:bed`.
 */
export function lamp3mfModel(
  parts: readonly Built3mfPart[],
  layout: Layout,
  options: Lamp3mfOptions,
): ThreeMfModel {
  const [bedX, bedY, bedZ] = layout.bed;
  const materials: ThreeMfMaterial[] = [];
  const materialOf = new Map<string, number>();
  const objectOf = new Map<string, number>();
  const objects: ThreeMfObject[] = parts.map((b, i) => {
    const colour = displayColour(b.part.colour);
    let material = materialOf.get(colour);
    if (material === undefined) {
      material = materials.length;
      materialOf.set(colour, material);
      materials.push({ name: `Colour ${material + 1} (${colour.slice(0, 7)})`, colour });
    }
    if (objectOf.has(b.part.id)) throw new Error(`Two parts with the id ${b.part.id}`);
    objectOf.set(b.part.id, i);
    return { name: b.part.displayName, mesh: b.mesh, material };
  });

  const { unplaced } = packParts(
    parts.map(({ part }) => ({
      id: part.id,
      x: part.bedFootprint?.x ?? 0,
      y: part.bedFootprint?.y ?? 0,
      instances: part.instances,
    })),
    layout.bed,
  );
  const outside = new Set([...unplaced].map((p) => key(p.id, p.instance)));

  const items: ThreeMfItem[] = [];
  const overflowing = new Set<number>();
  let sideY = 0;
  for (const p of layout.placements) {
    const index = objectOf.get(p.id);
    if (index === undefined) throw new Error(`The layout places ${p.id}, which is not exported`);
    const built = parts[index]!;
    let { x, y } = p;
    if (outside.has(key(p.id, p.instance))) {
      x = bedX + BESIDE_BED_GAP + p.width / 2;
      y = sideY + p.depth / 2;
      sideY += p.depth + BESIDE_BED_GAP;
      overflowing.add(index);
    }
    items.push({
      object: index,
      transform: plateTransform(built.bbox, x, y, p.rotated),
      partNumber: copyName(built.part.displayName, built.part.instances, p.instance),
    });
  }
  const placed = new Set(layout.placements.map((p) => p.id));
  const missing = parts.find((b) => !placed.has(b.part.id));
  if (missing) throw new Error(`The layout has no place for ${missing.part.id}`);

  for (const index of overflowing) {
    const f = parts[index]!.part.bedFootprint;
    const fitsAlone =
      f !== undefined && ((f.x <= bedX && f.y <= bedY) || (f.y <= bedX && f.x <= bedY));
    const why = fitsAlone
      ? `Does not fit the ${bedX} × ${bedY} mm bed together with the other parts: placed beside it, print it on a plate of its own`
      : `Larger than the ${bedX} × ${bedY} mm bed: placed beside it`;
    objects[index] = { ...objects[index]!, metadata: { 'openlamp:overflow': why } };
  }

  const metadata: Record<string, string> = { 'openlamp:bed': `${bedX} ${bedY} ${bedZ}` };
  if (options.printerName) metadata['openlamp:printer'] = options.printerName;
  if (options.shareUrl) metadata['openlamp:share'] = options.shareUrl;
  return { objects, materials, items, meta: { title: options.title, metadata } };
}

/** `write3mf(lamp3mfModel(…))`: the lamp's 3MF package. */
export function writeLamp3mf(
  parts: readonly Built3mfPart[],
  layout: Layout,
  options: Lamp3mfOptions,
): Uint8Array<ArrayBuffer> {
  return write3mf(lamp3mfModel(parts, layout, options));
}
