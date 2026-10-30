import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { validateGeometry } from '@core/assembly/validate.ts';
import { partFileName, slugify } from '@core/export/naming.ts';
import { buildPart } from '@core/geometry/build.ts';
import { dispose, liveObjects, type Kernel, type Manifold } from '@core/geometry/kernel.ts';
import { meshToBuffers, renderBuffers, type MeshBuffers } from '@core/geometry/mesh.ts';
import { createDefaultProject } from '@core/model/project.ts';
import { getKernel, trackKernelObjects } from '../../helpers/kernel.ts';

let k: Kernel;
let tracker: ReturnType<typeof trackKernelObjects>;
let shade: Manifold;
let triangles: number;

beforeAll(async () => {
  k = await getKernel();
  tracker = trackKernelObjects(k);
  // The default classic shade at draft quality, as the worker builds it.
  const part = assemble(createDefaultProject(), { quality: 'draft' }).parts[0]!;
  expect(part.params.quality).toBe('draft');
  const built = buildPart(k, part); // quality from the part's params
  expect(built.stats.status).toBe('NoError');
  shade = built.manifold;
  triangles = built.stats.triangles;
});

afterAll(() => {
  dispose(shade);
  tracker.restore();
});

/** Shape checks every buffer set must pass. */
function expectWellFormed(b: MeshBuffers, numVert: number): void {
  expect(b.positions.length).toBe(numVert * 3);
  expect(b.indices.length).toBe(triangles * 3);
  let maxIndex = 0;
  for (const i of b.indices) maxIndex = Math.max(maxIndex, i);
  expect(maxIndex).toBeLessThan(numVert);
}

/** |n| for every `step`-th vertex. */
function sampleLengths(normals: Float32Array, step = 97): number[] {
  const out: number[] = [];
  for (let v = 0; v < normals.length / 3; v += step) {
    out.push(Math.hypot(normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!));
  }
  return out;
}

describe('meshToBuffers', () => {
  it('splits a mesh with normals (numProp 6) into positions and unit normals', () => {
    const withNormals = shade.calculateNormals(0, 30);
    try {
      const mesh = withNormals.getMesh(0);
      expect(mesh.numProp).toBe(6);
      const b = meshToBuffers(mesh);
      expect(b.normals).toBeDefined();
      expect(b.normals!.length).toBe(b.positions.length);
      expectWellFormed(b, mesh.numVert);
      for (const len of sampleLengths(b.normals!)) expect(len).toBeCloseTo(1, 4);
      // Positions are the first three properties, in order.
      expect(Array.from(b.positions.subarray(0, 3))).toEqual(
        Array.from(mesh.vertProperties.subarray(0, 3)),
      );
      expect(Array.from(b.normals!.subarray(3, 6))).toEqual(
        Array.from(mesh.vertProperties.subarray(9, 12)),
      );
    } finally {
      withNormals.delete();
    }
  });

  it('returns positions only for a mesh without normals (numProp 3)', () => {
    const mesh = shade.getMesh();
    expect(mesh.numProp).toBe(3);
    const b = meshToBuffers(mesh);
    expect(b.normals).toBeUndefined();
    expect('normals' in b).toBe(false);
    expectWellFormed(b, mesh.numVert);
    expect(b.positions).toEqual(mesh.vertProperties);
    expect(b.positions.buffer).not.toBe(mesh.vertProperties.buffer); // a copy, safe to transfer
  });

  it('de-interleaves extra properties and ignores those past the normal', () => {
    const mesh = {
      numProp: 7,
      vertProperties: new Float32Array([
        ...[1, 2, 3, 0, 0, 1, 9],
        ...[4, 5, 6, 1, 0, 0, 9],
        ...[7, 8, 9, 0, 1, 0, 9],
      ]),
      triVerts: new Uint32Array([0, 1, 2]),
    };
    const b = meshToBuffers(mesh);
    expect(Array.from(b.positions)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Array.from(b.normals!)).toEqual([0, 0, 1, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(b.indices)).toEqual([0, 1, 2]);
    expect(() => meshToBuffers({ ...mesh, numProp: 2 })).toThrow(/Malformed/);
    expect(() => meshToBuffers({ ...mesh, numProp: 4 })).toThrow(/Malformed/);
  });
});

describe('renderBuffers', () => {
  it('computes smooth unit normals and frees its temporary copy', () => {
    const liveBefore = liveObjects();
    const kernelBefore = tracker.live();
    const b = renderBuffers(shade);
    expect(tracker.live()).toBe(kernelBefore);
    expect(liveObjects()).toBe(liveBefore);
    // Smooth normals: one per position vertex, nothing split.
    expectWellFormed(b, shade.numVert());
    expect(b.normals.length).toBe(b.positions.length);
    for (const len of sampleLengths(b.normals)) expect(len).toBeCloseTo(1, 4);
  });
});

describe('validateGeometry', () => {
  it('reports a manifold error status as an error', () => {
    const part = { id: 'shade', displayName: 'Shade' };
    expect(validateGeometry(part, { status: 'NoError' })).toEqual([]);
    const [w, ...rest] = validateGeometry(part, { status: 'NotManifold' });
    expect(rest).toEqual([]);
    expect(w).toMatchObject({ severity: 'error', code: 'geometry-status', partId: 'shade' });
    expect(w!.message).toContain('NotManifold');
  });
});

describe('partFileName', () => {
  it('is openlamp-<project slug>-<part id>.<ext>', () => {
    expect(partFileName({ name: 'Bell (default)' }, { id: 'shade' }, 'stl')).toBe(
      'openlamp-bell-default-shade.stl',
    );
    expect(partFileName({ name: 'Wide & shallow' }, { id: 'shade' }, '3mf')).toBe(
      'openlamp-wide-shallow-shade.3mf',
    );
  });

  it('falls back to the project id, then to "project"', () => {
    expect(partFileName({ name: '✨', id: 'lamp-abc123' }, { id: 'shade' }, 'stl')).toBe(
      'openlamp-lamp-abc123-shade.stl',
    );
    expect(partFileName({ name: '' }, { id: 'shade' }, 'stl')).toBe('openlamp-project-shade.stl');
    expect(slugify('  Über -- Lamp!  ')).toBe('uber-lamp');
  });

  it.each([
    ['Måne', 'mane'],
    ['Bølge', 'bolge'],
    ['Lærke', 'laerke'],
    ['Glød', 'glod'],
    ['Væv', 'vaev'],
    ['Å Ä Æ Ø Ö', 'a-a-ae-o-o'],
    ['Ma\u030ane', 'mane'],
  ])('keeps %s recognizable in ASCII export filenames', (name, slug) => {
    expect(partFileName({ name }, { id: 'shade' }, 'stl')).toBe(`openlamp-${slug}-shade.stl`);
  });
});
