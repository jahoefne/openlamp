import { describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { autoCollarDiameter, minShadeTopDiameter } from '@core/assembly/interfaces.ts';
import { layoutParts } from '@core/assembly/layout.ts';
import { lightEnvelope } from '@core/assembly/lights/index.ts';
import { classicShadeFootprint, derive } from '@core/geometry/parts/classicShade.ts';
import { deriveHub } from '@core/geometry/parts/hub.ts';
import { deriveRevolvedShade } from '@core/geometry/parts/shades/revolved.ts';
import {
  IDENTITY,
  SHADE_JOINT_TYPES,
  type Assembly,
  type PartSpec,
  type Placement,
} from '@core/model/assembly.ts';
import type { FusedShadeParams, HubParams, RevolvedShadeParams } from '@core/model/parts.ts';
import { createDefaultProject, projectToClassicParams, type Project } from '@core/model/project.ts';
import { normalizeClassicShade } from '@core/schema/normalize.ts';
import { findPrinter } from '@core/schema/printers.ts';

function project(printerId = 'bambu-a1', edit: (p: Project) => void = () => {}): Project {
  const p = createDefaultProject({
    id: 'test',
    name: 'Test',
    updatedAt: '2026-10-21T00:00:00.000Z',
  });
  p.printer = findPrinter(printerId)!;
  edit(p);
  return p;
}

const wide = (p: Project) => {
  p.shades[0].style.bottomDiameter = 240;
};

const split = (p: Project) => {
  p.hub.fused = false;
};

/** The fused shade's params (the default project has exactly this one part). */
function fusedParams(part: PartSpec | undefined): FusedShadeParams {
  if (part?.kind !== 'shade' || part.params.variant !== 'fused') throw new Error('not fused');
  return part.params;
}

function hubParams(a: Assembly): HubParams {
  const part = a.parts.find((p) => p.id === 'hub');
  if (part?.kind !== 'hub') throw new Error('no hub');
  return part.params;
}

function shadeParams(a: Assembly): RevolvedShadeParams {
  const part = a.parts.find((p) => p.id === 'shade');
  if (part?.kind !== 'shade' || part.params.variant !== 'revolved') throw new Error('no shade');
  return part.params;
}

/** The assembly without the numbers that only restate the params (for snapshots). */
function summary(a: Assembly) {
  return {
    parts: a.parts.map(({ buildKey, ...part }) => ({ ...part, buildKeyLength: buildKey.length })),
    interfaces: a.interfaces,
    layout: a.layout,
    derived: a.derived,
    warnings: a.warnings,
  };
}

describe('assemble', () => {
  it('resolves the default project into one fused shade part', () => {
    const p = project();
    const a = assemble(p);
    expect(a.parts).toHaveLength(1);
    const part = a.parts[0]!;
    expect(part).toMatchObject({
      id: 'shade',
      kind: 'shade',
      displayName: 'Shade (fused)',
      instances: 1,
      colour: '#f4efe6',
    });
    const params = fusedParams(part);
    expect(params).toEqual({
      variant: 'fused',
      ...normalizeClassicShade(projectToClassicParams(p)).values,
    });
    expect(params.quality).toBe(p.quality.preview);
    expect(a.interfaces).toEqual({});
    expect(part.hash).toMatch(/^[0-9a-f]{14}$/);
    expect(part.assembledTransform).toEqual([...IDENTITY]);
    // Centred on the 256 mm bed.
    expect(part.printTransform.slice(12)).toEqual([128, 128, 0, 1]);
    expect(part.bedFootprint).toEqual(classicShadeFootprint(params));
    expect(part.bedFootprint!.x).toBeCloseTo(161.6, 6);
    expect(part.bedFootprint!.z).toBeCloseTo(derive(params).zTop, 9);
    expect(a.warnings).toEqual([]);
    // The viewport's ghosts and ceiling: the housing top and the puck on its ledge.
    const d = derive(params);
    expect(a.derived).toMatchObject({
      ceilingZ: d.zTop,
      puckZ: d.zFloor,
      bottomZ: 0,
      rBoss: d.rBoss,
    });
  });

  it('warns when a 240 mm shade does not fit an A1 mini', () => {
    const a = assemble(project('bambu-a1-mini', wide));
    const bedFit = a.warnings.filter((w) => w.code === 'bed-fit');
    expect(bedFit).toHaveLength(1);
    expect(bedFit[0]).toMatchObject({ severity: 'warning', partId: 'shade' });
    expect(bedFit[0]!.message).toContain('too large in X and Y');
    expect(a.parts[0]!.warnings).toEqual(bedFit);
    expect(a.layout.overflow).toEqual(['shade']);
  });

  it('has no bed-fit warning for the same shade on an A1', () => {
    const a = assemble(project('bambu-a1', wide));
    expect(a.warnings.filter((w) => w.code === 'bed-fit')).toEqual([]);
    expect(a.layout.overflow).toEqual([]);
  });

  it('reports a part that is too tall', () => {
    const a = assemble(
      project('bambu-a1-mini', (p) => {
        p.shades[0].style.height = 160;
      }),
    );
    expect(a.warnings.find((w) => w.code === 'bed-fit')?.message).toContain('too large in Z');
  });

  it('gives identical buildKeys to projects that differ only in name and colour', () => {
    const a = assemble(project());
    const b = assemble(
      project('bambu-a1-mini', (p) => {
        p.id = 'other';
        p.name = 'Another lamp';
        p.shades[0].colour = '#123456';
        p.colours = { shade: '#ff0000' };
      }),
    );
    expect(b.parts[0]!.buildKey).toBe(a.parts[0]!.buildKey);
    expect(b.parts[0]!.hash).toBe(a.parts[0]!.hash);
    expect(b.parts[0]!.colour).toBe('#ff0000');
  });

  it('gives different buildKeys for different geometry or quality', () => {
    const base = assemble(project()).parts[0]!.buildKey;
    expect(assemble(project('bambu-a1', wide)).parts[0]!.buildKey).not.toBe(base);
    expect(assemble(project(), { quality: 'fine' }).parts[0]!.buildKey).not.toBe(base);
  });

  it('reports normalisation warnings with their project path', () => {
    const a = assemble(
      project('bambu-a1', (p) => {
        p.shades[0].style.topDiameter = 40;
      }),
    );
    expect(fusedParams(a.parts[0]).topDiameter).toBe(68);
    expect(a.warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['clamped', 'shades.0.style.topDiameter'],
      ['adjusted', 'shades.0.style.topDiameter'],
    ]);
  });

  it('uses the fit-test ring footprint in fit-test mode', () => {
    const a = assemble(
      project('bambu-a1', (p) => {
        p.fitTest = true;
      }),
    );
    expect(a.parts[0]!.displayName).toBe('Fit-test ring');
    expect(a.parts[0]!.bedFootprint!.y).toBeCloseTo(75, 6);
    expect(a.parts[0]!.bedFootprint!.z).toBeCloseTo(13.3, 6);
    // The ring is moved down to the bed; so are the ghosts.
    expect(a.derived.ceilingZ).toBeCloseTo(13.3, 6);
  });

  it('matches the fused snapshot', () => {
    expect(summary(assemble(project()))).toMatchSnapshot();
  });
});

describe('assemble (split into hub + shade)', () => {
  it('resolves a hub and a revolved shade joined by a bayonet', () => {
    const p = project('bambu-a1', split);
    const a = assemble(p);
    expect(a.parts.map((x) => [x.id, x.kind, x.displayName])).toEqual([
      ['hub', 'hub', 'Hub'],
      ['shade', 'shade', 'Shade'],
    ]);
    expect(a.warnings).toEqual([]);
    const iface = a.interfaces.shadeToHub!;
    expect(iface).toMatchObject({
      type: 'bayonet',
      male: 'shade',
      female: 'hub',
      length: 8,
      tolerance: 0.3,
      bayonet: { lugs: 3, lugWidth: 6, lugHeight: 2, lugDepth: 1.6, travel: 35 },
    });
    // Collar Ø = 2·(rCore + 1.5), rCore = the puck housing (29.5 + 0.7 + 2.4).
    expect(lightEnvelope(p.light).rCore).toBeCloseTo(32.6, 9);
    expect(iface.nominalDiameter).toBeCloseTo(68.2, 9);
    expect(iface.nominalDiameter).toBe(autoCollarDiameter(lightEnvelope(p.light)));
    // Both parts carry the same interface and collar.
    const hub = hubParams(a);
    const shade = shadeParams(a);
    expect(hub.joint).toEqual(iface);
    expect(shade.joint).toEqual(iface);
    expect(shade.collar).toEqual(hub.collar);
    expect(hub.collar).toMatchObject({ radius: 34.1, wall: 2 });
    expect(hub.collar.ringInnerRadius).toBeCloseTo(34.4, 9);
    expect(hub.collar.seatRadius).toBeCloseTo(38, 9);
    // The hub is the world frame; the shade hangs below with its collar plane at z 0.
    const sd = deriveRevolvedShade(shade);
    const hd = deriveHub(hub);
    expect(a.parts[0]!.assembledTransform).toEqual([...IDENTITY]);
    expect(a.parts[1]!.assembledTransform).toEqual([
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      -sd.zCollar,
      1,
    ]);
    expect(a.derived).toMatchObject({
      ceilingZ: hd.zTop,
      puckZ: hd.zFloor,
      bottomZ: -sd.zCollar,
      hubHeight: hd.hubHeight,
    });
    // Both parts are placed on the bed without overlapping.
    expect(a.layout.overflow).toEqual([]);
    expect(a.layout.placements.map((x) => x.id)).toEqual(['hub', 'shade']);
    // The hub's colour default; the shade keeps its own.
    expect(a.parts.map((x) => x.colour)).toEqual(['#d9d4cb', '#f4efe6']);
    expect(a.parts[1]!.printNotes.at(-1)).toContain('clockwise');
  });

  it.each(SHADE_JOINT_TYPES)('gives the %s joint its geometry defaults', (type) => {
    const a = assemble(
      project('bambu-a1', (p) => {
        split(p);
        p.joints.shadeToHub = type;
      }),
    );
    const iface = a.interfaces.shadeToHub!;
    expect(iface.type).toBe(type);
    if (type === 'thread') {
      expect(iface.thread).toEqual({ pitch: 2.5, depth: 0.8, flank: 45, hand: 'right' });
      expect(iface.tolerance).toBe(0.3);
    } else if (type === 'snap') {
      expect(iface.tolerance).toBeCloseTo(0.2, 9);
      expect(iface.snap!.ribHeight).toBeCloseTo(0.3, 9);
    } else {
      expect(iface.bayonet).toBeDefined();
    }
  });

  it('widens a shade whose top is too narrow for the hub ring, with a warning', () => {
    const a = assemble(
      project('bambu-a1', (p) => {
        split(p);
        p.shades[0].style.topDiameter = 70;
      }),
    );
    const shade = shadeParams(a);
    const min = Math.ceil(minShadeTopDiameter(shade.collar) - 1e-9);
    expect(min).toBe(78); // ring Ø 76 + 2
    expect(shade.topDiameter).toBe(min);
    expect(a.warnings.map((w) => [w.code, w.paramPath, w.partId])).toEqual([
      ['adjusted', 'shades.0.style.topDiameter', 'shade'],
    ]);
  });

  it('uses a larger collar diameter when the shade asks for one, never a smaller one', () => {
    const larger = assemble(
      project('bambu-a1', (p) => {
        split(p);
        p.shades[0].collarDiameter = 80;
      }),
    );
    expect(larger.interfaces.shadeToHub!.nominalDiameter).toBe(80);
    const smaller = assemble(
      project('bambu-a1', (p) => {
        split(p);
        p.shades[0].collarDiameter = 50;
      }),
    );
    expect(smaller.interfaces.shadeToHub!.nominalDiameter).toBeCloseTo(68.2, 9);
    expect(smaller.warnings.map((w) => w.paramPath)).toEqual(['shades.0.collarDiameter']);
  });

  it('clamps the hub and joint parameters with their project paths', () => {
    const a = assemble(
      project('bambu-a1', (p) => {
        split(p);
        p.joints.shadeToHub = 'thread';
        p.joints.threadPitch = 2;
        p.joints.threadDepth = 1.5;
        p.hub.collarWall = 9;
      }),
    );
    expect(a.warnings.map((w) => [w.code, w.paramPath])).toEqual([
      ['clamped', 'hub.collarWall'],
      ['adjusted', 'joints.threadDepth'],
    ]);
    expect(a.interfaces.shadeToHub!.thread!.depth).toBe(0.8);
    expect(hubParams(a).collar.wall).toBe(5);
  });

  it('keeps the shade and its buildKey when only the hub changes', () => {
    const base = assemble(project('bambu-a1', split));
    const hubOnly = assemble(
      project('bambu-a1', (p) => {
        split(p);
        p.hub.shoulderAngle = 60;
      }),
    );
    expect(hubOnly.parts[0]!.hash).not.toBe(base.parts[0]!.hash);
    expect(hubOnly.parts[1]!.hash).toBe(base.parts[1]!.hash);
  });

  it("prints the shade joint's test pair in fit-test mode", () => {
    const a = assemble(
      project('bambu-a1', (p) => {
        split(p);
        p.fitTest = true;
      }),
    );
    expect(a.parts.map((x) => [x.id, x.displayName])).toEqual([
      ['fitMale', 'Collar test piece'],
      ['fitFemale', 'Ring test piece'],
    ]);
    expect(Object.keys(a.interfaces)).toEqual(['shadeToHub']);
    expect(a.derived.bottomZ).toBe(-3);
  });

  it('matches the split snapshot', () => {
    expect(summary(assemble(project('bambu-a1', split)))).toMatchSnapshot();
  });
});

describe('layoutParts', () => {
  const overlaps = (a: Placement, b: Placement, gap: number) =>
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap - 1e-9 &&
    Math.abs(a.y - b.y) < (a.depth + b.depth) / 2 + gap - 1e-9;
  const inside = (p: Placement, bed: readonly number[]) =>
    p.x - p.width / 2 >= 0 &&
    p.y - p.depth / 2 >= 0 &&
    p.x + p.width / 2 <= bed[0]! &&
    p.y + p.depth / 2 <= bed[1]!;

  it('packs two footprints on one bed without overlap', () => {
    const bed = [256, 256, 256] as const;
    const layout = layoutParts(
      [
        { id: 'a', x: 120, y: 100 },
        { id: 'b', x: 80, y: 100 },
      ],
      bed,
    );
    expect(layout.overflow).toEqual([]);
    const [a, b] = layout.placements;
    expect([a!.id, b!.id]).toEqual(['a', 'b']);
    expect(overlaps(a!, b!, 10)).toBe(false);
    expect(inside(a!, bed) && inside(b!, bed)).toBe(true);
  });

  it('starts a new shelf when a row is full and reports what does not fit', () => {
    const bed = [256, 256, 256] as const;
    const layout = layoutParts(
      [
        { id: 'a', x: 150, y: 150 },
        { id: 'b', x: 150, y: 90 },
        { id: 'c', x: 150, y: 150 },
        { id: 'huge', x: 300, y: 100 },
      ],
      bed,
    );
    expect(layout.overflow).toEqual(['c', 'huge']);
    const placed = layout.placements.filter((p) => !layout.overflow.includes(p.id));
    expect(placed.map((p) => p.id)).toEqual(['a', 'b']);
    expect(overlaps(placed[0]!, placed[1]!, 10)).toBe(false);
    expect(placed.every((p) => inside(p, bed))).toBe(true);
    // Overflowing parts are still placed (centred) so they can be exported.
    expect(layout.placements).toHaveLength(4);
  });

  it('turns a part 90° when only that fits', () => {
    const layout = layoutParts([{ id: 'a', x: 250, y: 150 }], [200, 300, 200]);
    expect(layout.overflow).toEqual([]);
    expect(layout.placements[0]).toMatchObject({ rotated: true, width: 150, depth: 250 });
  });

  it('places every copy of a part with instances on its own, without overlap', () => {
    const bed = [256, 256, 256] as const;
    const layout = layoutParts(
      [
        { id: 'a', x: 100, y: 60 },
        { id: 'seg', x: 30, y: 30, instances: 3 },
        { id: 'b', x: 50, y: 40 },
      ],
      bed,
    );
    expect(layout.overflow).toEqual([]);
    // Input order, the copies in order; single parts keep their id (instance 0).
    expect(layout.placements.map((p) => [p.id, p.instance])).toEqual([
      ['a', 0],
      ['seg', 0],
      ['seg', 1],
      ['seg', 2],
      ['b', 0],
    ]);
    const all = layout.placements;
    for (const [i, p] of all.entries()) {
      expect(inside(p, bed), `${p.id} #${p.instance}`).toBe(true);
      for (const q of all.slice(i + 1)) {
        expect(overlaps(p, q, 10), `${p.id} #${p.instance} / ${q.id} #${q.instance}`).toBe(false);
      }
    }
  });

  it('reports a part once in overflow when some of its copies do not fit', () => {
    const layout = layoutParts([{ id: 'seg', x: 120, y: 120, instances: 5 }], [256, 256, 256]);
    // Two by two fit the 256 mm bed, the fifth does not.
    expect(layout.placements).toHaveLength(5);
    expect(layout.overflow).toEqual(['seg']);
    expect(layout.placements.map((p) => p.instance)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('assemble (instances)', () => {
  it.each([
    ['fused', () => {}],
    ['split', split],
  ])('gives every %s part one instance transform, its assembled transform', (_name, edit) => {
    const a = assemble(project('bambu-a1', edit));
    for (const part of a.parts) {
      expect(part.instances, part.id).toBe(1);
      expect(part.instanceTransforms, part.id).toEqual([part.assembledTransform]);
    }
    // One placement per part, under its id.
    expect(a.layout.placements.map((p) => [p.id, p.instance])).toEqual(
      a.parts.map((p) => [p.id, 0]),
    );
  });
});
