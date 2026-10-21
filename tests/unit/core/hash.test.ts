import { describe, expect, it } from 'vitest';
import { canonicalJson, cyrb53 } from '@core/hash.ts';

describe('canonicalJson', () => {
  it('does not depend on key order', () => {
    const a = {
      kind: 'classicShade',
      params: { height: 120, curve: 0.25, nested: { b: 1, a: [3, 2] } },
    };
    const b = {
      params: { nested: { a: [3, 2], b: 1 }, curve: 0.25, height: 120 },
      kind: 'classicShade',
    };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe(
      '{"kind":"classicShade","params":{"curve":0.25,"height":120,"nested":{"a":[3,2],"b":1}}}',
    );
  });

  it('ignores float noise of 1e-6', () => {
    const exact = { curve: 0.25, height: 120, twist: -25, wall: 0.8 };
    const noisy = { curve: 0.25 + 1e-6, height: 120 - 1e-6, twist: -25 + 1e-6, wall: 0.1 * 8 };
    expect(canonicalJson(noisy)).toBe(canonicalJson(exact));
  });

  it('still sees changes above 1e-4', () => {
    expect(canonicalJson({ curve: 0.25 })).not.toBe(canonicalJson({ curve: 0.2502 }));
  });

  it('drops undefined members and normalises -0 and non-finite numbers', () => {
    expect(canonicalJson({ b: -0, a: [1, undefined, NaN], c: undefined })).toBe(
      '{"a":[1,null,null],"b":0}',
    );
  });
});

describe('cyrb53', () => {
  it('matches the reference implementation', () => {
    expect(parseInt(cyrb53('a'), 16)).toBe(7929297801672961);
    expect(parseInt(cyrb53('revenge'), 16)).toBe(4051478007546757);
  });

  it('returns 14 hex digits', () => {
    expect(cyrb53('')).toMatch(/^[0-9a-f]{14}$/);
    expect(cyrb53('{"kind":"classicShade"}')).toMatch(/^[0-9a-f]{14}$/);
  });
});
