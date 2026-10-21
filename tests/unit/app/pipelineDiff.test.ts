import { describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { createDefaultProject } from '@core/model/project.ts';
import type { PartSpec } from '@core/model/assembly.ts';
import { diffParts } from '../../../src/app/worker/pipelineDiff.ts';

const project = createDefaultProject({ id: 'diff' });
const normal = assemble(project, { quality: 'normal' }).parts;
const draft = assemble(project, { quality: 'draft' }).parts;
const shade = normal[0]!;
const ids = (parts: readonly PartSpec[]) => parts.map((p) => p.id);

describe('diffParts', () => {
  it('builds every part on the first run', () => {
    const diff = diffParts(normal, {});
    expect(ids(diff.build)).toEqual(['shade']);
    expect(diff.unchanged).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('skips a part whose displayed geometry has its hash', () => {
    const diff = diffParts(normal, { shade: { readyHash: shade.hash } });
    expect(diff.build).toEqual([]);
    expect(ids(diff.unchanged)).toEqual(['shade']);
  });

  it('rebuilds a part whose hash changed (here: draft quality while dragging)', () => {
    expect(draft[0]!.hash).not.toBe(shade.hash);
    const diff = diffParts(draft, { shade: { readyHash: shade.hash } });
    expect(ids(diff.build)).toEqual(['shade']);
  });

  it('does not count a build in flight as done', () => {
    // Requested but never displayed: the client drops superseded generations.
    const diff = diffParts(normal, { shade: {} });
    expect(ids(diff.build)).toEqual(['shade']);
  });

  it('reports parts that left the assembly', () => {
    const diff = diffParts(normal, { shade: { readyHash: shade.hash }, stem: { readyHash: 'x' } });
    expect(diff.removed).toEqual(['stem']);
  });
});
