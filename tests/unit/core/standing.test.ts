/**
 * The standing lamp mount. STUB until step M2.2b, which owns this file and replaces
 * these tests with the real ones (its parts, joints, placement and context).
 */
import { describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { createDefaultProject, defaultMount } from '@core/model/project.ts';

describe('the standing lamp (stub)', () => {
  it('assembles the hub and the shade with an info that its parts are pending', () => {
    const p = createDefaultProject({ id: 'test', updatedAt: '2026-10-21T00:00:00.000Z' });
    p.mount = defaultMount('standing');
    const a = assemble(p);
    expect(a.parts.map((x) => x.id)).toEqual(['hub', 'shade']);
    const hub = a.parts[0]!;
    if (hub.kind !== 'hub') throw new Error('no hub');
    expect(hub.params.mountFace.kind).toBe('threadFemale');
    expect(a.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
    expect(a.warnings).toContainEqual(
      expect.objectContaining({ severity: 'info', code: 'mount-pending', paramPath: 'mount.kind' }),
    );
    expect(a.warnings.find((w) => w.code === 'mount-pending')!.message).toContain(
      'arrive in a later step',
    );
    expect(a.context.kind).toBe('floor');
  });
});
