/**
 * The light-on view's decisions (viewport/lightMode.ts): which mode the
 * viewport renders in, which material kind each part gets (mode + shade role
 * + colour), where the point light sits, and the store's toggles.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { assemble } from '@core/assembly/assemble.ts';
import { shadeRoleOfPart } from '@core/assembly/shades/common.ts';
import { parseProject, type Project } from '@core/model/project.ts';
import { prefersSimpleLight, useUiStore } from '../../../src/app/store/uiStore.ts';
import {
  SOURCE_OFFSET,
  isLightColour,
  lightMaterialKind,
  lightModeOf,
  lightSourceZ,
  lumaOf,
} from '../../../src/app/viewport/lightMode.ts';

const example = (id: string): Project =>
  parseProject(
    readFileSync(new URL(`../../../src/examples/${id}.lamp.json`, import.meta.url), 'utf8'),
  );

describe('the light mode', () => {
  it('is off unless the light is on, and never in the bed view', () => {
    expect(lightModeOf(false, false, false)).toBe('off');
    expect(lightModeOf(false, true, false)).toBe('off');
    expect(lightModeOf(true, false, false)).toBe('physical');
    expect(lightModeOf(true, true, false)).toBe('simple');
    expect(lightModeOf(true, false, true)).toBe('off');
    expect(lightModeOf(true, true, true)).toBe('off');
  });
});

describe('the material kind of a part', () => {
  it('is standard with the light off, whatever the part', () => {
    for (const role of ['outer', 'inner', undefined] as const) {
      expect(lightMaterialKind('off', role, '#ffffff')).toBe('standard');
    }
  });

  it('lets the light through an outer shade: transmission, or translucent in the simple mode', () => {
    for (const colour of ['#ffffff', '#f3ede4', '#1f1f23', '#b98a52']) {
      expect(lightMaterialKind('physical', 'outer', colour)).toBe('transmission');
      expect(lightMaterialKind('simple', 'outer', colour)).toBe('translucent');
    }
  });

  it('makes a light inner shade a reflector and a dark one like an outer shade', () => {
    for (const mode of ['physical', 'simple'] as const) {
      expect(lightMaterialKind(mode, 'inner', '#ffffff')).toBe('reflective');
      expect(lightMaterialKind(mode, 'inner', '#f3ede4')).toBe('reflective');
    }
    expect(lightMaterialKind('physical', 'inner', '#1f1f23')).toBe('transmission');
    expect(lightMaterialKind('simple', 'inner', '#1f1f23')).toBe('translucent');
    expect(lightMaterialKind('physical', 'inner', '#b98a52')).toBe('transmission');
  });

  it('keeps everything that is not a shade’s standard', () => {
    for (const mode of ['physical', 'simple'] as const) {
      expect(lightMaterialKind(mode, undefined, '#ffffff')).toBe('standard');
    }
  });

  it('tells light from dark colours by their luma', () => {
    expect(lumaOf('#ffffff')).toBeCloseTo(1, 9);
    expect(lumaOf('#000000')).toBe(0);
    expect(lumaOf('#fff')).toBeCloseTo(1, 9);
    expect(lumaOf('not a colour')).toBe(0);
    expect(isLightColour('#d9d4cb')).toBe(true);
    expect(isLightColour('#808080')).toBe(false);
    expect(isLightColour('#1f1f23')).toBe(false);
  });

  it('picks per part of the two-tone bell: hub standard, black outer through, white inner reflecting', () => {
    const a = assemble(example('two-tone-bell'), { quality: 'draft' });
    const kinds = Object.fromEntries(
      a.parts.map((p) => [p.id, lightMaterialKind('physical', shadeRoleOfPart(p.id), p.colour)]),
    );
    expect(kinds).toMatchObject({
      hub: 'standard',
      shade: 'transmission',
      innerShade: 'reflective',
      canopy: 'standard',
    });
  });

  it('gives every tier and spacer of a tiered shade its shade’s material', () => {
    const a = assemble(example('ph-layered'), { quality: 'draft' });
    for (const p of a.parts.filter((x) => x.kind === 'tier' || x.kind === 'spacer')) {
      expect(lightMaterialKind('simple', shadeRoleOfPart(p.id), p.colour), p.id).toBe(
        'translucent',
      );
    }
  });
});

describe('the point light', () => {
  const puck = { kind: 'puck', z: 30, diameter: 59, height: 8 } as const;

  it('sits in front of a puck’s light face: below it hanging, above it standing', () => {
    expect(lightSourceZ(puck, -1)).toBeCloseTo(30 - SOURCE_OFFSET, 9);
    expect(lightSourceZ(puck, 1)).toBeCloseTo(38 + SOURCE_OFFSET, 9);
  });

  it('sits in the centre of a bulb’s glass, toward its far end from the cap', () => {
    const hanging = {
      kind: 'bulb',
      z: -50,
      capZ: 0,
      diameter: 60,
      length: 110,
      capDiameter: 27,
    } as const;
    expect(lightSourceZ(hanging, -1)).toBeCloseTo(-80, 9);
    const standing = { ...hanging, z: 50, capZ: 0 } as const;
    expect(lightSourceZ(standing, 1)).toBeCloseTo(80, 9);
  });

  it('sits in front of a strip ring’s face', () => {
    const strip = { kind: 'strip', z: 5, ringDiameter: 120, width: 10, thickness: 2 } as const;
    expect(lightSourceZ(strip, -1)).toBeCloseTo(5 - 1 - SOURCE_OFFSET, 9);
    expect(lightSourceZ(strip, 1)).toBeCloseTo(5 + 1 + SOURCE_OFFSET, 9);
  });
});

describe('the light toggles in the view store', () => {
  beforeEach(() => useUiStore.setState({ lightOn: false, simpleLight: false }));

  it('toggles the light (the "L" key) and sets the simple preview', () => {
    const s = useUiStore.getState();
    s.toggleLightOn();
    expect(useUiStore.getState().lightOn).toBe(true);
    s.toggleLightOn();
    expect(useUiStore.getState().lightOn).toBe(false);
    s.setLightOn(true);
    s.setSimpleLight(true);
    expect(useUiStore.getState()).toMatchObject({ lightOn: true, simpleLight: true });
  });

  it('starts with the simple preview only on machines with 4 or fewer cores', () => {
    const cores = typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;
    expect(prefersSimpleLight()).toBe(typeof cores === 'number' && cores > 0 && cores <= 4);
  });
});
