/**
 * Part identity: canonical JSON of the resolved parameters (the cache key) and
 * a short, fast, non-cryptographic hash of it (file names, mesh identity).
 */

/** Numbers are rounded to 1 / NUMBER_SCALE so float noise does not change a key. */
const NUMBER_SCALE = 1e4;

function canonical(value: unknown): unknown {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Integer ÷ 10⁴ is the double nearest to that decimal, so it prints short.
    const rounded = Math.round(value * NUMBER_SCALE) / NUMBER_SCALE;
    return rounded === 0 ? 0 : rounded; // no -0
  }
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : canonical(v)));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined && typeof v !== 'function') out[key] = canonical(v);
    }
    return out;
  }
  return value;
}

/**
 * Deterministic JSON: object keys sorted, numbers rounded to 1e-4 (non-finite
 * numbers become null), undefined members dropped. Equal for values that only
 * differ in key order or float noise.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value)) ?? 'null';
}

/**
 * cyrb53 (public domain, bryc): a 53-bit string hash, returned as 14 hex digits.
 */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}
